-- migrate:up
alter table users add column if not exists is_admin boolean not null default false;

-- migrate:down
alter table users drop column if exists is_admin;
