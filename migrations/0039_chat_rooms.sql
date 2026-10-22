-- ORBIT chat rooms: what each person has read per room (unread counts) + when they were last in the chat («онлайн»). Additive only.
create table if not exists orbit_chat_seen (
  user_id text not null,
  room text not null,
  last_id bigint not null default 0,
  seen_at bigint not null,
  primary key (user_id, room)
);
create index if not exists orbit_chat_seen_at on orbit_chat_seen (seen_at desc)
