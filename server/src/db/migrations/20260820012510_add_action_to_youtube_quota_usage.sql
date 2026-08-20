-- migrate:up
alter table youtube_quota_usage add column if not exists action text;
alter table youtube_quota_usage add column if not exists user_id uuid references users(id) on delete set null;
alter table youtube_quota_usage add column if not exists request_group_id uuid;
drop index if exists youtube_quota_usage_called_at_idx;

-- migrate:down
create index if not exists youtube_quota_usage_called_at_idx on youtube_quota_usage using btree (called_at);
alter table youtube_quota_usage drop column if exists request_group_id;
alter table youtube_quota_usage drop column if exists user_id;
alter table youtube_quota_usage drop column if exists action;
