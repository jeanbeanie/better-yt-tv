-- migrate:up
create table if not exists invites (
  code text primary key,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  used_by uuid references users(id) on delete set null,
  used_at timestamptz
);

-- migrate:down
drop table if exists invites;

