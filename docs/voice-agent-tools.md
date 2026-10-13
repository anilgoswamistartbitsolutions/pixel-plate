# Wiring "Pixel Plate (Prod)" to its reservation & menu tools

The agent **Pixel Plate (Prod)** already exists in the Sarvam agent-builder workspace
(app id `Pixel-Plate-e5f481fc-8434`, org `01a0c3a4-b74a-7441-813a-d7d799923769`, workspace
`01a0c3ef-4753-7a81-a20c-07f739dcf1d6`) with a receptionist prompt and greeting committed as
version 2. It can already hold a conversation and will **honestly tell callers it cannot yet
check real availability**, because its webhook tools are not attached yet.

**Why not:** the agent platform only allows a stored API-key secret to be attached to an
*allow-listed* URL, and this app is not deployed to a public domain yet, so there is nothing to
allow-list. Once you deploy `pixel-plate` (Vercel, Render, your own server, etc.) with a real
HTTPS domain, finish wiring with the steps below. Do this before telling anyone the voice agent
takes real bookings -- until then it is a configured conversational shell, not a connected one.

## 1. Deploy and set production env vars

- `DATABASE_URL`, `JWT_SECRET`, `CONFIG_ENCRYPTION_KEY` -- as in `.env`.
- `VOICE_API_PUBLIC=false` (turns on the `AGENT_TOOLS_API_KEY` check below).
- `AGENT_TOOLS_API_KEY` -- already generated into `.env`; keep it secret.
- `NEXT_PUBLIC_APP_URL` -- your deployed `https://` domain.

## 2. Add each tool to the agent

For every row below, call `create_api_tool` (or use the agent builder UI) with:
`agent_id = Pixel-Plate-e5f481fc-8434`, `method = POST`,
`url = https://<your-domain>/api/agent-tools/<name>`, header `x-api-key: <AGENT_TOOLS_API_KEY>`
(as a static header, or attach the `pixel_plate_agent_api_key` secret once your domain is
allow-listed).

| Tool name | Body fields (all `llm_prompt` unless noted) |
|---|---|
| `get_restaurant_information` | none |
| `get_opening_hours` | `date` (optional) |
| `get_menu` | `mealPeriod` (enum: breakfast/lunch/dinner, optional), `categoryName` (optional) |
| `get_daily_specials` | none |
| `get_menu_item_availability` | `itemName` |
| `get_seating_options` | none |
| `check_table_availability` | `date`, `time`, `partySize`, `preference` (enum: together/split_ok/shared_ok) |
| `create_reservation` | `customerName`, `phone`, `altPhone` (optional), `partySize`, `date`, `time`, `preference`, `notes` (optional) |
| `create_group_booking_request` | same fields as `create_reservation` |
| `get_reservation_status` | `bookingRef`, `phone` |
| `modify_reservation` | `bookingRef`, `phone`, `date` (optional), `time` (optional), `partySize` (optional) |
| `cancel_reservation` | `bookingRef`, `phone`, `reason` (optional) |
| `create_staff_followup` | `title`, `notes` (optional), `reservationBookingRef` (optional) |
| `request_human_handoff` | `reason` |

Reference each one from the prompt as `call tool:<name>` (the current prompt already names all
fourteen). Re-commit the agent (`agents(operation="commit")`) after adding them.

## 3. Browser "Test Agent" widget

The dashboard's AI Voice Agent > Test Agent tab already points at the real agent
(`org_id`/`workspace_id`/`app_id` are stored in `voice_agent_config`, and `VOICE_API_KEY` in
`.env` holds the platform runtime key). It works today for a plain conversation; once step 2 is
done, it also exercises real bookings end to end.

## 4. Telephony (real inbound phone calls)

Separate from the above -- see `telephony.list_connections` / `configure_connection` /
`configure_deployment` on the same MCP to onboard a phone number and deploy this agent to it.
`voice_agent_config.telephony_configured` stays `false` (and the dashboard says so) until you
have done this and tested a real inbound call.
