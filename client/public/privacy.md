YT Catchup is a personal project built and run by one person, not a company. This page explains what data the app collects when you sign in with Google, why, and how to get rid of it.

## What this app can and can't do

Signing in grants YT Catchup **read-only** access to your YouTube subscriptions. It never posts, comments, uploads, or changes anything on your YouTube account. It also asks Google for your basic profile info (email, name) so it knows who's signed in.

## What gets stored

- Your Google account ID and email
- An encrypted copy of the refresh token Google issues, used to keep fetching your subscriptions' recent videos on your behalf, plus a short-lived access token
- Your YouTube subscription list (channel names and thumbnails), as of your last sync
- The per-channel display preferences you set
- Which videos you've marked watched
- Any custom lists you create
- A login session record, so you stay signed in for up to 30 days

Cached video metadata (titles, thumbnails, publish dates) is shared across everyone using the app and isn't tied to your account.

## How your data is protected

- Your Google refresh token is encrypted before it's stored, and is never stored or logged in plain text anywhere.
- All connections to this app are encrypted over HTTPS, including the login flow itself.
- Session cookies are configured as secure and httpOnly, meaning they're only ever transmitted over encrypted connections and can't be accessed by browser scripts.
- Only I, the sole developer of this app, have access to the underlying database and infrastructure. No third parties, contractors, or additional staff have access to your data.
- Application secrets (API keys, encryption keys) are stored as environment variables and are never committed to source code or exposed in the application's public repository.
- Your data is never sold, shared with advertisers, or used to train any AI model.

## How it's used

Solely to build your personal queue of recent uploads from the channels you're subscribed to. Nothing here is sold, shared with advertisers, or used to train any model.

## How long it's kept

- Your subscription list, watch history, preferences, and lists stick around as long as your account exists
- Logging out deletes your Google refresh token from the database immediately, so you'll sign in again next time
- Deleting your account (Settings → bottom of the page) revokes this app's Google access entirely and permanently deletes your account and everything tied to it
- Internal API usage logs, kept to stay within Google's request limits, are retained up to 365 days. Deleting your account disconnects these logs from your identity rather than deleting them outright, since they no longer identify you once that link is gone

## How to revoke access

- Use "Delete my account and data" in Settings, or
- Revoke access directly from your Google account at [myaccount.google.com/permissions](https://myaccount.google.com/permissions)

## YouTube API Services

This app uses YouTube API Services. By using it, you also agree to be bound by the [YouTube Terms of Service](https://www.youtube.com/t/terms).

This app's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

For how Google itself handles your data, see the [Google Privacy Policy](https://policies.google.com/privacy).

## Questions

Reach out on [GitHub](https://github.com/jeanbeanie) or [LinkedIn](https://www.linkedin.com/in/jeane-ramos-83339399/).
