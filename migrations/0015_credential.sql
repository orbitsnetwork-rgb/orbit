alter table people add column if not exists credential_hash text;

update people
set credential_hash = key
where credential_hash is null
  and key ~ '^[a-f0-9]{64}$';

create unique index if not exists people_credential on people (credential_hash);
