alter table eights add column if not exists archived_at timestamptz;

create table if not exists eight_events (
  id text primary key,
  eight_id text not null,
  at timestamptz not null,
  kind text not null,
  by_name text not null default '',
  status text not null,
  lat double precision,
  lng double precision
);

create index if not exists eight_events_eight on eight_events (eight_id, at);
