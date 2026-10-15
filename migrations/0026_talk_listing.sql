alter table talks add column if not exists listing_id text;
create index if not exists talks_listing_at on talks (listing_id, at);
