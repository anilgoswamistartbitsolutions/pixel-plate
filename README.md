# Pixel Plate

A restaurant reservation & floor-plan management platform with an AI voice agent
("Pixel Plate (Prod)") that answers menu/hours questions and books real seats.

Same stack and conventions as the sibling `hospital-assist` project: Next.js (App Router,
plain JS), PostgreSQL via `pg`, JWT + bcrypt auth, and a Sarvam Conversational AI agent for
voice. Branding and copy are restaurant-specific; the codebase is otherwise independent.

## Stack

- Next.js 15 (App Router), React 19, plain JS (no TypeScript, matches hospital-assist)
- PostgreSQL (Neon) -- seat-level reservation engine with a database exclusion constraint
  (`seat_allocations`, `tstzrange` + `gist`) so two callers can never double-book the same seat
- `pg` for data access, `bcryptjs` + `jsonwebtoken` for staff auth
- `sarvam-conv-ai-sdk` for the in-browser voice agent test call

## Getting started

```bash
npm install
npm run db:migrate   # applies database/schema.sql (safe to re-run)
npm run db:seed      # demo floor plan (10 tables / 44 seats) + menu (optional)
npm run dev           # starts on port 3010 -- run this yourself; nothing here auto-starts it
```

Open `http://localhost:3010`. Default accounts (change immediately in Team & Settings):

| Role | Username | Password |
|---|---|---|
| Super Admin | `pixelplate` | `pixelplate123` |
| Admin | `manager` | `manager123` |

## Roles

- **Admin** -- day-to-day operations: Overview, Live Floor Plan, Reservations, Group Requests,
  Menu, Restaurant Information, Calls & Follow-ups, Reports.
- **Super Admin** -- everything Admin has, plus **AI Voice Agent > Configuration** (agent
  credentials, enable/disable) and **Team & Settings** (create staff, change roles).

This mirrors hospital-assist's `admin` / `super_admin` split, where only the super tier touches
agent credentials and team membership.

## Database

Connects to the Neon Postgres instance in `.env` (`DATABASE_URL`). Schema lives in
`database/schema.sql`:

- `restaurants`, `staff_users` -- tenancy & auth
- `restaurant_settings`, `booking_rules` -- the profile, hours, policies, and auto-confirm
  rules the dashboard *and* the voice agent both read from
- `restaurant_tables`, `table_seats`, `table_combinations` -- the floor plan. Tables are never
  deleted, only deactivated (`active = false`), so historical bookings stay intact
- `reservations`, `seat_allocations` -- the booking engine. `seat_allocations` carries a
  `gist` exclusion constraint on `(seat_id, tstzrange(start_at, end_at))` so overlapping
  double-booking fails at the database level even under concurrent requests, independent of
  application logic
- `group_booking_requests` -- large/ambiguous parties that need staff review before becoming a
  real reservation (see `src/lib/group-requests.js`)
- `menu_categories`, `menu_items` -- what the agent is allowed to recommend; nothing it isn't
  configured here
- `calls`, `staff_followups` -- every voice-agent interaction and any callback/escalation
- `voice_agent_config`, `voice_sessions` -- agent credentials (encrypted at rest) and browser
  test-call sessions
- `audit_log` -- reserved for critical booking/table change history

## The booking engine

`src/lib/availability.js` + `src/lib/reservations.js` is the single path both the dashboard
*and* the voice agent go through (`src/lib/agent-tools.js`) -- there is no separate "AI
booking" shortcut. For every request it:

1. Sweeps expired holds.
2. Re-derives real availability from the database inside a transaction (never trusts a stale
   floor-plan state from the browser).
3. Picks a seating plan in priority order: one table big enough to seat everyone together,
   then an approved table combination, then multiple nearby tables (only if the guest said
   that's okay), then a shared table (only if sharing is enabled and the guest agreed).
4. Checks the restaurant's configured `booking_rules` (max party size, max tables, full-table
   approval, large-group threshold) -- anything over the line becomes a **pending group
   request** for staff to review, never a false "confirmed".
5. Commits the reservation and its seat allocations atomically. A conflict (another booking
   grabbed the same seat first) is caught and reported as "please try a different time", never
   as a silent overwrite.

Cancel/modify follow the same pattern: modifying a reservation to an unavailable slot leaves
the *original* confirmed booking untouched rather than partially updating it.

Run `npm run test:booking` to exercise this directly against the real database (two-person
booking, concurrent double-booking protection, cancellation + seat release, large-group
auto-escalation to pending, and a failed modification that preserves the original booking).

## The voice agent

**Pixel Plate (Prod)** already exists in the Sarvam agent workspace (same org/workspace as
`hospital-assist`'s agent) with a receptionist prompt and greeting committed. It can hold a
conversation today. Its reservation/menu tools are **not wired yet** -- that requires a public
HTTPS deployment (the platform only allows attaching the stored API key to an allow-listed
domain). See `docs/voice-agent-tools.md` for the exact 14 tools, their fields, and the steps to
finish wiring once deployed. Until then, the agent correctly tells callers it can't check real
availability yet rather than pretending to.

A "Talk to Pixel Plate (Prod)" launcher is pinned to the bottom-right corner of every dashboard
screen (same pattern as hospital-assist's floating assistant widget) -- it only appears once
the agent is enabled in **AI Voice Agent > Configuration**, and places a real browser test call
through `/api/voice-agent/session` + `/api/voice-agent/runtime`. A text-based **Tool Tester**
on the AI Voice Agent screen calls the exact same server-side tools directly, no audio needed,
for verifying booking/menu logic.

Telephony (real inbound phone calls) is separate again -- see `docs/voice-agent-tools.md` §4.
`voice_agent_config.telephony_configured` stays `false`, and the dashboard says so, until a real
number is connected and tested.

## What's demo vs. live

Everything in the dashboard reads from the real database -- there is no hardcoded/demo metrics
mode. `npm run db:seed` loads a realistic floor plan and menu so there's something to look at
immediately; delete/replace it from the dashboard like any other data.

## Project layout

```
src/lib/            database access + business logic (availability, reservations, menu,
                     tables, calls, group-requests, agent-tools, restaurant settings)
src/app/api/         REST routes -- thin wrappers around src/lib, auth-gated per role
src/app/admin/       the dashboard shell + all views (AdminDashboard.js)
src/components/      VoiceAgentWidget (floating launcher)
database/            schema.sql (full schema) + seed-demo.sql (demo data)
docs/                voice-agent-tools.md (post-deploy tool wiring)
tests/               booking-engine.test.mjs (runs against the real DB)
```
