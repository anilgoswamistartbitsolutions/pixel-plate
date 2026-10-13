import { query } from "@/lib/db";

export async function listFloors(restaurantId) {
  const result = await query(
    "select * from floors where restaurant_id = $1 order by sort_order, name",
    [restaurantId]
  );
  return result.rows;
}

export async function createFloor(restaurantId, { name, sortOrder }) {
  const result = await query(
    "insert into floors (restaurant_id, name, sort_order) values ($1,$2,$3) returning *",
    [restaurantId, name, sortOrder || 0]
  );
  return result.rows[0];
}

/** Only deletable while no table is assigned -- otherwise reassign or deactivate the tables
 * first (restaurant_tables.floor_id already ON DELETE SET NULL as a backstop either way). */
export async function deleteFloor(restaurantId, id) {
  const tableCheck = await query("select 1 from restaurant_tables where floor_id = $1 limit 1", [id]);
  if (tableCheck.rows.length) {
    const error = new Error("This floor still has tables assigned -- move or remove them first.");
    error.code = "has_tables";
    throw error;
  }
  await query("delete from floors where id = $1 and restaurant_id = $2", [id, restaurantId]);
  return { deleted: true };
}

export async function updateFloor(restaurantId, id, { name, sortOrder, active }) {
  const result = await query(
    `update floors set name = coalesce($3,name), sort_order = coalesce($4,sort_order), active = coalesce($5,active)
     where id = $1 and restaurant_id = $2 returning *`,
    [id, restaurantId, name ?? null, sortOrder ?? null, active ?? null]
  );
  return result.rows[0];
}

export const DAILY_SLOT_DEFAULTS = {
  morning: { start_time: "09:00", end_time: "12:00" },
  midday: { start_time: "13:00", end_time: "16:00" },
  evening: { start_time: "18:00", end_time: "22:00" }
};

export async function getDailySlots(restaurantId) {
  const result = await query("select * from daily_slots where restaurant_id = $1 order by start_time", [restaurantId]);
  if (result.rows.length) return result.rows;
  return Object.entries(DAILY_SLOT_DEFAULTS).map(([slot, times]) => ({ restaurant_id: restaurantId, slot, ...times }));
}

export async function setDailySlot(restaurantId, slot, { startTime, endTime }) {
  const result = await query(
    `insert into daily_slots (restaurant_id, slot, start_time, end_time) values ($1,$2,$3,$4)
     on conflict (restaurant_id, slot) do update set start_time = excluded.start_time, end_time = excluded.end_time
     returning *`,
    [restaurantId, slot, startTime, endTime]
  );
  return result.rows[0];
}

/** Which of the three daily slots a given hh:mm falls into, or null if outside all three. */
export function slotForTime(slots, hhmm) {
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const target = toMin(hhmm);
  const match = slots.find((s) => target >= toMin(s.start_time.slice(0, 5)) && target < toMin(s.end_time.slice(0, 5)));
  return match?.slot || null;
}
