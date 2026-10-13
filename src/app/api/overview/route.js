import { requireStaffAuth } from "@/lib/auth";
import { ok, getSearchParam } from "@/lib/http";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const date = getSearchParam(request, "date") || new Date().toISOString().slice(0, 10);
  const restaurantId = auth.restaurantId;

  const [reservations, specials, calls, followups, seats] = await Promise.all([
    query(
      `select status, count(*)::int as count, coalesce(sum(party_size),0)::int as guests
       from reservations where restaurant_id = $1 and reservation_date = $2 group by status`,
      [restaurantId, date]
    ),
    query(
      `select count(*)::int as count from menu_items
       where restaurant_id = $1 and 'chef_pick' = any(recommend_tags) and available = true and sold_out = false`,
      [restaurantId]
    ),
    query(
      `select id, caller_number, status, outcome, started_at from calls
       where restaurant_id = $1 order by started_at desc limit 8`,
      [restaurantId]
    ),
    query(
      `select count(*)::int as count from staff_followups where restaurant_id = $1 and status != 'done'`,
      [restaurantId]
    ),
    query(
      `select
        (select count(*)::int from table_seats s join restaurant_tables t on t.id = s.table_id where t.restaurant_id = $1 and s.active and t.active) as total_seats,
        (select count(distinct seat_id)::int from seat_allocations where restaurant_id = $1 and status = 'active' and tstzrange(start_at,end_at,'[)') @> now()) as occupied_now`,
      [restaurantId]
    )
  ]);

  const byStatus = Object.fromEntries(reservations.rows.map((r) => [r.status, { count: r.count, guests: r.guests }]));

  return ok({
    date,
    reservations: {
      confirmed: byStatus.confirmed || { count: 0, guests: 0 },
      pending: byStatus.pending || { count: 0, guests: 0 },
      cancelled: byStatus.cancelled || { count: 0, guests: 0 },
      seated: byStatus.seated || { count: 0, guests: 0 },
      completed: byStatus.completed || { count: 0, guests: 0 },
      no_show: byStatus.no_show || { count: 0, guests: 0 }
    },
    daily_specials_count: specials.rows[0]?.count || 0,
    recent_calls: calls.rows,
    open_followups: followups.rows[0]?.count || 0,
    seats: seats.rows[0] || { total_seats: 0, occupied_now: 0 }
  });
}
