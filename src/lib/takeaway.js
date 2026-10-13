import { query, withTransaction } from "@/lib/db";
import { getSettings, getBookingRules, isWithinOpeningHours, windowsForDate } from "@/lib/restaurant";
import { getDailySlots } from "@/lib/floors";
import { normalizePhone, phonesMatch } from "@/lib/phone";

export class TakeawayError extends Error {
  constructor(message, code = "takeaway_failed") {
    super(message);
    this.code = code;
  }
}

const SERVICE_CHARGE_PCT = 5;

/** Rounds a requested pickup time up to the nearest configured slot interval (default 30
 * minutes) -- prep takes time, so a guest can't ask for a pickup in the next five minutes. */
export function roundToSlotInterval(hhmm, intervalMinutes, prepBufferMinutes) {
  const now = new Date();
  const [h, m] = hhmm.split(":").map(Number);
  const requested = new Date(now);
  requested.setHours(h, m, 0, 0);

  const earliest = new Date(now.getTime() + prepBufferMinutes * 60000);
  const base = requested < earliest ? earliest : requested;
  const totalMinutes = base.getHours() * 60 + base.getMinutes();
  const roundedMinutes = Math.ceil(totalMinutes / intervalMinutes) * intervalMinutes;
  const rh = Math.floor(roundedMinutes / 60) % 24;
  const rm = roundedMinutes % 60;
  return `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}`;
}

/**
 * Quotes a takeaway order from {menuItemId, quantity, variantLabel?} lines -- always re-prices
 * from the current menu_items table (never trusts a client-supplied price). A variantLabel
 * (e.g. "Large") is looked up against that item's size_options for its own price; an unknown
 * variant is refused rather than silently falling back to the base price.
 */
export async function quoteTakeaway(restaurantId, lines) {
  if (!lines?.length) throw new TakeawayError("At least one item is required.", "validation");
  const ids = lines.map((l) => l.menuItemId);
  const result = await query(
    "select * from menu_items where restaurant_id = $1 and id = any($2::bigint[])",
    [restaurantId, ids]
  );
  const byId = new Map(result.rows.map((r) => [String(r.id), r]));

  const items = lines.map((line) => {
    const item = byId.get(String(line.menuItemId));
    if (!item) throw new TakeawayError(`Menu item ${line.menuItemId} was not found.`, "not_found");
    if (!item.available || item.sold_out) throw new TakeawayError(`${item.name} is currently unavailable.`, "unavailable");
    const quantity = Math.max(1, Number(line.quantity) || 1);

    let unitPriceCents = item.price_cents;
    let variantLabel = null;
    if (line.variantLabel) {
      const options = item.size_options || [];
      const match = options.find((o) => o.label.toLowerCase() === line.variantLabel.toLowerCase());
      if (!match) throw new TakeawayError(`${item.name} doesn't have a "${line.variantLabel}" option.`, "not_found");
      unitPriceCents = match.price_cents;
      variantLabel = match.label;
    }

    return { menuItemId: item.id, name: item.name, quantity, unitPriceCents, variantLabel };
  });

  const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  const serviceChargeCents = Math.round((subtotalCents * SERVICE_CHARGE_PCT) / 100);
  const totalCents = subtotalCents + serviceChargeCents;

  return { items, subtotalCents, serviceChargePct: SERVICE_CHARGE_PCT, serviceChargeCents, totalCents };
}

