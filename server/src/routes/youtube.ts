import express from "express";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthedRequest } from "../auth/requireAuth.js";
import { decryptRefreshToken } from "../auth/crypto.js";
import { refreshAccessToken } from "../auth/google.js";
import { withYoutubeReauthHandling } from "./youtubeAuthGuard.js";
import {
  fetchRecentVideosForChannel,
  upsertVideosCache,
  getChannelCacheState,
  markChannelCacheRefreshed,
} from "../youtube/videos.js";
import { recordQuotaUsage, type QuotaCallContext } from "../youtube/quota.js";
import { getAppSettings } from "../settings/appSettings.js";

export const youtubeRouter = express.Router();

//shaped API response type to send to client
type YoutubeSubscription = {
  channelId: string;
  title: string;
  thumbUrl: string | null;
}

/* HELPER FUNCTIONS */

// load and decrypt user's stored refresh token
async function getUserRefreshToken(userId: string){
    // look up refresh_token tied to currently logged in user
    const tokenResponse = await pool.query(
      `
      select refresh_token_ciphertext
      from oauth_tokens
      where user_id = $1
      `,
      [userId],
    );

    if (tokenResponse.rowCount === 0) {
      throw new Error("No OAuth tokens stored for this user.");
    }

    return decryptRefreshToken(
      tokenResponse.rows[0].refresh_token_ciphertext,
      env.TOKEN_ENCRYPTION_KEY,
    );
  
}

async function getGoogleAccessToken(userId:string) {
    const refreshToken = await getUserRefreshToken(userId);

    // send in decrypted refresh token to get a fresh Google Access Token
    const { access_token } = await refreshAccessToken({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken,
    });
    
    return access_token;
}

async function fetchYoutubeSubscriptions(
  accessToken: string,
  quotaContext?: QuotaCallContext,
): Promise<YoutubeSubscription[]> {
    // YouTube Data API: subscriptions.list
    // Follow nextPageToken until YouTube stops returning one, so accounts
    // with more than 50 subscriptions (the max per page) are fully synced.
    const results: YoutubeSubscription[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("mine", "true");
      url.searchParams.set("maxResults", "50");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const ytResponse = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // log quota usage for this page of results
      await recordQuotaUsage("subscriptions.list", 1, quotaContext ?? {});

      if (!ytResponse.ok) {
        const text = await ytResponse.text();
        throw new Error(`YouTube API error: ${ytResponse.status} ${text}`);
      }

      const data: any = await ytResponse.json();

      // shape this page's items into our YoutubeSubscription type
      const pageItems = (data.items ?? [])
        .map((item: any) => ({
          channelId: item.snippet?.resourceId?.channelId,
          title: item.snippet?.title,
          thumbUrl:
            item.snippet?.thumbnails?.medium?.url ??
            item.snippet?.thumbnails?.default?.url ??
            null,
        }))
        .filter((item: YoutubeSubscription) => Boolean(
          // Filter out malformed items so one bad row doesn't break everything
          item.channelId && item.title
        ));

      results.push(...pageItems);
      pageToken = data.nextPageToken;
    } while (pageToken);

    return results;
}

/* YOUTUBE ROUTE HANDLERS */

// POST /api/youtube/sync-subscriptions
// fetches subs from YT and saved into DB
youtubeRouter.post(
  "/sync-subscriptions",
  requireAuth,
  withYoutubeReauthHandling(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const requestGroupId = crypto.randomUUID();

    // get google access token for this user
    const accessToken = await getGoogleAccessToken(userId);

    // fetch subs from YT using access token
    const items = await fetchYoutubeSubscriptions(accessToken, {
      action: "sync-subscriptions",
      userId,
      requestGroupId,
    });

    // save into DB user_subscriptions so feed logic can use our own data model
    // Bulk upsert via unnest() + a CTE, rather than looping per item, so the
    // subscriptions insert and its default channel_preferences row are one
    // atomic statement (not two separately-committed queries) and the whole
    // sync is a single round trip regardless of subscription count.
    if (items.length > 0) {
      const channelIds = items.map((item) => item.channelId);
      const titles = items.map((item) => item.title);
      const thumbUrls = items.map((item) => item.thumbUrl);

      await pool.query(
        `
        with subs as (
          insert into user_subscriptions (user_id, channel_id, channel_title, channel_thumb_url)
          select $1, * from unnest($2::text[], $3::text[], $4::text[]) as t(channel_id, channel_title, channel_thumb_url)
          on conflict (user_id, channel_id) do update
            set channel_title = excluded.channel_title,
                channel_thumb_url = excluded.channel_thumb_url
          returning channel_id
        )
        insert into channel_preferences (user_id, channel_id, enabled_all, enabled_live, excluded_shorts)
        select $1, channel_id, true, true, true from subs
        on conflict (user_id, channel_id) do nothing
        `,
        [userId, channelIds, titles, thumbUrls],
      );
    }

    // return a tiny confirmation for the UI
    res.json({
      ok: true,
      syncedCount: items.length,
    });
  }),
);

