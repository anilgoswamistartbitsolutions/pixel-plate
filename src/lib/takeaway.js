import { query, withTransaction } from "@/lib/db";

export class TakeawayError extends Error {
  constructor(message, code = "takeaway_failed") {
    super(message);
    this.code = code;
  }
}

const SERVICE_CHARGE_PCT = 5;

/**
 * Quotes a takeaway order from {menuItemId, quantity} lines -- always re-prices from the
 * current menu_items table (never trusts a client-supplied price), and refuses sold-out or
 * unavailable items rather than silently dropping them.
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
    return { menuItemId: item.id, name: item.name, quantity, unitPriceCents: item.price_cents };
  });

  const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  const serviceChargeCents = Math.round((subtotalCents * SERVICE_CHARGE_PCT) / 100);
  const totalCents = subtotalCents + serviceChargeCents;

  return { items, subtotalCents, serviceChargePct: SERVICE_CHARGE_PCT, serviceChargeCents, totalCents };
}

export async function createTakeawayOrder({ restaurantId, customerName, phone, lines, requestedSlot, requestedTime, notes, source = "staff", createdByStaffId = null }) {
  if (!customerName?.trim()) throw new TakeawayError("Customer name is required.", "validation");
  if (!phone?.trim()) throw new TakeawayError("A contact phone number is required.", "validation");

  const quote = await quoteTakeaway(restaurantId, lines);

  return withTransaction(async (client) => {
    const orderResult = await client.query(
      `insert into takeaway_orders
        (restaurant_id, customer_name, phone, requested_slot, requested_time, subtotal_cents,
         service_charge_pct, service_charge_cents, total_cents, notes, source, created_by_staff_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [
        restaurantId, customerName, phone, requestedSlot || null, requestedTime || null,
        quote.subtotalCents, quote.serviceChargePct, quote.serviceChargeCents, quote.totalCents,
        notes || null, source, createdByStaffId
      ]
    );
    const order = orderResult.rows[0];
    for (const item of quote.items) {
      await client.query(
        `insert into takeaway_order_items (takeaway_order_id, menu_item_id, item_name, quantity, unit_price_cents)
         values ($1,$2,$3,$4,$5)`,
        [order.id, item.menuItemId, item.name, item.quantity, item.unitPriceCents]
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
        (select json_agg(json_build_object('name', ti.item_name, 'quantity', ti.quantity, 'unit_price_cents', ti.unit_price_cents))
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
  if (phone && order.phone.replace(/\D/g, "").slice(-6) !== String(phone).replace(/\D/g, "").slice(-6)) {
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

/** Replace the line items on a still-pending order (guest said "actually, change it to...").
 * Refuses once the kitchen has started preparing it. */
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
        `insert into takeaway_order_items (takeaway_order_id, menu_item_id, item_name, quantity, unit_price_cents)
         values ($1,$2,$3,$4,$5)`,
        [id, item.menuItemId, item.name, item.quantity, item.unitPriceCents]
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
