-- ORBIT chat moderation: temporary chat pauses (no effect on ✦) + review markers. Additive only.
create table if not exists orbit_chat_mutes (
  user_id text primary key,
  until_at bigint not null,
  hidden_n integer not null default 0,
  at bigint not null
);
alter table orbit_chat add column if not exists removed boolean not null default false;
alter table orbit_chat add column if not exists reviewed_at bigint;
create index if not exists orbit_chat_hidden_user on orbit_chat (user_id, at desc) where hidden
