import { requireStaffAuth } from "@/lib/auth";
import { ok } from "@/lib/http";
import { getSettings, getBookingRules, windowsForDate } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

/** Fixed pickup time slots for today: aligned to the restaurant's takeaway slot interval
 * (default 30 min, so 7:00, 7:30, 8:00...), starting no earlier than the prep buffer (default
 * 30 min) from right now, and only inside today's actual opening windows -- never a free-form
 * time the kitchen couldn't possibly hit. */
export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;

  const settings = await getSettings(auth.restaurantId);
  const rules = await getBookingRules(auth.restaurantId);
  const interval = rules?.takeaway_slot_interval_minutes ?? 30;
  const prepBuffer = rules?.takeaway_prep_buffer_minutes ?? 30;
  const today = new Date().toISOString().slice(0, 10);
  const windows = windowsForDate(settings, today) || [];

  const now = new Date();
  const earliestMinutes = now.getHours() * 60 + now.getMinutes() + prepBuffer;

  const options = [];
  for (const w of windows) {
    const [oh, om] = w.open.split(":").map(Number);
    const [ch, cm] = w.close.split(":").map(Number);
    const openMin = oh * 60 + om;
    const closeMin = ch * 60 + cm;
    let t = Math.ceil(Math.max(openMin, earliestMinutes) / interval) * interval;
    for (; t <= closeMin; t += interval) {
      const hh = String(Math.floor(t / 60) % 24).padStart(2, "0");
      const mm = String(t % 60).padStart(2, "0");
      options.push(`${hh}:${mm}`);
    }
  }

  return ok({ date: today, intervalMinutes: interval, prepBufferMinutes: prepBuffer, windows, options });
}
