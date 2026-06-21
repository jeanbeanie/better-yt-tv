import express from "express";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { requireAuth, type AuthedRequest } from "../auth/requireAuth.js";
import { decryptRefreshToken } from "../auth/crypto.js";
import { refreshAccessToken } from "../auth/google.js";
import { 
  fetchRecentVideosForChannel,
  upsertVideosCache,
  isChannelCacheStale,
  markChannelCacheRefreshed,
} from "../youtube/videos.js";

export const youtubeRouter = express.Router();

//shaped API response type to send to client
type YoutubeSubscription = {
  channelId: string;
  title: string;
  thumbnails?: { url: string };
  medium?: { url: string };
  high?: { url: string };
}

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

async function fetchYoutubeSubscriptions(accessToken: string): Promise<YoutubeSubscription[]> {
    // YouTube Data API: subscriptions.list
    const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "50");

    const ytResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!ytResponse.ok) {
      const text = await ytResponse.text();
      throw new Error(`YouTube API error: ${ytResponse.status} ${text}`);
    }

    const data:any = await ytResponse.json();

    // return response shaped into our YoutubeSubscription type
    return (data.items ?? [])
     .map((item: any) => ({
        channelId: item.snippet?.resourceId?.channelId,
        title: item.snippet?.title,
        thumbnails: item.snippet?.thumbnails,
      }))
      .filter((item: YoutubeSubscription) => Boolean(
        // Filter out malformed items so one bad row doesn't break everything
        item.channelId && item.title
      ));
}

// GET /api/youtube/subscriptions
youtubeRouter.get("/subscriptions", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;

    // get temporary Google access token for logged in user
    const accessToken = await getGoogleAccessToken(userId);
    
    // normalized subscriptions from YT
    const items = await fetchYoutubeSubscriptions(accessToken);

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// POST /api/youtube/sync-subscriptions
// fetches subs from YT and saved into DB
youtubeRouter.post("/sync-subscriptions", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;

    // get google access token for this user
    const accessToken = await getGoogleAccessToken(userId);

    // fetch subs from YT using access token
    const items = await fetchYoutubeSubscriptions(accessToken);

    // save into DB user_subscriptions so feed logic can use our own data model
    for (const item of items) {
      // if sub already exists, update instead of duplicating
      await pool.query(
        `
        insert into user_subscriptions (user_id, channel_id, channel_title)
        values ($1, $2, $3)
        on conflict (user_id, channel_id) do update
          set channel_title = excluded.channel_title
        `,
        [userId, item.channelId, item.title],
      );
      // Ensure this synced channel has a default preference row
      // Only create it if it does not already exist
      await pool.query(
        `
        insert into channel_preferences (
          user_id,
          channel_id,
          enabled_all,
          enabled_live,
          excluded_shorts
        )
        values ($1, $2, true, true, true)
        on conflict (user_id, channel_id) do nothing
        `,
        [userId, item.channelId],
      );
    }

    // return a tiny confirmation for the UI
    res.json({
      ok: true,
      syncedCount: items.length,
    });
  } catch (err) {
    next(err);
  }

});

// POST /api/youtube/refresh-all-cache
// Refresh recent videos for every subscribed channel
// whose cache is STALE and save into videos_cache
youtubeRouter.post("/refresh-all-cache", requireAuth, async (req, res, next) => {
  try {
     const userId = (req as AuthedRequest).userId;

    // Grab this user's saved subscriptions from our DB
    const subResult = await pool.query(
      `
      select channel_id
      from user_subscriptions
      where user_id = $1
      `,
      [userId],
    );

    const channelIds: string[] = subResult.rows.map((row) => row.channel_id);

    // If the user hasn't synced subscriptions yet, there's nothing to refresh
    if (channelIds.length === 0) {
      return res.json({
        ok: true,
        refreshedChannels: 0,
        skippedChannels: 0,
        cachedVideos: 0,
      });
    }

    let refreshedChannels = 0;
    let skippedChannels = 0;
    let cachedVideos = 0;

    // lazily request Google access token only if needed
    let accessToken: string | null = null;

    // fetch recent videos for each channel, upsert them into videos_cache
    for (const channelId of channelIds) {
      const stale = await isChannelCacheStale(channelId);

      // skip channels whose cache is still valid
      if(!stale) {
        skippedChannels += 1;
        continue;
      }

      // only fetch access token if at least one channels needs refreshing
      if(!accessToken) {
        accessToken = await getGoogleAccessToken(userId);
      }
      
      // fetch recent videos from YouTube for this stale channel
      const videos = await fetchRecentVideosForChannel({
        accessToken,
        channelId,
        maxResults: 10,
      });

      // save videos into cache table
      await upsertVideosCache(videos);

      // mark channel's cache state as fresh again
      await markChannelCacheRefreshed(channelId);

      refreshedChannels += 1;
      cachedVideos += videos.length;
    }

    return res.json({
      ok: true,
      refreshedChannels,
      skippedChannels,
      cachedVideos,
    });
  }  catch (err) {
    next(err);
  }
})
