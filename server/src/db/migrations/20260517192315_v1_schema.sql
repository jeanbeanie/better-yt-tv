-- migrate:up
create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique not null,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists oauth_tokens (
  user_id uuid primary key references users(id) on delete cascade,
  refresh_token_ciphertext text not null,
  access_token text,
  expires_at timestamptz,
  scopes text,
  updated_at timestamptz not null default now()
);

-- which channel a user is subbed to
create table if not exists user_subscriptions (
  user_id uuid references users(id) on delete cascade,
  channel_id text not null,
  channel_title text not null,
  channel_thumb_url text,
  synced_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

-- user specific per-channel toggles
create table if not exists channel_preferences (
  user_id uuid references users(id) on delete cascade,
  channel_id text not null,
  enabled_all boolean not null default true,
  enabled_live boolean not null default true,
  excluded_shorts boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

-- recent uploads cache to minimize YT API calls
create table if not exists videos_cache (
  video_id text primary key,
  channel_id text not null,
  title text not null,
  published_at timestamptz not null,
  duration_seconds int,
  thumb_url text,
  fetched_at timestamptz not null default now()
);

-- tracks caching TTL per channel
create table if not exists channel_recent_cache_state (
  channel_id text primary key,
  cache_expires_at timestamptz not null,
  last_checked_at timestamptz not null default now()
);

-- store per-user state for a particular video
create table if not exists user_video_state (
  user_id uuid references users(id) on delete cascade,
  video_id text not null,
  watched_at timestamptz null,
  source text not null default 'manual', -- 'ended' | 'manual' | 'reset'
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

-- only build constraint if it does not already exist
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_video_state_source_check'
  ) then
    -- force user_video_state.source to only be known values
    alter table user_video_state
      add constraint user_video_state_source_check
      check (source in ('ended', 'manual', 'reset'));
  end if;
end $$;

-- FUTURE: for post V1 billing
create table if not exists billing_customers (
  user_id uuid primary key references users(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at timestamptz not null default now()
);

-- feature "switches" enabled per user
create table if not exists entitlements (
  user_id uuid references users(id) on delete cascade,
  feature_key text not null,
  source text not null, -- 'free' | 'trial' | 'stripe_subscription' | 'stripe_lifetime'
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, feature_key) -- one row per feature per user
);

-- INDEXES

create index if not exists videos_cache_channel_published_idx
  on videos_cache (channel_id, published_at desc);

create index if not exists user_video_state_user_watched_idx
  on user_video_state (user_id, watched_at);

create index if not exists channel_preferences_user_enabled_all_idx
  on channel_preferences (user_id, enabled_all);

create index if not exists user_subscriptions_user_id_idx
  on user_subscriptions (user_id);

-- migrate:down

-- drop indexes first, then tables in reverse dependency order:
drop index if exists user_subscriptions_user_id_idx;
drop index if exists channel_preferences_user_enabled_all_idx;
drop index if exists user_video_state_user_watched_idx;
drop index if exists videos_cache_channel_published_idx;

drop table if exists entitlements;
drop table if exists billing_customers;
drop table if exists user_video_state;
drop table if exists channel_recent_cache_state;
drop table if exists videos_cache;
drop table if exists channel_preferences;
drop table if exists user_subscriptions;
drop table if exists oauth_tokens;
drop table if exists users;
