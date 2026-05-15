# better-yt-tv

A personal YouTube viewing dashboard that lets you directly watch the most 
recent uploads from only the channels you’re subscribed to. Think of it as a TV queue for your subscriptions.

## Frontend
- Vite + React SPA
- custom Player component built around the YouTube IfFrame API for managing playback, 
watched state and autoplay mode.

## Backend
- Node/Express API for handling Google/YouTube OAuth, storing refresh tokens and 
syncing the user's subscriptions into Postgres.
- Postgres does the heavy lifting by joining cached videos with 
watched stated and using a window function to select the top N uploads per channel, 
leaving remainder business logic like round-robin ordering and shaping the actual queue to the API
