-- Leads (group_booking_requests expansion), per-slot menu scheduling, takeaway sizing/limits,
-- full-floor booking rule, same-day sold-out. Safe to re-run.

alter table group_booking_requests add column if not exists priority text not null default 'normal'
  check (priority in ('low', 'normal', 'high', 'urgent'));
alter table group_booking_requests add column if not exists lead_type text not null default 'group_booking'
  check (lead_type in ('group_booking', 'full_floor', 'general_inquiry', 'other'));
alter table group_booking_requests add column if not exists floor_id bigint references floors(id) on delete set null;

-- Per-slot daily menu schedule (replaces whole-day menu_daily_schedule for new UI): each
-- (date, slot) gets its own configuration OR a custom item-id override OR is marked closed.
-- item_ids_override is set whenever staff edit a slot's items after assigning a configuration
-- -- the UI then shows "Custom" instead of the configuration name for that slot.
create table if not exists menu_slot_schedule (
  id bigserial primary key,
  restaurant_id bigint not null references restaurants(id) on delete cascade,
  schedule_date date not null,
  slot text not null check (slot in ('morning', 'midday', 'evening')),
  configuration_id bigint references menu_configurations(id) on delete set null,
  item_ids_override bigint[],
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, schedule_date, slot)
);

-- sold_out is scoped to the day it was marked -- sold_out_date lets the menu-for-date lookup
-- treat the flag as expired once the date has passed, with no cron needed.
alter table menu_items add column if not exists sold_out_date date;
alter table menu_items add column if not exists size_options jsonb not null default '[]';

alter table takeaway_order_items add column if not exists variant_label text;

alter table booking_rules add column if not exists full_floor_min_advance_days integer not null default 7;
alter table booking_rules add column if not exists takeaway_slot_interval_minutes integer not null default 30;
alter table booking_rules add column if not exists takeaway_prep_buffer_minutes integer not null default 30;
alter table booking_rules add column if not exists takeaway_max_concurrent integer not null default 15;

create index if not exists idx_menu_slot_schedule_date on menu_slot_schedule (restaurant_id, schedule_date);
create index if not exists idx_leads_priority_status on group_booking_requests (priority, status, created_at desc);