function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function minutesToHhmm(total) {
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The fixed pickup times still bookable today: aligned to the takeaway slot interval (so
 * 7:00, 7:30, 8:00 -- never 7:12), no earlier than the prep buffer from right now, and inside
 * today's opening windows. Pass a slot ("morning" | "midday" | "evening") to narrow it to that
 * shift's serving window. Shared by the staff New Takeaway form and the voice agent so the two
 * can never offer different times.
 */
export async function listPickupOptions(restaurantId, { slot } = {}) {
  const settings = await getSettings(restaurantId);
  const rules = await getBookingRules(restaurantId);
  const interval = rules?.takeaway_slot_interval_minutes ?? 30;
  const prepBuffer = rules?.takeaway_prep_buffer_minutes ?? 30;
  const today = new Date().toISOString().slice(0, 10);
  const openWindows = windowsForDate(settings, today) || [];

  const now = new Date();
  const earliestMinutes = now.getHours() * 60 + now.getMinutes() + prepBuffer;

  let shiftBounds = null;
  if (slot) {
    const slots = await getDailySlots(restaurantId);
    const match = slots.find((s) => s.slot === slot);
    if (match) {
      shiftBounds = {
        start: hhmmToMinutes(String(match.start_time).slice(0, 5)),
        end: hhmmToMinutes(String(match.end_time).slice(0, 5))
      };
    }
  }

  const options = [];
  for (const w of openWindows) {
    let lo = Math.max(hhmmToMinutes(w.open), earliestMinutes);
    let hi = hhmmToMinutes(w.close);
    if (shiftBounds) { lo = Math.max(lo, shiftBounds.start); hi = Math.min(hi, shiftBounds.end); }
    for (let t = Math.ceil(lo / interval) * interval; t <= hi; t += interval) options.push(minutesToHhmm(t));
  }

  return {
    date: today,
    slot: slot || null,
    intervalMinutes: interval,
    prepBufferMinutes: prepBuffer,
    windows: openWindows,
    options
  };
}

/** Validates a requested pickup time: must round cleanly onto the restaurant's takeaway slot
 * interval, honor the prep buffer, and fall inside today's opening hours. */
async function validatePickupTime(restaurantId, requestedTime) {
  const rules = await getBookingRules(restaurantId);
  const settings = await getSettings(restaurantId);
  const interval = rules?.takeaway_slot_interval_minutes ?? 30;
  const prepBuffer = rules?.takeaway_prep_buffer_minutes ?? 30;
  const today = new Date().toISOString().slice(0, 10);

  const resolvedTime = requestedTime ? roundToSlotInterval(requestedTime, interval, prepBuffer) : roundToSlotInterval(
    `${new Date().getHours()}:${new Date().getMinutes()}`, interval, prepBuffer
  );

  const hoursCheck = isWithinOpeningHours(settings, today, resolvedTime, 1);
  if (!hoursCheck.ok) throw new TakeawayError(`We can't schedule a pickup for that time -- ${hoursCheck.reason}`, "closed");
  return resolvedTime;
}

/** Refuses a new order once too many are already pending/preparing at once, so the kitchen is
 * never silently overcommitted -- the caller (agent-tools) turns this into a staff callback
 * offer instead of a false "order placed". */
async function checkConcurrencyLimit(restaurantId) {
  const rules = await getBookingRules(restaurantId);
  const limit = rules?.takeaway_max_concurrent ?? 15;
  const result = await query(
    "select count(*)::int as count from takeaway_orders where restaurant_id = $1 and status in ('pending','preparing')",
    [restaurantId]
  );
  if (result.rows[0].count >= limit) {
    throw new TakeawayError(
      "We're at capacity for takeout orders right now -- a staff member needs to confirm this one with you directly.",
      "limit_reached"
    );
  }
}

export async function createTakeawayOrder({ restaurantId, customerName, phone, lines, requestedSlot, requestedTime, notes, source = "staff", createdByStaffId = null }) {
  if (!customerName?.trim()) throw new TakeawayError("Customer name is required.", "validation");
  if (!phone?.trim()) throw new TakeawayError("A contact phone number is required.", "validation");
  phone = normalizePhone(phone);

  await checkConcurrencyLimit(restaurantId);
  const resolvedTime = await validatePickupTime(restaurantId, requestedTime);
  const quote = await quoteTakeaway(restaurantId, lines);

  return withTransaction(async (client) => {
    const orderResult = await client.query(
      `insert into takeaway_orders
        (restaurant_id, customer_name, phone, requested_slot, requested_time, subtotal_cents,
         service_charge_pct, service_charge_cents, total_cents, notes, source, created_by_staff_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [
        restaurantId, customerName, phone, requestedSlot || null, resolvedTime,
        quote.subtotalCents, quote.serviceChargePct, quote.serviceChargeCents, quote.totalCents,
        notes || null, source, createdByStaffId
      ]
    );
    const order = orderResult.rows[0];
    for (const item of quote.items) {
      await client.query(
        `insert into takeaway_order_items (takeaway_order_id, menu_item_id, item_name, quantity, unit_price_cents, variant_label)
         values ($1,$2,$3,$4,$5,$6)`,
        [order.id, item.menuItemId, item.name, item.quantity, item.unitPriceCents, item.variantLabel]
      );
    }
    return { order, items: quote.items, quote };
  });
}

export async function listTakeawayOrders({ restaurantId, status }) {
  const conditions = ["restaurant_id = $1"];
  const values = [restaurantId];
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  const result = await query(
    `select o.*, coalesce(
        (select json_agg(json_build_object('name', ti.item_name, 'quantity', ti.quantity, 'unit_price_cents', ti.unit_price_cents, 'variant_label', ti.variant_label))
         from takeaway_order_items ti where ti.takeaway_order_id = o.id),
        '[]') as items
     from takeaway_orders o where ${conditions.join(" and ")} order by o.created_at desc`,
    values
  );
  return result.rows;
}

export async function getTakeawayStatus({ restaurantId, orderRef, phone }) {
  const result = await query("select * from takeaway_orders where restaurant_id = $1 and order_ref = $2", [restaurantId, orderRef]);
  const order = result.rows[0];
  if (!order) return null;
  // Required, not optional -- see the matching note in reservations.js getReservationStatus.
  if (!phonesMatch(order.phone, phone)) {
    return { verificationFailed: true };
  }
  return order;
}

const VALID_STATUSES = ["pending", "preparing", "prepared_paid", "taken", "no_pickup", "cancelled", "other"];

export async function updateTakeawayStatus(restaurantId, id, { status, paymentStatus }) {
  if (status && !VALID_STATUSES.includes(status)) throw new TakeawayError("Invalid status.", "validation");
  const result = await query(
    `update takeaway_orders set
       status = coalesce($3, status),
       payment_status = coalesce($4, payment_status),
       updated_at = now()
     where id = $1 and restaurant_id = $2 returning *`,
    [id, restaurantId, status || null, paymentStatus || null]
  );
  return result.rows[0];
}

/** Replace the line items (and/or quantities) on a still-pending order. Refuses once the
 * kitchen has started preparing it. */
export async function modifyTakeawayOrder(restaurantId, id, lines) {
  const quote = await quoteTakeaway(restaurantId, lines);
  return withTransaction(async (client) => {
    const existingResult = await client.query(
      "select * from takeaway_orders where id = $1 and restaurant_id = $2 for update",
      [id, restaurantId]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new TakeawayError("Takeaway order not found.", "not_found");
    if (existing.status !== "pending") throw new TakeawayError("This order is already being prepared -- ask staff to change it.", "needs_staff");

    await client.query("delete from takeaway_order_items where takeaway_order_id = $1", [id]);
    for (const item of quote.items) {
      await client.query(
        `insert into takeaway_order_items (takeaway_order_id, menu_item_id, item_name, quantity, unit_price_cents, variant_label)
         values ($1,$2,$3,$4,$5,$6)`,
        [id, item.menuItemId, item.name, item.quantity, item.unitPriceCents, item.variantLabel]
      );
    }
    const updated = await client.query(
      `update takeaway_orders set subtotal_cents=$2, service_charge_cents=$3, total_cents=$4, updated_at=now()
       where id = $1 returning *`,
      [id, quote.subtotalCents, quote.serviceChargeCents, quote.totalCents]
    );
    return { order: updated.rows[0], quote };
  });
}
