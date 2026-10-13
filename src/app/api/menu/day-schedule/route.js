import { requireStaffAuth } from "@/lib/auth";
import { fail, ok, readJson, getSearchParam } from "@/lib/http";
import { getDaySlotSchedule, getMenuForDateSlot, assignConfigurationToSlot, setCustomSlotItems, setSlotClosed } from "@/lib/menu-config";

export const dynamic = "force-dynamic";

const PAST_DATE_MSG = "Past dates cannot be edited.";

function isPast(date) {
  return date < new Date().toISOString().slice(0, 10);
}

export async function GET(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  const date = getSearchParam(request, "date");
  if (!date) return fail("date is required", 400);

  const schedule = await getDaySlotSchedule(auth.restaurantId, date);
  const resolved = {};
  for (const slot of ["morning", "midday", "evening"]) {
    resolved[slot] = await getMenuForDateSlot(auth.restaurantId, date, slot);
  }
  return ok({ date, schedule, resolved, editable: !isPast(date) });
}

// body: { date, slot, action: 'assign_configuration' | 'set_items' | 'set_closed', configurationId?, itemIds?, closed? }
export async function PATCH(request) {
  const auth = requireStaffAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const body = await readJson(request);
    if (!body.date || !body.slot) return fail("date and slot are required", 400);
    if (isPast(body.date)) return fail(PAST_DATE_MSG, 400);

    if (body.action === "assign_configuration") {
      return ok(await assignConfigurationToSlot(auth.restaurantId, body.date, body.slot, body.configurationId));
    }
    if (body.action === "set_items") {
      return ok(await setCustomSlotItems(auth.restaurantId, body.date, body.slot, body.itemIds || [], body.configurationId || null));
    }
    if (body.action === "set_closed") {
      return ok(await setSlotClosed(auth.restaurantId, body.date, body.slot, body.closed !== false));
    }
    return fail("Unrecognized action", 400);
  } catch (error) {
    return fail("Unable to update the day schedule", 500, error.message);
  }
}
