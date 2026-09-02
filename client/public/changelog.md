## 2026-09-01

- Added a How your data is protected section to the privacy policy

## 2026-08-27

- Renamed the Refresh Feed button to Manually Refresh Feed and reworded its tooltip, since the feed already refreshes on its own

## 2026-08-26

- Added an unsaved changes guard to the list editor, confirming before you navigate away or close the tab with unsaved edits
- Added an Edit list after creating checkbox to list settings, remembered between visits, that drops you straight into the new list's editor
- Added View list links to the list settings and list editor pages, and a create new list link next to the Lists dropdown
- Swapped the order of the Lists and Streams nav links
- Behind the scenes: added a CI pipeline, wider test coverage, a type cleanup pass, contributor docs, and a sitemap

## 2026-08-25

- Moved delete account onto a new Advanced settings page under Settings
- Added a Load more button to the list editor so long channel lists page in
- Added a second save button at the bottom of the List Settings page

## 2026-08-24

- Added privacy policy and terms pages, linked from the footer
- Added a Delete my account and data button, which revokes YT Catchup's access to your Google account and removes everything stored about you
- Masked emails on the admin page by default, with a toggle to reveal them
- Added a shared five minute refresh cooldown so background refreshes stop firing on every page visit, with the Settings button bypassing it
- Raised the video cache TTL from 30 minutes to 4 hours
- Made the Sync Subscriptions button glow when no channels are synced yet, and pointed the callout message at it
- Forced a cache refresh after saving a list so its videos show up right away
- Replaced the favicon with a custom one
- Fixed mobile overflow and a login redirect bug in Settings

## 2026-08-23

- Login now requires an invite code, keeping signups under the cap Google puts on the app
- An invite code in the URL is remembered, so it carries through to login on its own
- A code stays reusable by the person who first claimed it, so a returning user is never locked out of their own account
- Added an admin section for creating, copying, and revoking codes
- Showed a clearer message when no invite code is available

## 2026-08-22

- Shrank queue row padding, thumbnail size, and touch targets on phone width screens
- Replaced the queue's full timestamp with a short relative date and clamped long titles to 2 lines, so rows stop varying wildly in height
- Widened Previous/Next to fill the row on phones instead of pinning to opposite edges, and gave the video title its own line above the channel name
- Showed a Settings nav link to the admin panel for admin users
- Swapped an em dash for a period in the homepage tagline
- Added link preview cards, so a shared YT Catchup link shows a title, description, and image

## 2026-08-21

- Added an admin kill switch that pauses refresh-all-cache across the app, backed by a new app_settings table and admin endpoints
- Added a notice banner shown to users while refreshes are paused
- refresh-all-cache now skips a channel that fails to refresh instead of aborting the whole run, retrying it on the normal TTL
- refreshAllCache now shares its in-flight request so overlapping calls don't fire duplicate refreshes
- Updated docker-compose to postgres:18 to match Railway's production version, moving the volume mount up a directory level to match what 18+ expects
- Fixed uneven columns in the admin quota table

## 2026-08-20

- Switched the admin quota view from a per call table to grouped expanding rows, so one API action reads as one line

## 2026-08-19

- Added an admin panel with a daily YouTube API quota view
- Made each quota row drillable into the grouped calls that made it up, tracking which action, user, and request triggered each call
- Fixed quota date handling and bounded the history query
- Moved queue row styling into CSS classes, adding a purple left border and a distinct hover color for the selected row
- Replaced the queue watch button with an eye toggle that disables itself and shows a spinner while a toggle is still pending
- Stopped the queue from unmounting on a watch toggle failure, showing the error banner alongside it instead

## 2026-08-18

- Added the youtube_quota_usage table and wired quota cost logging into every YouTube API call
- Removed the hardcoded db container name from docker-compose so multiple worktrees don't collide on the same Postgres container

## 2026-08-17

- Cached each channel's uploads playlist ID so refresh-all-cache stops re-resolving it every time, cutting most refreshes from 2 API calls to 1

## 2026-08-16

- Verified Google id_token signatures during login with google-auth-library instead of manually decoding the JWT payload
- Trimmed an overlong comment on the shared feed query
- Replaced the client README's unedited Vite boilerplate with real content

## 2026-08-14

- Fixed a login redirect bug in several client API functions
- Fixed the last real lint findings
- Removed the now dead getSubscriptions function and route

## 2026-08-13

- Added a demo gif to the README and centered it

## 2026-08-12

