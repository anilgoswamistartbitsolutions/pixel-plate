import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, getSearchParam } from "@/lib/http";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Daily reservation + call counts for a date range -- powers the Reports charts. Every day in
// the range is present in the result (zero-filled), so a line chart never has gaps.
export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;

  const from = getSearchParam(request, "from");
  const to = getSearchParam(request, "to");
  if (!from || !to) return fail("from and to date params are required", 400);

  try {
    const reservationRows = await query(
      `select reservation_date::text as date, status, count(*)::int as count, coalesce(sum(party_size),0)::int as guests
       from reservations
       where restaurant_id = $1 and reservation_date between $2 and $3
       group by reservation_date, status`,
      [auth.restaurantId, from, to]
    );
    const callRows = await query(
      `select started_at::date::text as date, count(*)::int as count
       from calls
       where restaurant_id = $1 and started_at::date between $2 and $3
       group by started_at::date`,
      [auth.restaurantId, from, to]
    );

    const byDate = new Map();
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      byDate.set(key, { date: key, confirmed: 0, pending: 0, cancelled: 0, guests: 0, calls: 0 });
    }
    for (const row of reservationRows.rows) {
      const entry = byDate.get(row.date);
      if (!entry) continue;
      if (row.status === "confirmed" || row.status === "seated" || row.status === "completed") {
        entry.confirmed += row.count;
        entry.guests += row.guests;
      } else if (row.status === "pending") entry.pending += row.count;
      else if (row.status === "cancelled") entry.cancelled += row.count;
    }
    for (const row of callRows.rows) {
      const entry = byDate.get(row.date);
      if (entry) entry.calls = row.count;
    }

    return ok(Array.from(byDate.values()));
  } catch (error) {
    return fail("Unable to load report trend", 500, error.message);
  }
}
