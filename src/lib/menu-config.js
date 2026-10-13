import { query, withTransaction } from "@/lib/db";

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

export async function clearScheduleForDate(restaurantId, date) {
  await query("delete from menu_daily_schedule where restaurant_id = $1 and schedule_date = $2", [restaurantId, date]);
}

export async function getScheduleForRange(restaurantId, from, to) {
  const result = await query(
    `select s.schedule_date, c.id as configuration_id, c.name as configuration_name
     from menu_daily_schedule s join menu_configurations c on c.id = s.configuration_id
     where s.restaurant_id = $1 and s.schedule_date between $2 and $3
     order by s.schedule_date`,
    [restaurantId, from, to]
  );
  return result.rows;
}

/** The menu actually available on a given date: the assigned configuration's items if one
 * exists for that date, otherwise every active item (the "always on" default menu). */
export async function getMenuForDate(restaurantId, date) {
  const scheduled = await query(
    `select mi.*, cat.name as category_name
     from menu_daily_schedule s
     join menu_configuration_items mci on mci.configuration_id = s.configuration_id
     join menu_items mi on mi.id = mci.menu_item_id
     left join menu_categories cat on cat.id = mi.category_id
     where s.restaurant_id = $1 and s.schedule_date = $2`,
    [restaurantId, date]
  );
  if (scheduled.rows.length) return { source: "configuration", items: scheduled.rows };

  const defaultItems = await query(
    `select mi.*, cat.name as category_name from menu_items mi
     left join menu_categories cat on cat.id = mi.category_id
     where mi.restaurant_id = $1 and mi.available = true`,
    [restaurantId]
  );
  return { source: "default", items: defaultItems.rows };
}
