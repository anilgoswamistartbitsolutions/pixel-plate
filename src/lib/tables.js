import { query, withTransaction } from "@/lib/db";

export async function listFloorPlan(restaurantId) {
  const tables = await query(
    "select * from restaurant_tables where restaurant_id = $1 order by code",
    [restaurantId]
  );
  const seats = await query(
    `select s.* from table_seats s join restaurant_tables t on t.id = s.table_id
     where t.restaurant_id = $1 order by s.table_id, s.seat_index`,
    [restaurantId]
  );
  const upcoming = await query(
    `select sa.table_id, sa.seat_id, sa.start_at, sa.end_at, r.id as reservation_id, r.booking_ref,
            r.customer_name, r.phone, r.party_size, r.status
     from seat_allocations sa
     join reservations r on r.id = sa.reservation_id
     where sa.restaurant_id = $1 and sa.status = 'active' and sa.end_at > now()
     order by sa.start_at`,
    [restaurantId]
  );

  const seatsByTable = new Map();
  for (const seat of seats.rows) {
    const list = seatsByTable.get(seat.table_id) || [];
    list.push(seat);
    seatsByTable.set(seat.table_id, list);
  }
  const reservationsByTable = new Map();
  for (const row of upcoming.rows) {
    const list = reservationsByTable.get(row.table_id) || [];
    list.push(row);
    reservationsByTable.set(row.table_id, list);
  }

  // pos_x/pos_y/width/height are `numeric` columns -- node-pg returns those as strings, and
  // an inline React style only auto-appends "px" to an actual number, so every table silently
  // collapsed to 0,0 without this cast.
  return tables.rows.map((table) => ({
    ...table,
    pos_x: Number(table.pos_x),
    pos_y: Number(table.pos_y),
    width: Number(table.width),
    height: Number(table.height),
    seats: seatsByTable.get(table.id) || [],
    upcomingReservations: reservationsByTable.get(table.id) || []
  }));
}

export async function createTable(restaurantId, payload) {
  return withTransaction(async (client) => {
    const tableResult = await client.query(
      `insert into restaurant_tables
        (restaurant_id, code, display_name, capacity, table_type, shareable, shareable_party_sizes,
         exclusive_only, full_table_requires_approval, pos_x, pos_y, width, height, shape)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
      [
        restaurantId, payload.code, payload.displayName, payload.capacity, payload.tableType || "standard",
        payload.shareable || false, payload.shareablePartySizes || [], payload.exclusiveOnly || false,
        payload.fullTableRequiresApproval || false, payload.posX || 0, payload.posY || 0,
        payload.width || 120, payload.height || 90, payload.shape || "rect"
      ]
    );
    const table = tableResult.rows[0];
    for (let i = 1; i <= payload.capacity; i++) {
      await client.query(
        "insert into table_seats (table_id, code, seat_index) values ($1,$2,$3)",
        [table.id, `${table.code}-${i}`, i]
      );
    }
    return table;
  });
}

export async function updateTable(restaurantId, tableId, payload) {
  const fields = [
    "display_name", "capacity", "table_type", "shareable", "shareable_party_sizes",
    "exclusive_only", "full_table_requires_approval", "pos_x", "pos_y", "width", "height", "shape", "active"
  ];
  const map = {
    display_name: "displayName", capacity: "capacity", table_type: "tableType", shareable: "shareable",
    shareable_party_sizes: "shareablePartySizes", exclusive_only: "exclusiveOnly",
    full_table_requires_approval: "fullTableRequiresApproval", pos_x: "posX", pos_y: "posY",
    width: "width", height: "height", shape: "shape", active: "active"
  };
  const sets = [];
  const values = [tableId, restaurantId];
  for (const field of fields) {
    const key = map[field];
    if (!(key in payload)) continue;
    values.push(payload[key]);
    sets.push(`${field} = $${values.length}`);
  }
  if (!sets.length) return null;
  sets.push("updated_at = now()");
  const result = await query(
    `update restaurant_tables set ${sets.join(", ")} where id = $1 and restaurant_id = $2 returning *`,
    values
  );
  return result.rows[0];
}

/** Tables are permanent records -- deactivate, never delete, so reservation history stays intact. */
export async function deactivateTable(restaurantId, tableId) {
  const result = await query(
    "update restaurant_tables set active = false, updated_at = now() where id = $1 and restaurant_id = $2 returning *",
    [tableId, restaurantId]
  );
  return result.rows[0];
}

export async function reactivateTable(restaurantId, tableId) {
  const result = await query(
    "update restaurant_tables set active = true, updated_at = now() where id = $1 and restaurant_id = $2 returning *",
    [tableId, restaurantId]
  );
  return result.rows[0];
}

export async function moveTable(restaurantId, tableId, posX, posY) {
  const result = await query(
    "update restaurant_tables set pos_x = $3, pos_y = $4, updated_at = now() where id = $1 and restaurant_id = $2 returning *",
    [tableId, restaurantId, posX, posY]
  );
  return result.rows[0];
}
