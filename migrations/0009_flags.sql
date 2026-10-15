create table if not exists flags (
  eight_id text not null,
  by_name text not null,
  reason text not null,
  at timestamptz not null default now(),
  primary key (eight_id, by_name)
);
