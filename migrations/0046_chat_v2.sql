-- ORBIT chat v2: replies, edit/delete own messages (change cursor «rev»), typing, moderator applications, moderators, moderation audit log. Additive only.
alter table orbit_chat add column if not exists reply_to bigint;
alter table orbit_chat add column if not exists edited_at bigint;
alter table orbit_chat add column if not exists deleted_at bigint;
alter table orbit_chat add column if not exists rev bigint not null default 0;
create sequence if not exists orbit_chat_rev_seq;
create index if not exists orbit_chat_room_rev on orbit_chat (room, rev desc);
create table if not exists orbit_chat_typing (
  user_id text not null,
  room text not null,
  at bigint not null,
  primary key (user_id, room)
);
create table if not exists orbit_mod_apps (
  user_id text primary key,
  why text not null,
  experience text not null default '',
  agreed boolean not null default false,
  state text not null default 'pending',
  at bigint not null,
  decided_at bigint,
  note text not null default ''
);
create table if not exists orbit_mods (
  user_id text primary key,
  at bigint not null
);
create table if not exists orbit_mod_log (
  id bigserial primary key,
  mod_id text not null,
  action text not null,
  target_user text,
  msg_id bigint,
  room text,
  note text not null default '',
  at bigint not null
);
create index if not exists orbit_mod_log_at on orbit_mod_log (at desc)
