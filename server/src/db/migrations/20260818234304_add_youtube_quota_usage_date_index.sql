-- migrate:up
create index if not exists youtube_quota_usage_usage_date_idx
  on youtube_quota_usage ((timezone('America/Los_Angeles', called_at)::date));

-- migrate:down
drop index if exists youtube_quota_usage_usage_date_idx;
