-- Pixel Plate -- restaurant voice-agent & reservation platform schema.
-- Mirrors the EMS-Voice/hospital-assist conventions (pgcrypto for password hashing,
-- a single-row *_config table for the voice agent, staff_users.role for permissions)
-- but models restaurants, tables, seats, and seat-level reservations.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Tenancy & staff
-- ---------------------------------------------------------------------------

create table if not exists restaurants (
  id bigserial primary key,
  slug text not null unique,
  name text not null default 'Pixel Plate',
  created_at timestamptz not null default now()
);

insert into restaurants (slug, name) values ('default', 'Pixel Plate')
on conflict (slug) do nothing;

-- role stays free-text (checked in app code), matching hospital-assist's staff_users:
-- 'super_admin' sees Voice Agent configuration + Team & Settings + billing-level config;
-- 'admin' runs day-to-day floor/reservations/menu/calls operations, no agent credentials.
create table if not exists staff_users (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  name text not null,
  username text not null unique,
  email text unique,
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin', 'super_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Restaurant profile & operating rules
-- ---------------------------------------------------------------------------

create table if not exists restaurant_settings (
  restaurant_id bigint primary key references restaurants(id) on delete cascade,
  description text,
  address text,
  phone text,
  total_seating_capacity integer,
  amenities text[] not null default '{}',
  parking_info text default 'Public parking is available adjacent to the restaurant.',
  reservation_policy text,
  cancellation_policy text,
  supported_languages text[] not null default '{"English"}',
  voice_greeting text default 'Welcome to Pixel Plate! I can check tables, share the menu, or book a reservation for you -- how can I help today?',
  voice_behavior_notes text,
  -- opening_hours: {"mon": {"open":"11:00","close":"22:30","closed":false}, ...}
  opening_hours jsonb not null default '{}',
  -- special_hours: [{"date":"2026-12-25","label":"Christmas","closed":true,"open":null,"close":null}]
  special_hours jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table if not exists booking_rules (
  restaurant_id bigint primary key references restaurants(id) on delete cascade,
  max_party_size_auto integer not null default 8,
  max_tables_per_auto_booking integer not null default 1,
  full_table_requires_approval boolean not null default false,
  combined_table_requires_approval boolean not null default true,
  large_group_threshold integer not null default 9,
  deposit_required boolean not null default false,
  reservation_duration_minutes integer not null default 90,
  turnover_buffer_minutes integer not null default 15,
  slot_interval_minutes integer not null default 15,
  cancellation_deadline_hours integer not null default 2,
  modification_deadline_hours integer not null default 2,
  hold_duration_minutes integer not null default 10,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Floor plan: tables & seats (permanent records -- deactivated, never deleted)
-- ---------------------------------------------------------------------------

create table if not exists restaurant_tables (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  code text not null,
  display_name text not null,
  capacity integer not null check (capacity > 0),
  table_type text not null default 'standard' check (table_type in ('standard', 'shared', 'private', 'booth')),
  shareable boolean not null default false,
  shareable_party_sizes int[] not null default '{}',
  exclusive_only boolean not null default false,
  full_table_requires_approval boolean not null default false,
  pos_x numeric not null default 0,
  pos_y numeric not null default 0,
  width numeric not null default 120,
  height numeric not null default 90,
  shape text not null default 'rect' check (shape in ('rect', 'round')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, code)
);

create table if not exists table_seats (
  id bigserial primary key,
  table_id bigint not null references restaurant_tables(id) on delete cascade,
  code text not null,
  seat_index integer not null,
  active boolean not null default true,
  unique (table_id, code),
  unique (table_id, seat_index)
);

-- Which tables may be pushed together for one party. Combination itself is permanent;
-- approval requirement is configurable per combination.
create table if not exists table_combinations (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  name text not null,
  table_ids bigint[] not null,
  requires_approval boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reservations & seat allocation engine
-- ---------------------------------------------------------------------------

create sequence if not exists booking_ref_seq;

create table if not exists reservations (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  booking_ref text not null unique default ('PP-' || lpad(nextval('booking_ref_seq')::text, 6, '0')),
  customer_name text not null,
  phone text not null,
  alt_phone text,
  party_size integer not null check (party_size > 0),
  reservation_date date not null,
  start_time time not null,
  duration_minutes integer not null default 90,
  seating_preference text,
  seating_mode text not null default 'partial' check (seating_mode in ('full_table', 'partial', 'shared', 'combined')),
  status text not null default 'pending' check (
    status in ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show')
  ),
  source text not null default 'staff' check (source in ('voice_agent', 'staff', 'online')),
  notes text,
  staff_notes text,
  created_by_staff_id bigint references staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text
);

-- One row per seat assigned to a reservation (or a temporary hold not yet tied to one).
-- status 'held' and 'active' are the only ones a new booking must avoid colliding with;
-- 'released' rows are history and no longer block the exclusion constraint below.
create table if not exists seat_allocations (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  seat_id bigint not null references table_seats(id) on delete cascade,
  table_id bigint not null references restaurant_tables(id) on delete cascade,
  reservation_id bigint references reservations(id) on delete cascade,
  hold_token text,
  status text not null default 'active' check (status in ('held', 'active', 'released')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_at > start_at),
  exclude using gist (
    seat_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('held', 'active'))
);

create index if not exists idx_seat_allocations_reservation on seat_allocations (reservation_id);
create index if not exists idx_seat_allocations_table_time on seat_allocations (table_id, start_at);
create index if not exists idx_seat_allocations_hold_token on seat_allocations (hold_token);

create table if not exists group_booking_requests (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  customer_name text not null,
  phone text not null,
  party_size integer not null check (party_size > 0),
  requested_date date not null,
  requested_time time not null,
  seating_preference text,
  notes text,
  status text not null default 'pending' check (
    status in ('pending', 'confirmed', 'rejected', 'needs_info')
  ),
  proposed_table_ids bigint[] not null default '{}',
  staff_notes text,
  resulting_reservation_id bigint references reservations(id) on delete set null,
  resolved_by_staff_id bigint references staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------

create table if not exists menu_categories (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  unique (restaurant_id, name)
);

create table if not exists menu_items (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  category_id bigint references menu_categories(id) on delete set null,
  name text not null,
  description text,
  price_cents integer not null default 0,
  currency text not null default 'INR',
  available boolean not null default true,
  sold_out boolean not null default false,
  availability_days int[] not null default '{1,2,3,4,5,6,7}',
  meal_periods text[] not null default '{breakfast,lunch,dinner}',
  special_start_date date,
  special_end_date date,
  dietary_tags text[] not null default '{}',
  allergens text[] not null default '{}',
  complimentary boolean not null default false,
  complimentary_condition text,
  recommend_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_menu_items_category on menu_items (category_id);
create index if not exists idx_menu_items_search on menu_items using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Calls & follow-ups
-- ---------------------------------------------------------------------------

create table if not exists calls (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  call_sid text,
  caller_number text,
  channel text not null default 'browser_test' check (channel in ('browser_test', 'telephony')),
  status text not null default 'initiated' check (
    status in ('initiated', 'connecting', 'connected', 'ended', 'failed')
  ),
  outcome text,
  escalation_reason text,
  linked_reservation_id bigint references reservations(id) on delete set null,
  linked_group_request_id bigint references group_booking_requests(id) on delete set null,
  transcript jsonb not null default '[]',
  callback_status text default 'none' check (callback_status in ('none', 'requested', 'scheduled', 'done')),
  assigned_staff_id bigint references staff_users(id) on delete set null,
  started_at timestamptz not null default now(),
  connected_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  error_message text
);

create index if not exists idx_calls_started on calls (started_at desc);
create index if not exists idx_calls_status on calls (status);

create table if not exists staff_followups (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  call_id bigint references calls(id) on delete set null,
  reservation_id bigint references reservations(id) on delete set null,
  group_request_id bigint references group_booking_requests(id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  assigned_staff_id bigint references staff_users(id) on delete set null,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Voice agent config (Pixel Plate (Prod)) -- credentials encrypted at rest
-- ---------------------------------------------------------------------------

create table if not exists voice_agent_config (
  id smallint primary key default 1 check (id = 1),
  agent_name text not null default 'Pixel Plate (Prod)',
  provider_agent_id text,
  api_key_encrypted text,
  org_id text,
  workspace_id text,
  app_id text,
  input_sample_rate integer not null default 16000 check (input_sample_rate in (8000, 16000)),
  output_sample_rate integer not null default 16000 check (output_sample_rate in (16000, 22050)),
  initial_language_name text default 'English',
  initial_bot_message text,
  telephony_configured boolean not null default false,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists voice_sessions (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  phone_number text,
  status text not null default 'initiated',
  interaction_id text,
  call_id bigint references calls(id) on delete set null,
  started_at timestamptz not null default now(),
  connected_at timestamptz,
  ended_at timestamptz,
  error_message text
);

create index if not exists idx_voice_sessions_started on voice_sessions (started_at desc);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table if not exists audit_log (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  staff_id bigint references staff_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_entity on audit_log (entity_type, entity_id);
create index if not exists idx_audit_log_created on audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Seed: default settings/rules for restaurant 1, staff accounts
-- ---------------------------------------------------------------------------

insert into restaurant_settings (restaurant_id, address, phone, total_seating_capacity, amenities, opening_hours)
values (
  1,
  '',
  '',
  0,
  '{"Full bar","Outdoor seating","Wheelchair accessible","Private dining"}',
  '{"mon":{"open":"11:00","close":"22:30","closed":false},"tue":{"open":"11:00","close":"22:30","closed":false},"wed":{"open":"11:00","close":"22:30","closed":false},"thu":{"open":"11:00","close":"22:30","closed":false},"fri":{"open":"11:00","close":"23:30","closed":false},"sat":{"open":"11:00","close":"23:30","closed":false},"sun":{"open":"11:00","close":"22:00","closed":false}}'
)
on conflict (restaurant_id) do nothing;

insert into booking_rules (restaurant_id) values (1)
on conflict (restaurant_id) do nothing;

insert into voice_agent_config (id, agent_name, initial_bot_message)
values (1, 'Pixel Plate (Prod)', 'Welcome to Pixel Plate! I can check tables, share the menu, or book a reservation for you -- how can I help today?')
on conflict (id) do nothing;

-- Default accounts (change the passwords immediately -- see .env / README).
-- super_admin: Voice Agent configuration, Team & Settings, booking-rule config.
-- admin: Overview, Floor Plan, Reservations, Group Requests, Menu, Calls, Reports.
insert into staff_users (restaurant_id, name, username, email, password_hash, role)
values (1, 'Restaurant Owner', 'pixelplate', 'owner@pixelplate.local', crypt('pixelplate123', gen_salt('bf')), 'super_admin')
on conflict (username) do update set password_hash = excluded.password_hash, role = excluded.role, active = true;

insert into staff_users (restaurant_id, name, username, email, password_hash, role)
values (1, 'Floor Manager', 'manager', 'manager@pixelplate.local', crypt('manager123', gen_salt('bf')), 'admin')
on conflict (username) do update set password_hash = excluded.password_hash, role = excluded.role, active = true;
