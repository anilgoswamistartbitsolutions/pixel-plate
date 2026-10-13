-- California expansion: floors, menu configurations + daily scheduling, takeaway orders.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Floors (Main Dining, Patio, Upstairs, Bar, ...) -- tables belong to a floor.
-- ---------------------------------------------------------------------------
create table if not exists floors (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

alter table restaurant_tables add column if not exists floor_id bigint references floors(id) on delete set null;
alter table restaurant_tables add column if not exists size_label text not null default 'medium'
  check (size_label in ('small', 'medium', 'large', 'xl'));

-- ---------------------------------------------------------------------------
-- Menu configurations: a named, reusable set of items ("Monday", "Valentine's Special",
-- "Thanksgiving Special") that staff build once and then assign to one or more calendar
-- dates. On an assigned date, only that configuration's items are available.
-- ---------------------------------------------------------------------------
create table if not exists menu_configurations (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

create table if not exists menu_configuration_items (
  configuration_id bigint not null references menu_configurations(id) on delete cascade,
  menu_item_id bigint not null references menu_items(id) on delete cascade,
  primary key (configuration_id, menu_item_id)
);

-- One row per calendar date this configuration is assigned to; a date can only carry one
-- configuration at a time (re-assigning overwrites via unique + upsert).
create table if not exists menu_daily_schedule (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  schedule_date date not null,
  configuration_id bigint not null references menu_configurations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (restaurant_id, schedule_date)
);

-- Three fixed daily slots, with their own serving windows -- replaces the old free-text
-- breakfast/lunch/dinner meal_periods values used on menu_items.meal_periods.
-- morning 9:00-12:00, midday 13:00-16:00, evening 18:00-22:00 (configurable per restaurant).
create table if not exists daily_slots (
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  slot text not null check (slot in ('morning', 'midday', 'evening')),
  start_time time not null,
  end_time time not null,
  primary key (restaurant_id, slot)
);

insert into daily_slots (restaurant_id, slot, start_time, end_time) values
  (1, 'morning', '09:00', '12:00'),
  (1, 'midday', '13:00', '16:00'),
  (1, 'evening', '18:00', '22:00')
on conflict (restaurant_id, slot) do nothing;

-- ---------------------------------------------------------------------------
-- Takeaway orders -- a bundle of menu items a guest (or the voice agent on their behalf)
-- wants to pick up, paid at pickup, never online. Explicit status lifecycle, no silent
-- "confirmed" until the restaurant has actually accepted it.
-- ---------------------------------------------------------------------------
create sequence if not exists takeaway_ref_seq;

create table if not exists takeaway_orders (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  order_ref text not null unique default ('TW-' || lpad(nextval('takeaway_ref_seq')::text, 6, '0')),
  customer_name text not null,
  phone text not null,
  requested_slot text check (requested_slot in ('morning', 'midday', 'evening')),
  requested_time time,
  subtotal_cents integer not null default 0,
  service_charge_pct numeric not null default 5,
  service_charge_cents integer not null default 0,
  total_cents integer not null default 0,
  currency text not null default 'USD',
  status text not null default 'pending' check (
    status in ('pending', 'preparing', 'prepared_paid', 'taken', 'no_pickup', 'cancelled', 'other')
  ),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  notes text,
  source text not null default 'staff' check (source in ('voice_agent', 'staff', 'online')),
  created_by_staff_id bigint references staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists takeaway_order_items (
  id bigserial primary key,
  takeaway_order_id bigint not null references takeaway_orders(id) on delete cascade,
  menu_item_id bigint references menu_items(id) on delete set null,
  item_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0
);

create index if not exists idx_takeaway_orders_status on takeaway_orders (status, created_at desc);
create index if not exists idx_takeaway_order_items_order on takeaway_order_items (takeaway_order_id);

-- ---------------------------------------------------------------------------
-- menu_items: switch to USD (California), widen meal_periods to the new slot names.
-- ---------------------------------------------------------------------------
alter table menu_items alter column currency set default 'USD';
update menu_items set meal_periods = array(
  select case x when 'breakfast' then 'morning' when 'lunch' then 'midday' when 'dinner' then 'evening' else x end
  from unnest(meal_periods) as x
) where meal_periods && array['breakfast','lunch','dinner'];
