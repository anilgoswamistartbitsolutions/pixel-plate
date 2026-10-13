-- Free-form "extra info" rows for Restaurant Information -- staff add a title/topic + detail
-- text for anything not covered by the structured fields (e.g. "Birthday policy", "Dress
-- code", "Live music nights"). The voice agent reads every active row as part of
-- get_restaurant_information. Safe to re-run.

create table if not exists restaurant_extra_info (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  topic text not null,
  detail text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_restaurant_extra_info_restaurant on restaurant_extra_info (restaurant_id, sort_order);
