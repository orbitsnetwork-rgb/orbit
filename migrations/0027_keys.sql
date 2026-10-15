create index if not exists eights_owner_key_idx on eights (owner_key);
create index if not exists eights_holder_key_idx on eights (holder_key);
create index if not exists eights_confirmer_key_idx on eights (confirmer_key);
create index if not exists eights_status_idx on eights (status);
create index if not exists eights_photo_hash_idx on eights (photo_hash);
create index if not exists eights_confirm_hash_idx on eights (confirm_hash);
create index if not exists eights_waiting_lat on eights (lat) where status = 'waiting';
create index if not exists listings_eight_status_idx on listings (eight_id, status);
