-- migrate:up
create table if not exists app_settings (
  id integer primary key default 1 check (id = 1),
  refresh_paused boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

-- migrate:down
drop table if exists app_settings;

