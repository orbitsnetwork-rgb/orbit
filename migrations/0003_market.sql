alter table eights add column if not exists reward_of text;

create table if not exists listings (
  id text primary key,
  eight_id text not null,
  seller text not null,
  currency text not null,
  amount double precision not null,
  status text not null default 'open',
  buyer text,
  sold_at timestamptz,
  created_at timestamptz not null
);
