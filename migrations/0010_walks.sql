create table if not exists walks (
  eight_id text not null,
  by_name text not null,
  at timestamptz not null default now(),
  primary key (eight_id, by_name)
);

create table if not exists recovery (
  person_key text primary key,
  code text not null unique
);
