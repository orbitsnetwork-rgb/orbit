-- ORBIT: unguessable public launch links. /l/<slug> → launch id (creation). Outside the world document; append-only.
create table if not exists orbit_links (
  slug text primary key,
  cr text not null unique,
  at bigint not null
);
