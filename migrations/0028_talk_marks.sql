create table if not exists talk_seen (
  eight_id text not null,
  lane text not null,
  listing_id text not null default '',
  person_key text not null,
  at timestamptz not null,
  primary key (eight_id, lane, listing_id, person_key)
);

create table if not exists talk_chalk (
  talk_id text not null,
  person_key text not null,
  primary key (talk_id, person_key)
);

create index if not exists talk_chalk_talk on talk_chalk (talk_id);
