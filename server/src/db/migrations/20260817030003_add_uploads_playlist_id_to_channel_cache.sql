-- migrate:up
alter table channel_recent_cache_state
  add column if not exists uploads_playlist_id text;

-- migrate:down
alter table channel_recent_cache_state
  drop column if exists uploads_playlist_id;
