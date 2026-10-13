import { getRestaurant, getSettings, windowsForDate, listExtraInfo } from "@/lib/restaurant";
import { getDailySpecials } from "@/lib/menu";
import { checkAvailability, toWindow } from "@/lib/availability";
import { createReservation, cancelReservation, modifyReservation, getReservationStatus, BookingError } from "@/lib/reservations";
import { createGroupRequest } from "@/lib/group-requests";
import { createFollowup } from "@/lib/calls";
import { getBookingRules } from "@/lib/restaurant";
import { getDailySlots, slotForTime } from "@/lib/floors";
import { getMenuForDate, getMenuForDateSlot } from "@/lib/menu-config";
import { createTakeawayOrder, quoteTakeaway, modifyTakeawayOrder, getTakeawayStatus, updateTakeawayStatus, listPickupOptions, TakeawayError } from "@/lib/takeaway";
import { query } from "@/lib/db";

/**
 * The explicit, typed tools the voice agent (and only the voice agent -- never the raw
 * LLM output) is allowed to call. Every tool here re-derives its answer from the database
 * at call time; none of them trust anything the model "remembers" from earlier turns.
 * This is also the exact surface wired up as webhook tools on the "Pixel Plate (Prod)"
 * agent (see scripts/configure-voice-agent and /api/agent-tools/*).
 */

