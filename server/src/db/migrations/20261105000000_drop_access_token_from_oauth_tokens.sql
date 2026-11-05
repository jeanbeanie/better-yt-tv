-- migrate:up
alter table oauth_tokens drop column if exists access_token;
alter table oauth_tokens drop column if exists expires_at;

-- migrate:down
alter table oauth_tokens add column if not exists access_token text;
alter table oauth_tokens add column if not exists expires_at timestamptz;
