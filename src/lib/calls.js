import { query } from "@/lib/db";

export async function createCall({ restaurantId, callerNumber, channel = "browser_test" }) {
  const result = await query(
    `insert into calls (restaurant_id, caller_number, channel, status) values ($1,$2,$3,'initiated') returning *`,
    [restaurantId, callerNumber || null, channel]
  );
  return result.rows[0];
}

export async function updateCall(restaurantId, callId, patch) {
  const fields = ["status", "outcome", "escalation_reason", "linked_reservation_id", "linked_group_request_id",
    "transcript", "callback_status", "assigned_staff_id", "connected_at", "ended_at", "duration_seconds", "error_message"];
  const sets = [];
  const values = [callId, restaurantId];
  for (const field of fields) {
    if (!(field in patch)) continue;
    values.push(patch[field]);
    sets.push(`${field} = $${values.length}`);
  }
  if (!sets.length) return null;
  const result = await query(
    `update calls set ${sets.join(", ")} where id = $1 and restaurant_id = $2 returning *`,
    values
  );
  return result.rows[0];
}

export async function appendTranscriptTurn(restaurantId, callId, turn) {
  const result = await query(
    `update calls set transcript = transcript || $3::jsonb where id = $1 and restaurant_id = $2 returning *`,
    [callId, restaurantId, JSON.stringify([turn])]
  );
  return result.rows[0];
}

export async function listCalls({ restaurantId, status, limit = 100 }) {
  const conditions = ["restaurant_id = $1"];
  const values = [restaurantId];
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  values.push(limit);
  const result = await query(
    `select * from calls where ${conditions.join(" and ")} order by started_at desc limit $${values.length}`,
    values
  );
  return result.rows;
}

export async function createFollowup({ restaurantId, callId, reservationId, groupRequestId, title, notes, dueAt }) {
  const result = await query(
    `insert into staff_followups (restaurant_id, call_id, reservation_id, group_request_id, title, notes, due_at)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [restaurantId, callId || null, reservationId || null, groupRequestId || null, title, notes || null, dueAt || null]
  );
  return result.rows[0];
}

export async function listFollowups({ restaurantId, status }) {
  const conditions = ["restaurant_id = $1"];
  const values = [restaurantId];
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  const result = await query(
    `select * from staff_followups where ${conditions.join(" and ")} order by created_at desc`,
    values
  );
  return result.rows;
}

export async function updateFollowup(restaurantId, id, patch) {
  const fields = ["status", "notes", "assigned_staff_id", "due_at"];
  const sets = [];
  const values = [id, restaurantId];
  for (const field of fields) {
    if (!(field in patch)) continue;
    values.push(patch[field]);
    sets.push(`${field} = $${values.length}`);
  }
  if (!sets.length) return null;
  sets.push("updated_at = now()");
  const result = await query(
    `update staff_followups set ${sets.join(", ")} where id = $1 and restaurant_id = $2 returning *`,
    values
  );
  return result.rows[0];
}
