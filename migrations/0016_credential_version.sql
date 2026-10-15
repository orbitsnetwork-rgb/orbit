alter table people add column if not exists credential_version smallint;
alter table people add column if not exists credential_salt text;
alter table people add column if not exists credential_pending text;
alter table people add column if not exists credential_lookup text;

update people
set credential_version = 1
where credential_version is null
  and credential_hash is not null;

create unique index if not exists people_credential_lookup on people (credential_lookup);

alter table recovery add column if not exists version smallint;
alter table recovery add column if not exists salt text;
alter table recovery add column if not exists verifier text;
