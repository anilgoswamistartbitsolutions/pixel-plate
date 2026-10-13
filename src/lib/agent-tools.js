import { getRestaurant, getSettings, openingWindowForDate } from "@/lib/restaurant";
import { listMenu, getDailySpecials, recommendItems, currentMealPeriod } from "@/lib/menu";
import { checkAvailability, toWindow } from "@/lib/availability";
import { createReservation, cancelReservation, modifyReservation, getReservationStatus, BookingError } from "@/lib/reservations";
import { createGroupRequest } from "@/lib/group-requests";
import { createFollowup } from "@/lib/calls";
import { getBookingRules } from "@/lib/restaurant";
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
    return {
      name: restaurant?.name,
      description: settings?.description,
      address: settings?.address,
      phone: settings?.phone,
      amenities: settings?.amenities,
      parking_info: settings?.parking_info,
      reservation_policy: settings?.reservation_policy,
      cancellation_policy: settings?.cancellation_policy,
      supported_languages: settings?.supported_languages
    };
  },

  async get_opening_hours({ restaurantId, date }) {
    const settings = await getSettings(restaurantId);
    const isoDate = date || new Date().toISOString().slice(0, 10);
    const window = openingWindowForDate(settings, isoDate);
    return window ? { date: isoDate, open: window.open, close: window.close } : { date: isoDate, closed: true };
  },

  async get_menu({ restaurantId, mealPeriod, categoryName }) {
    const items = await listMenu({ restaurantId, mealPeriod: mealPeriod || currentMealPeriod() });
    const filtered = categoryName
      ? items.filter((i) => i.category_name?.toLowerCase() === categoryName.toLowerCase())
      : items;
    return filtered.map(formatMenuItem);
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

  async get_seating_options({ restaurantId }) {
    const result = await query(
      "select code, display_name, capacity, table_type, shareable from restaurant_tables where restaurant_id = $1 and active = true order by code",
      [restaurantId]
    );
    return result.rows;
  },

  async check_table_availability({ restaurantId, date, time, partySize, preference }) {
    const rules = await getBookingRules(restaurantId);
    const { startAt, endAt } = toWindow(date, time, rules?.reservation_duration_minutes || 90);
    const plan = await checkAvailability({ restaurantId, startAt, endAt, partySize, preference });
    return plan.ok
      ? { available: true, seating_mode: plan.seatingMode, summary: plan.summary, requires_approval: plan.requiresApproval }
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
  }
};

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