export const TOOLS = {
  async get_restaurant_information({ restaurantId }) {
    const restaurant = await getRestaurant(restaurantId);
    const settings = await getSettings(restaurantId);
    const extraInfo = await listExtraInfo(restaurantId, { onlyActive: true });
    return {
      name: restaurant?.name,
      description: settings?.description,
      address: settings?.address,
      phone: settings?.phone,
      amenities: settings?.amenities,
      parking_info: settings?.parking_info,
      reservation_policy: settings?.reservation_policy,
      cancellation_policy: settings?.cancellation_policy,
      supported_languages: settings?.supported_languages,
      // Free-form topics staff added in Restaurant Information > Extra Info -- e.g. birthday
      // policy, dress code, live music nights. Only rows marked active are ever returned.
      extra_info: extraInfo.map((row) => ({ topic: row.topic, detail: row.detail }))
    };
  },

  // A day can have more than one open window (e.g. lunch 11-2, closed, dinner 5-10), so this
  // always returns a `windows` list -- read every entry before telling a caller the hours.
  async get_opening_hours({ restaurantId, date }) {
    const settings = await getSettings(restaurantId);
    const isoDate = date || new Date().toISOString().slice(0, 10);
    const windows = windowsForDate(settings, isoDate);
    return windows ? { date: isoDate, closed: false, windows } : { date: isoDate, closed: true, windows: [] };
  },

  // slot: 'morning' | 'midday' | 'evening' (the restaurant's three daily serving windows --
  // see Menu & Daily Specials > Daily Slots). date: defaults to today, and pulls whatever
  // menu configuration staff assigned to that specific date (Monday special, Thanksgiving
  // special, etc.) instead of the default menu, when one is assigned.
  async get_menu({ restaurantId, date, slot, categoryName }) {
    const isoDate = date || new Date().toISOString().slice(0, 10);
    const { mode, items, configurationName } = slot
      ? await getMenuForDateSlot(restaurantId, isoDate, slot)
      : { ...(await getMenuForDate(restaurantId, isoDate)), mode: undefined };
    if (mode === "closed") return { date: isoDate, slot, closed: true, items: [] };
    const filtered = categoryName ? items.filter((i) => i.category_name?.toLowerCase() === categoryName.toLowerCase()) : items;
    return { date: isoDate, slot: slot || null, menu_source: mode || "default", configuration: configurationName || null, items: filtered.map(formatMenuItem) };
  },

  async get_daily_slots({ restaurantId }) {
    const slots = await getDailySlots(restaurantId);
    return slots.map((s) => ({ slot: s.slot, start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) }));
  },

  async get_daily_specials({ restaurantId }) {
    const items = await getDailySpecials(restaurantId);
    return items.map(formatMenuItem);
  },

  async get_menu_item_availability({ restaurantId, itemName }) {
    const result = await query(
      "select * from menu_items where restaurant_id = $1 and name ilike $2 limit 1",
      [restaurantId, `%${itemName}%`]
    );
    const item = result.rows[0];
    if (!item) return { found: false };
    return { found: true, ...formatMenuItem(item) };
  },

  // Callers ask "do you have outdoor seating?" or "what's the rooftop like?" -- they never want
  // a list of 56 table codes. This answers at the room level, using each floor's description.
  async get_seating_options({ restaurantId }) {
    const result = await query(
      `select f.name, f.description,
              count(t.id) filter (where t.active) as table_count,
              coalesce(sum(t.capacity) filter (where t.active), 0) as seat_count,
              max(t.capacity) filter (where t.active) as largest_table,
              bool_or(t.shareable) filter (where t.active) as has_shareable
       from floors f
       left join restaurant_tables t on t.floor_id = f.id
       where f.restaurant_id = $1 and f.active = true
       group by f.id, f.name, f.description, f.sort_order
       order by f.sort_order`,
      [restaurantId]
    );
    const rooms = result.rows
      .filter((r) => Number(r.table_count) > 0)
      .map((r) => ({
        room: r.name,
        description: r.description,
        tables: Number(r.table_count),
        seats: Number(r.seat_count),
        largest_table_seats: r.largest_table ? Number(r.largest_table) : null,
        shared_seating_available: !!r.has_shareable
      }));
    return {
      rooms,
      total_tables: rooms.reduce((s, r) => s + r.tables, 0),
      total_seats: rooms.reduce((s, r) => s + r.seats, 0),
      largest_single_table_seats: rooms.reduce((m, r) => Math.max(m, r.largest_table_seats || 0), 0)
    };
  },

  // Takeout pickup is only offered on fixed slots (7:00, 7:30, ...), never a free-form time:
  // the kitchen needs the prep buffer and the restaurant has to be open. Call this before
  // promising any pickup time, and read back only times this returns.
  async get_takeaway_pickup_times({ restaurantId, slot }) {
    const result = await listPickupOptions(restaurantId, { slot: slot || undefined });
    return {
      date: result.date,
      slot: result.slot,
      slot_interval_minutes: result.intervalMinutes,
      minimum_notice_minutes: result.prepBufferMinutes,
      available_times: result.options,
      none_left_today: result.options.length === 0
    };
  },

  async check_table_availability({ restaurantId, date, time, partySize, preference }) {
    const rules = await getBookingRules(restaurantId);
    const { startAt, endAt } = toWindow(date, time, rules?.reservation_duration_minutes || 90);
    const plan = await checkAvailability({ restaurantId, startAt, endAt, partySize, preference });
    return plan.ok
      ? {
          available: true,
          seating_mode: plan.seatingMode,
          summary: plan.summary,
          requires_approval: plan.requiresApproval,
          // True when the party asked to sit together but only fits across several tables --
          // tell the guest that plainly and let them decide before booking.
          split_required: !!plan.splitRequired
        }
      : { available: false, reason: plan.reason };
  },

  async create_reservation({ restaurantId, customerName, phone, altPhone, partySize, date, time, preference, notes }) {
    try {
      const result = await createReservation({
        restaurantId, customerName, phone, altPhone, partySize,
        reservationDate: date, startTime: time, seatingPreference: preference, notes,
        source: "voice_agent"
      });
      if (result.status === "confirmed") {
        return {
          confirmed: true,
          booking_ref: result.reservation.booking_ref,
          seating_mode: result.reservation.seating_mode,
          summary: result.plan.summary
        };
      }
      return { confirmed: false, pending: true, reason: result.reason || "This needs staff review before it can be confirmed." };
    } catch (error) {
      if (error instanceof BookingError) return { confirmed: false, error: error.message };
      throw error;
    }
  },

  async create_group_booking_request({ restaurantId, customerName, phone, partySize, date, time, preference, notes }) {
    const request = await createGroupRequest({
      restaurantId, customerName, phone, partySize,
      requestedDate: date, requestedTime: time, seatingPreference: preference, notes
    });
    return { request_id: request.id, status: request.status };
  },

  async get_reservation_status({ restaurantId, bookingRef, phone }) {
    const reservation = await getReservationStatus({ restaurantId, bookingRef, phone });
    if (!reservation) return { found: false };
    if (reservation.verificationFailed) return { found: true, verified: false };
    return {
      found: true,
      verified: true,
      status: reservation.status,
      date: reservation.reservation_date,
      time: reservation.start_time,
      party_size: reservation.party_size
    };
  },

  async modify_reservation({ restaurantId, bookingRef, phone, date, time, partySize }) {
    const existing = await getReservationStatus({ restaurantId, bookingRef, phone });
    if (!existing || existing.verificationFailed) return { modified: false, error: "We could not verify this booking." };
    try {
      const result = await modifyReservation({
        restaurantId, reservationId: existing.id,
        changes: { reservationDate: date, startTime: time, partySize }, modifiedBy: "voice_agent"
      });
      return { modified: true, summary: result.plan.summary };
    } catch (error) {
      if (error instanceof BookingError) return { modified: false, error: error.message, needs_staff: error.code === "needs_staff" };
      throw error;
    }
  },

  async cancel_reservation({ restaurantId, bookingRef, phone, reason }) {
    const existing = await getReservationStatus({ restaurantId, bookingRef, phone });
    if (!existing || existing.verificationFailed) return { cancelled: false, error: "We could not verify this booking." };
    try {
      await cancelReservation({ restaurantId, reservationId: existing.id, reason, cancelledBy: "voice_agent" });
      return { cancelled: true };
    } catch (error) {
      if (error instanceof BookingError) return { cancelled: false, error: error.message, needs_staff: error.code === "needs_staff" };
      throw error;
    }
  },

  async create_staff_followup({ restaurantId, title, notes, callId, reservationBookingRef }) {
    let reservationId = null;
    if (reservationBookingRef) {
      const r = await query("select id from reservations where restaurant_id=$1 and booking_ref=$2", [restaurantId, reservationBookingRef]);
      reservationId = r.rows[0]?.id || null;
    }
    const followup = await createFollowup({ restaurantId, callId, reservationId, title, notes });
    return { followup_id: followup.id };
  },

  async request_human_handoff({ restaurantId, callId, reason }) {
    const followup = await createFollowup({
      restaurantId, callId, title: "Caller requested a human", notes: reason
    });
    return { escalated: true, followup_id: followup.id, message: "A staff member will follow up as soon as possible." };
  },

  // --- Takeaway -------------------------------------------------------------------------
  // items: [{ name, quantity }] -- resolved against the live menu by name so the agent never
  // has to know internal menu item IDs. Quoting is a separate step from creating: the agent
  // must read back the total (including the 5% service charge) and get explicit confirmation
  // before calling create_takeaway_order.
  async quote_takeaway_order({ restaurantId, items, itemsText }) {
    try {
      const lines = await resolveItemNames(restaurantId, items || parseItemsText(itemsText));
      const quote = await quoteTakeaway(restaurantId, lines);
      return {
        ok: true,
        items: quote.items.map((i) => ({ name: i.name, quantity: i.quantity, unit_price: (i.unitPriceCents / 100).toFixed(2) })),
        subtotal: (quote.subtotalCents / 100).toFixed(2),
        service_charge_pct: quote.serviceChargePct,
        total: (quote.totalCents / 100).toFixed(2),
        currency: "USD"
      };
    } catch (error) {
      if (error instanceof TakeawayError) return { ok: false, error: error.message };
      throw error;
    }
  },

  async create_takeaway_order({ restaurantId, customerName, phone, items, itemsText, slot, time, notes }) {
    try {
      const lines = await resolveItemNames(restaurantId, items || parseItemsText(itemsText));
      const result = await createTakeawayOrder({
        restaurantId, customerName, phone, lines, requestedSlot: slot, requestedTime: time, notes, source: "voice_agent"
      });
      return {
        confirmed: true,
        order_ref: result.order.order_ref,
        total: (result.order.total_cents / 100).toFixed(2),
        payment: "Pay at pickup",
        status: result.order.status
      };
    } catch (error) {
      if (error instanceof TakeawayError) {
        // Hitting the capacity limit is never just a dead end for the caller -- always leave
        // staff a callback task with exactly what the guest wanted, so a human follows up
        // instead of the guest just being told "no" and hanging up.
        if (error.code === "limit_reached") {
          const followup = await createFollowup({
            restaurantId,
            title: `Takeaway capacity reached -- callback needed for ${customerName}`,
            notes: `Phone: ${phone}. Wanted: ${(items || []).map((i) => `${i.quantity || 1}x ${i.name}`).join(", ") || itemsText}. Requested pickup: ${slot || "unspecified"}${time ? ` at ${time}` : ""}.${notes ? ` Notes: ${notes}` : ""}`
          });
          return {
            confirmed: false, error: error.message, needs_staff: true, callback_requested: true,
            followup_id: followup.id,
            message: "We're at capacity right now -- a staff member has the details and will call back to confirm, or you can hold while I connect you."
          };
        }
        return { confirmed: false, error: error.message };
      }
      throw error;
    }
  },

  async modify_takeaway_order({ restaurantId, orderRef, phone, items, itemsText }) {
    const existing = await getTakeawayStatus({ restaurantId, orderRef, phone });
    if (!existing || existing.verificationFailed) return { modified: false, error: "We could not verify this order." };
    try {
      const lines = await resolveItemNames(restaurantId, items || parseItemsText(itemsText));
      const result = await modifyTakeawayOrder(restaurantId, existing.id, lines);
      return { modified: true, total: (result.order.total_cents / 100).toFixed(2) };
    } catch (error) {
      if (error instanceof TakeawayError) return { modified: false, error: error.message, needs_staff: error.code === "needs_staff" };
      throw error;
    }
  },

  async get_takeaway_status({ restaurantId, orderRef, phone }) {
    const order = await getTakeawayStatus({ restaurantId, orderRef, phone });
    if (!order) return { found: false };
    if (order.verificationFailed) return { found: true, verified: false };
    return { found: true, verified: true, status: order.status, payment_status: order.payment_status, total: (order.total_cents / 100).toFixed(2) };
  },

  async cancel_takeaway_order({ restaurantId, orderRef, phone }) {
    const existing = await getTakeawayStatus({ restaurantId, orderRef, phone });
    if (!existing || existing.verificationFailed) return { cancelled: false, error: "We could not verify this order." };
    if (existing.status !== "pending") return { cancelled: false, error: "This order is already being prepared -- ask staff to cancel it." };
    await updateTakeawayStatus(restaurantId, existing.id, { status: "cancelled" });
    return { cancelled: true };
  }
};

