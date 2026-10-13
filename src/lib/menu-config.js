import { query, withTransaction } from "@/lib/db";
import { expireSoldOut } from "@/lib/menu";

export async function listConfigurations(restaurantId) {
  const result = await query(
    `select c.*, coalesce(
        (select json_agg(mi.id) from menu_configuration_items mci join menu_items mi on mi.id = mci.menu_item_id where mci.configuration_id = c.id),
        '[]') as item_ids
     from menu_configurations c where c.restaurant_id = $1 order by c.name`,
    [restaurantId]
  );
  return result.rows;
}

export async function createConfiguration(restaurantId, { name, description, itemIds = [] }) {
  return withTransaction(async (client) => {
    const result = await client.query(
      "insert into menu_configurations (restaurant_id, name, description) values ($1,$2,$3) returning *",
      [restaurantId, name, description || null]
    );
    const config = result.rows[0];
    for (const itemId of itemIds) {
      await client.query(
        "insert into menu_configuration_items (configuration_id, menu_item_id) values ($1,$2) on conflict do nothing",
        [config.id, itemId]
      );
    }
    return config;
  });
}

export async function updateConfigurationItems(restaurantId, configurationId, itemIds) {
  return withTransaction(async (client) => {
    const owned = await client.query(
      "select id from menu_configurations where id = $1 and restaurant_id = $2",
      [configurationId, restaurantId]
    );
    if (!owned.rows[0]) throw new Error("Configuration not found");
    await client.query("delete from menu_configuration_items where configuration_id = $1", [configurationId]);
    for (const itemId of itemIds) {
      await client.query(
        "insert into menu_configuration_items (configuration_id, menu_item_id) values ($1,$2) on conflict do nothing",
        [configurationId, itemId]
      );
    }
    return { configurationId, itemIds };
  });
}

/** Assigns an existing configuration's item set to one or more calendar dates -- staff build
 * a configuration once (e.g. "Thanksgiving Special") and then stamp it onto any dates. */
export async function assignConfigurationToDates(restaurantId, configurationId, dates) {
  return withTransaction(async (client) => {
    const owned = await client.query(
      "select id from menu_configurations where id = $1 and restaurant_id = $2",
      [configurationId, restaurantId]
    );
    if (!owned.rows[0]) throw new Error("Configuration not found");
    for (const date of dates) {
      await client.query(
        `insert into menu_daily_schedule (restaurant_id, schedule_date, configuration_id) values ($1,$2,$3)
         on conflict (restaurant_id, schedule_date) do update set configuration_id = excluded.configuration_id`,
        [restaurantId, date, configurationId]
      );
    }
    return { assigned: dates.length };
  });
}

/** Reverts a date to the default menu by removing its per-slot setup. Clears menu_slot_schedule
 * (what the app actually writes) as well as the legacy whole-day menu_daily_schedule row, since
 * clearing only the legacy table silently left the real per-slot rows in place. */
export async function clearScheduleForDate(restaurantId, date) {
  await query("delete from menu_slot_schedule where restaurant_id = $1 and schedule_date = $2", [restaurantId, date]);
  await query("delete from menu_daily_schedule where restaurant_id = $1 and schedule_date = $2", [restaurantId, date]);
}

/** Per-slot schedule for one date: one row per morning/midday/evening, each either a named
 * configuration, a custom item list (itemIds set -- shown as "Custom" since it no longer
 * matches any single configuration), closed, or unset (falls back to the default menu). */
export async function getDaySlotSchedule(restaurantId, date) {
  const rows = (await query(
    `select s.*, c.name as configuration_name from menu_slot_schedule s
     left join menu_configurations c on c.id = s.configuration_id
     where s.restaurant_id = $1 and s.schedule_date = $2`,
    [restaurantId, date]
  )).rows;

  const byId = new Map(rows.map((r) => [r.slot, r]));
  const result = {};
  for (const slot of ["morning", "midday", "evening"]) {
    const row = byId.get(slot);
    if (!row) { result[slot] = { mode: "default", items: null, closed: false }; continue; }
    if (row.closed) { result[slot] = { mode: "closed", items: null, closed: true }; continue; }
    if (row.item_ids_override) {
      result[slot] = { mode: "custom", items: row.item_ids_override, configurationId: row.configuration_id, configurationName: row.configuration_name, closed: false };
    } else if (row.configuration_id) {
      result[slot] = { mode: "configuration", configurationId: row.configuration_id, configurationName: row.configuration_name, closed: false };
    } else {
      result[slot] = { mode: "default", items: null, closed: false };
    }
  }
  return result;
}

