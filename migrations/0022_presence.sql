alter table eights add column if not exists presence text not null default '';
alter table eights add column if not exists presence_until timestamptz;
