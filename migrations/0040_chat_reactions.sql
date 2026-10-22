-- ORBIT chat reactions: cosmetic only (no ✦, no effect on economy). One row per (message, person, kind); toggling flips "on". Additive only.
create sequence if not exists orbit_chat_react_seq;
create table if not exists orbit_chat_reacts (
  msg_id bigint not null,
  user_id text not null,
  kind text not null,
  room text not null,
  is_on boolean not null default true,
  at bigint not null,
  seq bigint not null default nextval('orbit_chat_react_seq'),
  primary key (msg_id, user_id, kind)
);
create index if not exists orbit_chat_reacts_room_seq on orbit_chat_reacts (room, seq desc);
create index if not exists orbit_chat_reacts_user_at on orbit_chat_reacts (user_id, at desc)
