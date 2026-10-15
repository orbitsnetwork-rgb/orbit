alter table talks add column if not exists lane text not null default 'wall';
create index if not exists talks_eight_lane_at on talks (eight_id, lane, at);