// The agent platform's simple webhook-tool params only support Text/Number/Boolean/enum --
// no arrays -- so the voice agent passes items as free text ("2 California Burgers, 1 Baja
// Fish Tacos") and this parses it into {name, quantity} lines. The dashboard's own takeaway
// UI calls the lib functions directly with a real array and never goes through this parser.
function parseItemsText(text) {
  if (!text?.trim()) return [];
  return text.split(",").map((part) => {
    const trimmed = part.trim();
    const match = trimmed.match(/^(\d+)\s*[x×]?\s*(.+)$/i);
    return match ? { name: match[2].trim(), quantity: Number(match[1]) } : { name: trimmed, quantity: 1 };
  }).filter((l) => l.name);
}

async function resolveItemNames(restaurantId, items) {
  if (!items?.length) throw new TakeawayError("At least one item is required.", "validation");
  const lines = [];
  for (const line of items) {
    const result = await query(
      "select id, name from menu_items where restaurant_id = $1 and available = true and sold_out = false and name ilike $2 limit 1",
      [restaurantId, `%${line.name}%`]
    );
    const item = result.rows[0];
    if (!item) throw new TakeawayError(`We couldn't find "${line.name}" on the menu.`, "not_found");
    lines.push({ menuItemId: item.id, quantity: line.quantity || 1 });
  }
  return lines;
}

function formatMenuItem(item) {
  return {
    name: item.name,
    description: item.description,
    price: (item.price_cents / 100).toFixed(2),
    currency: item.currency,
    category: item.category_name,
    dietary_tags: item.dietary_tags,
    allergens: item.allergens,
    complimentary: item.complimentary,
    sold_out: item.sold_out
  };
}

export async function runTool(name, args) {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Unknown agent tool: ${name}`);
  return tool(args);
}
