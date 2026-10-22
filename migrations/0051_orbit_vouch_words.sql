-- «Слово поручителя»: коротке слово, яке свідок лишає людині, за яку поручився. Одне на пару, назавжди. Нова таблиця.
create table if not exists orbit_vouch_words (
  witness_id text not null,
  author_id text not null,
  text text not null,
  at bigint not null,
  hidden boolean not null default false,
  primary key (witness_id, author_id)
);
create index if not exists orbit_vouch_words_author_idx on orbit_vouch_words (author_id);