// POST /api/youtube/refresh-all-cache
// Refresh recent videos for every subscribed channel
// whose cache is STALE and save into videos_cache
youtubeRouter.post(
  "/refresh-all-cache",
  requireAuth,
  withYoutubeReauthHandling(async (req, res) => {
     const userId = (req as AuthedRequest).userId;
     const manual = req.body?.manual === true;
     const action = manual ? "refresh-all-cache:manual" : "refresh-all-cache:auto";

    const settings = await getAppSettings();
    if (settings.refreshPaused) {
      return res.json({
        ok: true,
        refreshPaused: true,
        refreshedChannels: 0,
        skippedChannels: 0,
        failedChannels: 0,
        cachedVideos: 0,
      });
    }

    const requestGroupId = crypto.randomUUID();

    // Grab this user's saved subscriptions from our DB, skipping channels
    // that can never appear in any feed (enabled_all=false and not in a list)
    const subResult = await pool.query(
      `
      select us.channel_id
      from user_subscriptions us
      left join channel_preferences cp
        on cp.user_id = us.user_id
       and cp.channel_id = us.channel_id
      where us.user_id = $1
        and (
          coalesce(cp.enabled_all, true) = true
          or exists (
            select 1
            from list_channels lc
            join lists l on l.id = lc.list_id
            where l.user_id = us.user_id
              and lc.channel_id = us.channel_id
          )
        )
      `,
      [userId],
    );

    const channelIds: string[] = subResult.rows.map((row) => row.channel_id);

    // If the user hasn't synced subscriptions yet, there's nothing to refresh
    if (channelIds.length === 0) {
      return res.json({
        ok: true,
        refreshPaused: false,
        refreshedChannels: 0,
        skippedChannels: 0,
        failedChannels: 0,
        cachedVideos: 0,
      });
    }

    let refreshedChannels = 0;
    let skippedChannels = 0;
    let failedChannels = 0;
    let cachedVideos = 0;

    // lazily request Google access token only if needed
    let accessToken: string | null = null;

    // fetch recent videos for each channel, upsert them into videos_cache
    for (const channelId of channelIds) {
      const cacheState = await getChannelCacheState(channelId);

      // skip channels whose cache is still valid
      if(!cacheState.stale) {
        skippedChannels += 1;
        continue;
      }

      // only fetch access token if at least one channels needs refreshing
      if(!accessToken) {
        accessToken = await getGoogleAccessToken(userId);
      }

      try {
        // fetch recent videos from YouTube for this stale channel
        const { videos, uploadsPlaylistId } = await fetchRecentVideosForChannel({
          accessToken,
          channelId,
          cachedUploadsPlaylistId: cacheState.uploadsPlaylistId,
          maxResults: 20,
          quotaContext: { action, userId, requestGroupId },
        });

        // save videos into cache table
        await upsertVideosCache(videos);

        // mark channel's cache state as fresh again
        await markChannelCacheRefreshed(channelId, uploadsPlaylistId);

        refreshedChannels += 1;
        cachedVideos += videos.length;
      } catch (err) {
        // do not throw for one bad channel
        // treat it as refreshed so it waits the normal ttl before retrying
        console.error(`Failed to refresh channel ${channelId}:`, err);
        failedChannels += 1;
        await markChannelCacheRefreshed(channelId, cacheState.uploadsPlaylistId);
      }
    }

    return res.json({
      ok: true,
      refreshPaused: false,
      refreshedChannels,
      skippedChannels,
      failedChannels,
      cachedVideos,
    });
  }),
);