- Added the applyRoundRobin function and wired it into /all, /live, and list feeds along with pagination
- Added a Load more button and made background refreshes preserve how far you'd scrolled
- Swapped every loading state across the app for a consistent spinner

## 2026-08-11

- Deployed to production on Railway at ytcatchup.com
- Fixed a build time environment variable that broke every API call in production
- Fixed Next/Previous ignoring the Hide watched filter
- Fixed the selected video not surviving a page refresh

## 2026-08-10

- Derived cookie secure and sameSite flags from the real callback URL instead of hardcoding them
- Added test coverage for the auth routes
- Fixed a handful of type errors and cleaned up leftover config/test files
- Added Express static file serving with an SPA fallback so client routes survive a refresh
- Added a health check endpoint, removed the old test/db-test routes
- Removed a stale duplicate copy of the database schema file

## 2026-08-09

- Made session/token revocation on logout atomic
- Fixed isApiErrorPayload always returning true regardless of the actual payload
- Added the eqeqeq lint rule to catch this kind of bug earlier

## 2026-08-08

- Made the subscription sync insert one atomic bulk statement instead of a per-item loop
- Removed an unused SESSION_SECRET config value

## 2026-08-06

- Extracted Row, Button, and CheckboxLabel as shared components
- Gave the homepage a real landing page hero instead of a bare session check
- Added a graceful fallback for failed thumbnail loads and a retry button for broken video playback
- Auto refreshes the video cache when opening All or Lists instead of requiring a manual refresh
- Added a dark/light mode toggle and fixed the hardcoded colors it exposed
- Fixed a batch of flaky ListsPage tests to wait for real signals instead of incidental text

## 2026-08-05

- Fixed subscription sync only paginating 50 results, and channel thumbnails not persisting
- Fixed broken channel thumbnails by bounding rendered image/row sizes
- Added Save and Delete to the list editor, and full /lists routing with a dropdown and empty states
- Added the player and queue to the Lists browsing page
- Fixed the Hide watched/Catch-up checkboxes disappearing, a bug caused by duplicated queue UI
- Extracted fetchFeedForPreference and FeedView so All and Lists stop duplicating the same query and queue UI
- Added GET /api/feed/live and a coming soon placeholder for the Live page
- Rebranded the app to YT Catchup
- Extracted ErrorText and MutedText components, replacing hardcoded styling
- Refreshed the README

## 2026-08-04

- Added the lists and list_channels database tables
- Built every list CRUD route: create, read, update, delete
- Added client helpers for each route
- Built the Lists settings page and the list editor
- Wired up channel membership editing within a list

## 2026-08-03

- Brought Claude on as a collaborator going forward
- Added a Sync Subscriptions button to Channel Settings with a summary of what synced
- Added test coverage for AllPage and the Hide watched filter
- Cleaned up dead code and tightened feed item typing

## 2026-08-02

- Added a Refresh Feed button to Channel Settings
- Moved the catch up mode toggle next to Hide watched

## 2026-07-30

- Feed query now respects enabled_all and excluded_shorts preferences

## 2026-07-29

- Added tri state bulk checkboxes for channel preferences
- Wired them into the UI, disabling individual rows during a bulk update

## 2026-07-28

- Renamed a type for clarity
- Added the bulkUpdateChannels client helper

## 2026-07-27

- Added a route for updating one preference across many channels at once

## 2026-07-25

- Clarified the channel setting descriptions

## 2026-07-23

- Added the devlog page, route, and footer link (superseded by this changelog)

## 2026-07-20

- Finished the channel preference toggle handler
- Rewired channel API calls onto apiFetch
- Added react-markdown and the original devlog file

## 2026-07-19

- Removed a now unneeded placeholder channel page

## 2026-07-17

- Built out most of the Channels settings page, just missing the toggle handler

## 2026-07-14

- Wired up the Settings nav link and outer layout using a nested router Outlet

## 2026-07-13

- Added the Settings pages shell, including starter Channels and Lists settings pages

## 2026-07-10

- Reworked how recent videos are fetched from YouTube: resolving each channel's uploads playlist and reading from it directly, instead of using search.list

## 2026-07-08

- Moved user login logic from the home page into App
- Logging out now redirects to the home page

## 2026-07-07

- Fixed the vitest/vite config split and test type inclusion

## 2026-07-05

- Added vitest config and initial test setup for both client and server

## 2026-07-01

- Installed vitest and testing dependencies

## 2026-06-27

