-- migrate:up
alter table videos_cache add column if not exists live_broadcast_content text;
alter table videos_cache add column if not exists scheduled_start_time timestamptz;
alter table videos_cache add column if not exists actual_start_time timestamptz;

create table if not exists channel_live_check_state (
  channel_id text primary key,
  last_checked_at timestamptz not null default now()
);

-- migrate:down
drop table if exists channel_live_check_state;
alter table videos_cache drop column if exists actual_start_time;
alter table videos_cache drop column if exists scheduled_start_time;
alter table videos_cache drop column if exists live_broadcast_content;
