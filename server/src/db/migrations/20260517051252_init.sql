-- migrate:up
create table if not exists schema_meta (
  id int primary key,
  created_at timestamptz not null default now()
);

insert into schema_meta (id) values (1)
on conflict (id) do nothing;

-- migrate:down
drop table if exists schema_meta;