/** Assign a configuration (whole item set) to one slot on one date. */
export async function assignConfigurationToSlot(restaurantId, date, slot, configurationId) {
  const result = await query(
    `insert into menu_slot_schedule (restaurant_id, schedule_date, slot, configuration_id, item_ids_override, closed)
     values ($1,$2,$3,$4,null,false)
     on conflict (restaurant_id, schedule_date, slot) do update set
       configuration_id = excluded.configuration_id, item_ids_override = null, closed = false, updated_at = now()
     returning *`,
    [restaurantId, date, slot, configurationId]
  );
  return result.rows[0];
}

/** Save a custom (possibly edited-from-a-configuration) item list for one slot/date. Once
 * edited this way the slot shows as "Custom" rather than the originating configuration's name,
 * even if configurationId is kept for reference. */
export async function setCustomSlotItems(restaurantId, date, slot, itemIds, configurationId = null) {
  const result = await query(
    `insert into menu_slot_schedule (restaurant_id, schedule_date, slot, configuration_id, item_ids_override, closed)
     values ($1,$2,$3,$4,$5,false)
     on conflict (restaurant_id, schedule_date, slot) do update set
       configuration_id = excluded.configuration_id, item_ids_override = excluded.item_ids_override, closed = false, updated_at = now()
     returning *`,
    [restaurantId, date, slot, configurationId, itemIds]
  );
  return result.rows[0];
}

export async function setSlotClosed(restaurantId, date, slot, closed) {
  const result = await query(
    `insert into menu_slot_schedule (restaurant_id, schedule_date, slot, closed)
     values ($1,$2,$3,$4)
     on conflict (restaurant_id, schedule_date, slot) do update set closed = excluded.closed, updated_at = now()
     returning *`,
    [restaurantId, date, slot, closed]
  );
  return result.rows[0];
}

/** What's actually available for one date + slot, resolving configuration/custom/default/closed. */
export async function getMenuForDateSlot(restaurantId, date, slot) {
  await expireSoldOut(restaurantId);
  const schedule = (await getDaySlotSchedule(restaurantId, date))[slot];
  if (schedule.closed) return { mode: "closed", items: [] };

  let itemIds = null;
  if (schedule.mode === "custom") itemIds = schedule.items;
  else if (schedule.mode === "configuration") {
    const rows = (await query(
      "select menu_item_id from menu_configuration_items where configuration_id = $1",
      [schedule.configurationId]
    )).rows;
    itemIds = rows.map((r) => r.menu_item_id);
  }

  if (itemIds) {
    const items = (await query(
      `select mi.*, cat.name as category_name from menu_items mi
       left join menu_categories cat on cat.id = mi.category_id
       where mi.restaurant_id = $1 and mi.id = any($2::bigint[]) and mi.available = true and mi.sold_out = false`,
      [restaurantId, itemIds]
    )).rows;
    return { mode: schedule.mode, configurationName: schedule.configurationName, items };
  }

  const items = (await query(
    `select mi.*, cat.name as category_name from menu_items mi
     left join menu_categories cat on cat.id = mi.category_id
     where mi.restaurant_id = $1 and mi.available = true and mi.sold_out = false and $2 = any(mi.meal_periods)`,
    [restaurantId, slot]
  )).rows;
  return { mode: "default", items };
}

/** One row per date in range that has any per-slot setup, for the calendar's month grid.
 * Reads menu_slot_schedule (the per-slot table the app actually writes) rather than the
 * older whole-day menu_daily_schedule, and flags dates that use a special-occasion master
 * so the calendar can mark them differently from an ordinary configured day. */
export async function getScheduleForRange(restaurantId, from, to) {
  const result = await query(
    `select s.schedule_date,
            count(*)::int as configured_slots,
            bool_or(s.closed) as has_closed,
            bool_or(coalesce(c.is_special, false)) as has_special,
            (array_agg(c.name order by c.is_special desc nulls last)
               filter (where c.name is not null))[1] as headline_configuration
     from menu_slot_schedule s
     left join menu_configurations c on c.id = s.configuration_id
     where s.restaurant_id = $1 and s.schedule_date between $2 and $3
     group by s.schedule_date
     order by s.schedule_date`,
    [restaurantId, from, to]
  );
  return result.rows;
}

/** The whole day's menu, built by combining all three slots' per-slot schedules (used by
 * get_menu when the agent doesn't ask for a specific slot). Sold-out items that expired
 * (sold_out_date before today) are filtered out by the sold_out check in the items query
 * itself -- see menu_items.sold_out_date handling in src/lib/menu.js. */
export async function getMenuForDate(restaurantId, date) {
  const bySlot = await Promise.all(
    ["morning", "midday", "evening"].map((slot) => getMenuForDateSlot(restaurantId, date, slot))
  );
  const seen = new Map();
  let anyNonDefault = false;
  for (const { mode, items } of bySlot) {
    if (mode !== "default") anyNonDefault = true;
    for (const item of items) seen.set(item.id, item);
  }
  return { source: anyNonDefault ? "configuration" : "default", items: Array.from(seen.values()) };
}