- All page now redirects to login on an expired session instead of just erroring
- Fixed refreshAllCache calling resp.json instead of resp.json()

## 2026-06-26

- requireAuth now returns structured 401 responses with an AUTH_REQUIRED code
- Added the shared apiFetch wrapper, getLoginUrl, and shouldRedirectToLogin helpers
- Rewired getAllFeed onto apiFetch
- Reorganized the API client file

## 2026-06-25

- Added the ApiError type carrying status and code
- syncSubscriptions now returns a real ApiError
- A revoked YouTube connection now redirects to re-login instead of failing silently

## 2026-06-23

- Switched the API base to a Vite env variable instead of a hardcoded string
- Added withYoutubeReauthHandling to handle expired/revoked Google tokens and wrapped the YouTube routes in it

## 2026-06-22

- Added the channels router with GET/PATCH routes
- Added client helpers for channel preferences
- Added a starter Channels settings page

## 2026-06-21

- Added Previous/Next buttons
- New subscriptions now get default channel preferences automatically

## 2026-06-19

- Added a "caught up" message once every video is watched, added the catch up mode toggle to the UI

## 2026-06-18

- Added logic to auto select the next video when one finishes playing

## 2026-06-17

- Added catch up mode, persisted to localStorage

## 2026-06-15

- Added a Hide watched toggle to the All page

## 2026-06-14

- Added the YouTube IFrame player and integrated it into the All page
- Styled the video queue list
- Feed now orders purely by upload date instead of watched status

## 2026-06-13

- Feed query now includes watched state
- Added watch/unwatch endpoints and their client helpers
- Added a Watch/Unwatch button on the All page

## 2026-06-12

- All page shows refresh/skip counts for debugging
- Fixed a missing env import

## 2026-06-11

- Added cache staleness tracking per channel
- refresh-all-cache now skips channels that are still fresh

## 2026-06-08

- Added a client helper for refreshAllCache
- All page now displays real recent videos from subscribed channels, styling still rough

## 2026-06-07

- Added /api/youtube/refresh-all-cache to pull recent videos for every subscribed channel
- Rebuilt /api/feed/all to join subscriptions with cached videos

## 2026-06-06

- Added an endpoint to fetch a channel's videos from YouTube and cache them in videos_cache

## 2026-06-05

- Added client helpers for the saved feed and for triggering a subscriptions sync
- Rewired the /all page onto syncSubscriptions and getAllFeed instead of live YouTube calls

## 2026-06-04

- Added GET /api/feed/all, at this point just returning the user's subscriptions

## 2026-06-03

- Fixed getUserRefreshToken to throw immediately instead of sending a client side 400
- Extracted the Google token refresh and YouTube subscription fetch logic into separate functions
- Added POST /api/youtube/sync-subscriptions to save subscriptions into the database

## 2026-06-02

- Built the first version of the /all page
- Called YouTube's API directly on every load, nothing saved yet
- Rendered a plain list of subscribed channels
- Extracted refresh token retrieval into its own function

## 2026-06-01

- Added react-router-dom
- Added the first client side API helper functions
- Added routing and a basic home page

## 2026-05-28

- Added a route that fetches the logged in user's subscribed channels from the YouTube API

## 2026-05-27

- Added a function to refresh a Google access token from a stored refresh token

## 2026-05-26

- Added the requireAuth middleware gating access to logged in routes
- Added a function for decrypting refresh tokens
- Improved comments across the auth code

## 2026-05-25

- Added a logout route and session revocation logic
- Added server side 500 error handling
- OAuth callback now revokes existing sessions before creating a new one
- Cleaned up leftover Vite boilerplate CSS

## 2026-05-24

- Installed and enabled CORS on the server
- Hooked up user sessions and tested with a whoami component

## 2026-05-21

- Added a database backed session table

## 2026-05-20

- Added Google OAuth login and callback, exchanging the code for tokens and upserting the user

## 2026-05-18

- Added the first migration with real database tables
- Added dotenv-cli scripts so dbmate commands auto load env vars
- Split env config between the server and migrations

## 2026-05-17

- Added docker compose Postgres and dbmate migrations
- Added a db test endpoint
- Generated the first real migration, removed an unnecessary database dump

## 2026-05-16

- Added dotenv for loading environment variables
- Added a zod schema to validate required env vars
- Wired the validated env object into server startup

## 2026-05-15

- Scaffolded the client/server workspace
- Added the initial env example
- Added the first README
