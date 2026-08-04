-- migrate:up
create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists lists_user_id_idx on lists (user_id);

create table if not exists list_channels (
  list_id uuid not null references lists(id) on delete cascade,
  channel_id text not null,
  added_at timestamptz not null default now(),
  primary key (list_id, channel_id)
);

-- migrate:down
drop table if exists list_channels;
drop index if exists lists_user_id_idx;
drop table if exists lists;

