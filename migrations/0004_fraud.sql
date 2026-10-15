alter table eights add column if not exists device text;
alter table eights add column if not exists confirmer_device text;
alter table eights add column if not exists photo_hash text;
alter table listings add column if not exists reserved_by text;
alter table listings add column if not exists reserved_at timestamptz;
