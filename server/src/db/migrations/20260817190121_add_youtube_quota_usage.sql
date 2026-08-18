-- migrate:up
create table if not exists youtube_quota_usage (
  id bigint generated always as identity primary key,
  call_type text not null,
  units integer not null,
  called_at timestamptz not null default now()
);

create index if not exists youtube_quota_usage_called_at_idx
  on youtube_quota_usage (called_at);

-- migrate:down
drop table if exists youtube_quota_usage;
