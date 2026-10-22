-- ORBIT live layer: world chat, role applications, bot signals. Outside the world document. No effect on ✦ or formulas.
create table if not exists orbit_chat (
  id bigserial primary key,
  room text not null default 'world',
  user_id text not null,
  name text not null,
  text text not null,
  at bigint not null,
  hidden boolean not null default false
);
create index if not exists orbit_chat_room_id on orbit_chat (room, id desc);
create index if not exists orbit_chat_user_at on orbit_chat (user_id, at desc);
create table if not exists orbit_chat_reports (
  msg_id bigint not null,
  reporter_id text not null,
  at bigint not null,
  primary key (msg_id, reporter_id)
);
create table if not exists orbit_role_asks (
  user_id text not null,
  role text not null,
  why text not null,
  at bigint not null,
  state text not null default 'wait',
  primary key (user_id, role)
);
-- Bot signals are review-only: nothing is taken, frozen or hidden automatically.
create table if not exists orbit_bot_flags (
  user_id text primary key,
  reason text not null,
  hits integer not null default 1,
  first_at bigint not null,
  last_at bigint not null,
  state text not null default 'review'
)
