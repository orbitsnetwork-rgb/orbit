create table if not exists eights (
  id text primary key,
  city text not null,
  country text not null,
  lat double precision not null,
  lng double precision not null,
  creator text not null,
  holder text not null,
  created_at timestamptz not null,
  story text not null default '',
  photo text not null default '',
  status text not null default 'waiting',
  confirmed_by text,
  confirmed_at timestamptz
);

create table if not exists talks (
  id text primary key,
  eight_id text not null,
  by_name text not null,
  body text not null,
  at timestamptz not null
);

create index if not exists talks_eight_at on talks (eight_id, at);
