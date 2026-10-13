import { query } from "@/lib/db";

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export async function getRestaurant(restaurantId) {
  const result = await query("select * from restaurants where id = $1", [restaurantId]);
  return result.rows[0] || null;
}

export async function getSettings(restaurantId) {
  const result = await query("select * from restaurant_settings where restaurant_id = $1", [restaurantId]);
  return result.rows[0] || null;
}

export async function updateSettings(restaurantId, patch) {
  const fields = [
    "description",
    "address",
    "phone",
    "total_seating_capacity",
    "amenities",
    "parking_info",
    "reservation_policy",
    "cancellation_policy",
    "supported_languages",
    "voice_greeting",
    "voice_behavior_notes",
    "opening_hours",
    "special_hours"
  ];
  const sets = [];
  const values = [restaurantId];
  for (const field of fields) {
    if (!(field in patch)) continue;
    values.push(patch[field]);
    sets.push(`${field} = $${values.length}`);
  }
  if (!sets.length) return getSettings(restaurantId);
  sets.push("updated_at = now()");
  const result = await query(
    `update restaurant_settings set ${sets.join(", ")} where restaurant_id = $1 returning *`,
    values
  );
  return result.rows[0];
}

export async function getBookingRules(restaurantId) {
  const result = await query("select * from booking_rules where restaurant_id = $1", [restaurantId]);
  return result.rows[0] || null;
}

export async function updateBookingRules(restaurantId, patch) {
  const fields = [
    "max_party_size_auto",
    "max_tables_per_auto_booking",
    "full_table_requires_approval",
    "combined_table_requires_approval",
    "large_group_threshold",
    "deposit_required",
    "reservation_duration_minutes",
    "turnover_buffer_minutes",
    "slot_interval_minutes",
    "cancellation_deadline_hours",
    "modification_deadline_hours",
    "hold_duration_minutes"
  ];
  const sets = [];
  const values = [restaurantId];
  for (const field of fields) {
    if (!(field in patch)) continue;
    values.push(patch[field]);
    sets.push(`${field} = $${values.length}`);
  }
  if (!sets.length) return getBookingRules(restaurantId);
  sets.push("updated_at = now()");
  const result = await query(
    `update booking_rules set ${sets.join(", ")} where restaurant_id = $1 returning *`,
    values
  );
  return result.rows[0];
}

/** Returns { open: "11:00", close: "22:30" } or null when closed, honoring special_hours overrides. */
export function openingWindowForDate(settings, isoDate) {
  const special = (settings.special_hours || []).find((entry) => entry.date === isoDate);
  if (special) {
    if (special.closed) return null;
    return { open: special.open, close: special.close, label: special.label };
  }
  const weekday = WEEKDAY_KEYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay() === 0 ? 6 : new Date(`${isoDate}T00:00:00Z`).getUTCDay() - 1];
  const day = settings.opening_hours?.[weekday];
  if (!day || day.closed) return null;
  return { open: day.open, close: day.close };
}

export function isWithinOpeningHours(settings, isoDate, hhmm, durationMinutes) {
  const window = openingWindowForDate(settings, isoDate);
  if (!window) return { ok: false, reason: "The restaurant is closed on that date." };
  const start = toMinutes(hhmm);
  const end = start + durationMinutes;
  const openMin = toMinutes(window.open);
  const closeMin = toMinutes(window.close);
  if (start < openMin || end > closeMin) {
    return { ok: false, reason: `We are open from ${window.open} to ${window.close} on that date.` };
  }
  return { ok: true };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export async function listExtraInfo(restaurantId, { onlyActive = false } = {}) {
  const result = await query(
    `select * from restaurant_extra_info where restaurant_id = $1 ${onlyActive ? "and active = true" : ""}
     order by sort_order, created_at`,
    [restaurantId]
  );
  return result.rows;
}

export async function upsertExtraInfo(restaurantId, item) {
  if (item.id) {
    const result = await query(
      `update restaurant_extra_info set topic = $2, detail = $3, active = $4, sort_order = $5, updated_at = now()
       where id = $1 and restaurant_id = $6 returning *`,
      [item.id, item.topic, item.detail, item.active !== false, item.sortOrder || 0, restaurantId]
    );
    return result.rows[0];
  }
  const result = await query(
    `insert into restaurant_extra_info (restaurant_id, topic, detail, sort_order) values ($1,$2,$3,$4) returning *`,
    [restaurantId, item.topic, item.detail, item.sortOrder || 0]
  );
  return result.rows[0];
}

export async function deleteExtraInfo(restaurantId, id) {
  await query("delete from restaurant_extra_info where id = $1 and restaurant_id = $2", [id, restaurantId]);
}

export { WEEKDAY_KEYS };
