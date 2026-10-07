-- migrate:up
alter table videos_cache add column if not exists details_fetched_at timestamptz;
alter table videos_cache add column if not exists live_broadcast_content text;
alter table videos_cache add column if not exists scheduled_start_time timestamptz;
alter table videos_cache add column if not exists actual_start_time timestamptz;
alter table videos_cache add column if not exists actual_end_time timestamptz;

-- live page reads and rechecks only these rows
create index if not exists videos_cache_live_status_idx
  on videos_cache (channel_id)
  where live_broadcast_content in ('live', 'upcoming');

-- migrate:down
drop index if exists videos_cache_live_status_idx;
alter table videos_cache drop column if exists actual_end_time;
alter table videos_cache drop column if exists actual_start_time;
alter table videos_cache drop column if exists scheduled_start_time;
alter table videos_cache drop column if exists live_broadcast_content;
alter table videos_cache drop column if exists details_fetched_at;
