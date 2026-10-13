"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid, Grid3x3, CalendarClock, Users2, UtensilsCrossed, Building2,
  Mic, PhoneCall, BarChart3, Settings, LogOut, Plus, X, Check, Ban,
  MapPin, Clock, ShieldCheck, Sparkles
} from "lucide-react";
import { apiFetch, getStaff, clearSession } from "@/lib/api-client";
import VoiceAgentWidget from "@/components/VoiceAgentWidget";

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "floorplan", label: "Live Floor Plan", icon: Grid3x3 },
  { key: "reservations", label: "Reservations", icon: CalendarClock },
  { key: "groups", label: "Group Booking Requests", icon: Users2 },
  { key: "menu", label: "Menu & Daily Specials", icon: UtensilsCrossed },
  { key: "info", label: "Restaurant Information", icon: Building2 },
  { key: "voice", label: "AI Voice Agent", icon: Mic },
  { key: "calls", label: "Calls & Follow-ups", icon: PhoneCall },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "team", label: "Team & Settings", icon: Settings, superOnly: true }
];

export default function AdminDashboard() {
  const router = useRouter();
  const [staff, setStaff] = useState(null);
  const [view, setView] = useState("overview");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toast, setToast] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = getStaff();
    if (!s) { router.push("/login"); return; }
    apiFetch("/api/auth/me").then(() => { setStaff(s); setReady(true); }).catch(() => { clearSession(); router.push("/login"); });
  }, [router]);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  function logout() {
    clearSession();
    router.push("/login");
  }

  if (!ready) return <div style={{ padding: 40 }}>Loading Pixel Plate...</div>;

  const visibleNav = NAV_ITEMS.filter((item) => !item.superOnly || staff.role === "super_admin");

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">PP</div>
          <div>
            <div className="brandName">Pixel Plate</div>
            <div className="brandSub">Restaurant console</div>
          </div>
        </div>
        <nav className="navGroup">
          {visibleNav.map((item) => (
            <button key={item.key} className={`navItem ${view === item.key ? "active" : ""}`} onClick={() => setView(item.key)}>
              <item.icon size={17} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebarFooter">
          <div className="staffChip">
            <div className="staffAvatar">{staff.name?.[0]?.toUpperCase() || "P"}</div>
            <div className="staffMeta">
              <strong>{staff.name}</strong>
              {staff.role === "super_admin" ? "Super Admin" : "Admin"}
            </div>
          </div>
          <button className="logoutButton" onClick={logout}><LogOut size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />Sign out</button>
        </div>
      </aside>

      <div className="mainArea">
        <header className="topBar">
          <div>
            <div className="topBarTitle">{visibleNav.find((i) => i.key === view)?.label}</div>
            <div className="topBarSub">Pixel Plate &middot; {staff.role === "super_admin" ? "Super Admin" : "Admin"} access</div>
          </div>
          <div className="topBarRight">
            {["overview", "reservations", "reports"].includes(view) && (
              <input className="dateInput" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </div>
        </header>
        <main className="contentArea">
          {view === "overview" && <OverviewView date={date} onNavigate={setView} />}
          {view === "floorplan" && <FloorPlanView notify={notify} />}
          {view === "reservations" && <ReservationsView date={date} notify={notify} />}
          {view === "groups" && <GroupRequestsView notify={notify} />}
          {view === "menu" && <MenuView notify={notify} />}
          {view === "info" && <RestaurantInfoView notify={notify} />}
          {view === "voice" && <VoiceAgentView staff={staff} notify={notify} />}
          {view === "calls" && <CallsView notify={notify} />}
          {view === "reports" && <ReportsView date={date} />}
          {view === "team" && staff.role === "super_admin" && <TeamView notify={notify} />}
        </main>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
      <VoiceAgentWidget />
    </div>
  );
}

/* ====================================================================== Overview */

function OverviewView({ date, onNavigate }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch(`/api/overview?date=${date}`).then(setData).catch((e) => setErr(e.message));
  }, [date]);

  if (err) return <ErrorBlock message={err} />;
  if (!data) return <LoadingBlock />;

  const r = data.reservations;
  const occupancyPct = data.seats.total_seats ? Math.round((data.seats.occupied_now / data.seats.total_seats) * 100) : 0;

  return (
    <div>
      <div className="grid cols-4" style={{ marginBottom: 22 }}>
        <StatCard label="Confirmed today" value={r.confirmed.count} foot={`${r.confirmed.guests} guests expected`} onClick={() => onNavigate("reservations")} />
        <StatCard label="Pending group requests" value={data.open_followups >= 0 ? undefined : 0} customValue={r.pending.count} foot="Awaiting staff review" onClick={() => onNavigate("groups")} />
        <StatCard label="Cancellations" value={r.cancelled.count} foot="Today" onClick={() => onNavigate("reservations")} />
        <StatCard label="Seats occupied now" value={`${occupancyPct}%`} foot={`${data.seats.occupied_now} of ${data.seats.total_seats} seats`} onClick={() => onNavigate("floorplan")} />
      </div>
      <div className="grid cols-2">
        <div className="card">
          <div className="cardTitle">Recent calls</div>
          <div className="cardHint" style={{ marginBottom: 14 }}>Latest voice agent activity</div>
          {data.recent_calls.length === 0 ? (
            <EmptyState title="No calls yet" hint="Calls will appear here once the voice agent starts taking them." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.recent_calls.map((call) => (
                <div key={call.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                  <span>{call.caller_number || "Unknown caller"}</span>
                  <span className={`badge ${call.status}`}>{call.status}</span>
                </div>
              ))}
            </div>
          )}
          <button className="button ghost small" style={{ marginTop: 12 }} onClick={() => onNavigate("calls")}>View all calls</button>
        </div>
        <div className="card">
          <div className="cardTitle">Today's chef picks</div>
          <div className="cardHint" style={{ marginBottom: 14 }}>{data.daily_specials_count} items flagged as specials</div>
          <button className="button ghost small" onClick={() => onNavigate("menu")}>Manage menu</button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, customValue, foot, onClick }) {
  return (
    <div className="statCard" onClick={onClick}>
      <div className="statLabel">{label}</div>
      <div className="statValue">{customValue !== undefined ? customValue : value}</div>
      <div className="statFoot">{foot}</div>
    </div>
  );
}

/* ====================================================================== Floor Plan */

function FloorPlanView({ notify }) {
  const [tables, setTables] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    apiFetch("/api/floor-plan").then(setTables).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(table) {
    try {
      await apiFetch(`/api/tables/${table.id}`, { method: "PATCH", body: JSON.stringify({ action: table.active ? "deactivate" : "reactivate" }) });
      notify(table.active ? "Table deactivated" : "Table reactivated");
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  async function handleDrag(table, dx, dy) {
    const posX = Number(table.pos_x) + dx;
    const posY = Number(table.pos_y) + dy;
    setTables((prev) => prev.map((t) => (t.id === table.id ? { ...t, pos_x: posX, pos_y: posY } : t)));
    apiFetch(`/api/tables/${table.id}`, { method: "PATCH", body: JSON.stringify({ action: "move", posX, posY }) }).catch(() => {});
  }

  if (err) return <ErrorBlock message={err} />;
  if (!tables) return <LoadingBlock />;

  return (
    <div>
      <div className="sectionHeader">
        <div>
          <h2>Floor plan</h2>
          <p>Drag tables to arrange the room. Click one to see seats and upcoming reservations.</p>
        </div>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={15} />Add table</button>
      </div>

      <div className="legendRow">
        <span><span className="legendDot" style={{ background: "#fff", border: "2px solid var(--line)" }} />Available</span>
        <span><span className="legendDot" style={{ background: "#fbeedb", border: "2px solid var(--amber)" }} />Reserved upcoming</span>
        <span><span className="legendDot" style={{ background: "var(--danger-soft)", border: "2px solid var(--danger)" }} />Occupied now</span>
        <span><span className="legendDot" style={{ background: "#eee7db", border: "2px solid var(--muted)" }} />Inactive</span>
      </div>

      <div className="grid cols-2" style={{ gridTemplateColumns: "1.3fr 1fr", alignItems: "start" }}>
        <div className="floorCanvasWrap">
          <div className="floorCanvas">
            {tables.map((table) => (
              <DraggableTable key={table.id} table={table} selected={selected?.id === table.id} onSelect={() => setSelected(table)} onDrag={handleDrag} />
            ))}
          </div>
        </div>

        <div className="card">
          {!selected ? (
            <EmptyState title="Select a table" hint="Click a table on the floor plan to see its seats and reservations." />
          ) : (
            <TableDetail table={selected} onToggleActive={toggleActive} onClose={() => setSelected(null)} />
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="cardTitle" style={{ marginBottom: 10 }}>All tables</div>
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Code</th><th>Name</th><th>Capacity</th><th>Type</th><th>Shareable</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.code}</strong></td>
                  <td>{t.display_name}</td>
                  <td>{t.capacity}</td>
                  <td>{t.table_type}</td>
                  <td>{t.shareable ? "Yes" : "No"}</td>
                  <td><span className={`badge ${t.active ? "active" : "inactive"}`}>{t.active ? "Active" : "Inactive"}</span></td>
                  <td><button className="button ghost small" onClick={() => toggleActive(t)}>{t.active ? "Deactivate" : "Reactivate"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <AddTableModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); notify("Table created"); load(); }} />}
    </div>
  );
}

function DraggableTable({ table, selected, onSelect, onDrag }) {
  const [dragging, setDragging] = useState(false);

  function onMouseDown(e) {
    if (!table.active) { onSelect(); return; }
    setDragging(true);
    let last = { x: e.clientX, y: e.clientY };
    function onMove(ev) {
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      last = { x: ev.clientX, y: ev.clientY };
      onDrag(table, dx, dy);
    }
    function onUp() {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const isOccupiedNow = table.upcomingReservations?.some((r) => new Date(r.start_at) <= new Date() && new Date(r.end_at) > new Date());
  const isReserved = !isOccupiedNow && table.upcomingReservations?.length > 0;
  const statusClass = !table.active ? "inactive" : isOccupiedNow ? "occupied" : isReserved ? "reserved" : "";

  return (
    <div
      className={`floorTable ${table.shape} ${statusClass} ${selected ? "selected" : ""}`}
      style={{ left: table.pos_x, top: table.pos_y, width: table.width, height: table.height }}
      onMouseDown={onMouseDown}
      onClick={() => !dragging && onSelect()}
    >
      <span className="code">{table.code}</span>
      <span className="cap">{table.capacity} seats</span>
    </div>
  );
}

function TableDetail({ table, onToggleActive, onClose }) {
  return (
    <div>
      <div className="modalHeader" style={{ marginBottom: 12 }}>
        <div>
          <div className="cardTitle">{table.display_name}</div>
          <div className="cardHint">{table.table_type} &middot; {table.capacity} seats &middot; {table.shareable ? "shareable" : "exclusive"}</div>
        </div>
        <button className="button ghost small" onClick={onClose}><X size={14} /></button>
      </div>

      <div className="pillRow" style={{ marginBottom: 14 }}>
        {table.seats.map((seat) => <span key={seat.id} className="pill">{seat.code}</span>)}
      </div>

      <div className="cardTitle" style={{ fontSize: 13, marginBottom: 8 }}>Upcoming reservations</div>
      {table.upcomingReservations.length === 0 ? (
        <p className="cardHint">No upcoming reservations on this table.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {table.upcomingReservations.map((r, i) => (
            <div key={i} style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
              <span>{r.customer_name} &middot; {r.party_size}p</span>
              <span className="cardHint">{new Date(r.start_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <button className="button danger small" style={{ marginTop: 16 }} onClick={() => onToggleActive(table)}>
        {table.active ? "Deactivate table" : "Reactivate table"}
      </button>
    </div>
  );
}

function AddTableModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ code: "", displayName: "", capacity: 4, tableType: "standard", shareable: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/tables", { method: "POST", body: JSON.stringify(form) });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader"><h3>Add table</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid">
          <div className="field"><label>Permanent code (e.g. L)</label><input className="textInput" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
          <div className="field"><label>Display name</label><input className="textInput" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
          <div className="field"><label>Capacity</label><input className="textInput" type="number" min="1" required value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></div>
          <div className="field"><label>Table type</label>
            <select className="select" value={form.tableType} onChange={(e) => setForm({ ...form, tableType: e.target.value })}>
              <option value="standard">Standard</option><option value="shared">Shared</option><option value="private">Private</option><option value="booth">Booth</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.shareable} onChange={(e) => setForm({ ...form, shareable: e.target.checked })} /> Allow sharing with other parties
            </label>
          </div>
          <button className="button primary" type="submit" disabled={saving} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>{saving ? "Saving..." : "Create table"}</button>
        </form>
      </div>
    </div>
  );
}

/* ====================================================================== Reservations */

function ReservationsView({ date, notify }) {
  const [status, setStatus] = useState("");
  const [list, setList] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    const qs = new URLSearchParams({ date, ...(status ? { status } : {}) });
    apiFetch(`/api/reservations?${qs}`).then(setList).catch((e) => setErr(e.message));
  }, [date, status]);

  useEffect(() => { load(); }, [load]);

  async function cancel(id) {
    if (!confirm("Cancel this reservation and release its seats?")) return;
    try {
      await apiFetch(`/api/reservations/${id}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
      notify("Reservation cancelled");
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  async function setReservationStatus(id, newStatus) {
    try {
      await apiFetch(`/api/reservations/${id}`, { method: "PATCH", body: JSON.stringify({ action: "status", status: newStatus }) });
      notify(`Marked as ${newStatus}`);
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  if (err) return <ErrorBlock message={err} />;

  return (
    <div>
      <div className="sectionHeader">
        <div><h2>Reservations</h2><p>Confirmed bookings for {date}, with real-time seat allocations.</p></div>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={15} />New reservation</button>
      </div>

      <div className="tabRow">
        {["", "confirmed", "pending", "seated", "completed", "cancelled", "no_show"].map((s) => (
          <button key={s} className={`tabChip ${status === s ? "active" : ""}`} onClick={() => setStatus(s)}>{s || "All"}</button>
        ))}
      </div>

      {!list ? <LoadingBlock /> : list.length === 0 ? (
        <EmptyState title="No reservations" hint="New bookings from the dashboard or the voice agent will show up here." />
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Ref</th><th>Guest</th><th>Party</th><th>Time</th><th>Seating</th><th>Status</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{r.booking_ref}</td>
                  <td>{r.customer_name}<div className="cardHint">{r.phone}</div></td>
                  <td>{r.party_size}</td>
                  <td>{r.start_time?.slice(0, 5)}</td>
                  <td>{r.seating_mode}</td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                  <td>{r.source.replace("_", " ")}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    {r.status === "confirmed" && <button className="button secondary small" onClick={() => setReservationStatus(r.id, "seated")}>Seat</button>}
                    {r.status === "seated" && <button className="button secondary small" onClick={() => setReservationStatus(r.id, "completed")}>Complete</button>}
                    {["confirmed", "pending", "seated"].includes(r.status) && <button className="button danger small" onClick={() => cancel(r.id)}>Cancel</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddReservationModal defaultDate={date} onClose={() => setShowAdd(false)} onSaved={(outcome) => { setShowAdd(false); notify(outcome.status === "confirmed" ? `Confirmed: ${outcome.reservation.booking_ref}` : "Sent for staff review (pending)"); load(); }} />}
    </div>
  );
}

function AddReservationModal({ defaultDate, onClose, onSaved }) {
  const [form, setForm] = useState({ customerName: "", phone: "", partySize: 2, reservationDate: defaultDate, startTime: "19:00", seatingPreference: "together", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const outcome = await apiFetch("/api/reservations", { method: "POST", body: JSON.stringify(form) });
      onSaved(outcome);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader"><h3>New reservation</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid">
          <div className="field"><label>Guest name</label><input className="textInput" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></div>
          <div className="field"><label>Phone</label><input className="textInput" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="field"><label>Party size</label><input className="textInput" type="number" min="1" required value={form.partySize} onChange={(e) => setForm({ ...form, partySize: Number(e.target.value) })} /></div>
          <div className="field"><label>Date</label><input className="textInput" type="date" required value={form.reservationDate} onChange={(e) => setForm({ ...form, reservationDate: e.target.value })} /></div>
          <div className="field"><label>Time</label><input className="textInput" type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
          <div className="field"><label>Seating preference</label>
            <select className="select" value={form.seatingPreference} onChange={(e) => setForm({ ...form, seatingPreference: e.target.value })}>
              <option value="together">Everyone together</option>
              <option value="split_ok">Nearby tables okay</option>
              <option value="shared_ok">Shared table okay</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button className="button primary" type="submit" disabled={saving} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>{saving ? "Checking availability..." : "Check & book"}</button>
        </form>
      </div>
    </div>
  );
}

/* ====================================================================== Group Requests */

function GroupRequestsView({ notify }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => { apiFetch("/api/group-requests").then(setList).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  async function confirmRequest(id) {
    try {
      const result = await apiFetch(`/api/group-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action: "confirm" }) });
      notify(result.status === "confirmed" ? "Group request confirmed and seated" : "Still unavailable -- marked needs info");
      load();
    } catch (e) { notify(e.message, "error"); }
  }
  async function rejectRequest(id) {
    try {
      await apiFetch(`/api/group-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action: "reject", staffNotes: "Unable to accommodate" }) });
      notify("Request rejected");
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  if (err) return <ErrorBlock message={err} />;
  if (!list) return <LoadingBlock />;

  return (
    <div>
      <div className="sectionHeader"><div><h2>Group booking requests</h2><p>Large parties, combined tables, or anything needing staff review before confirming.</p></div></div>
      {list.length === 0 ? (
        <EmptyState title="No pending requests" hint="Large or ambiguous booking requests from the voice agent or staff will land here." />
      ) : (
        <div className="grid cols-2">
          {list.map((req) => (
            <div key={req.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <strong>{req.customer_name}</strong>
                <span className={`badge ${req.status}`}>{req.status.replace("_", " ")}</span>
              </div>
              <div className="cardHint">{req.phone}</div>
              <div style={{ margin: "10px 0", fontSize: 13.5 }}>
                <div><Users2 size={13} style={{ verticalAlign: "-2px" }} /> {req.party_size} guests</div>
                <div><Clock size={13} style={{ verticalAlign: "-2px" }} /> {req.requested_date} at {req.requested_time?.slice(0, 5)}</div>
                {req.seating_preference && <div><MapPin size={13} style={{ verticalAlign: "-2px" }} /> {req.seating_preference}</div>}
              </div>
              {req.notes && <p className="cardHint">{req.notes}</p>}
              {["pending", "needs_info"].includes(req.status) && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="button primary small" onClick={() => confirmRequest(req.id)}><Check size={13} />Confirm</button>
                  <button className="button danger small" onClick={() => rejectRequest(req.id)}><Ban size={13} />Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ====================================================================== Menu */

function MenuView({ notify }) {
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    Promise.all([apiFetch("/api/menu/items"), apiFetch("/api/menu/categories")])
      .then(([i, c]) => { setItems(i); setCategories(c); })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggleSoldOut(item) {
    try {
      await apiFetch(`/api/menu/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ soldOut: !item.sold_out }) });
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  if (err) return <ErrorBlock message={err} />;
  if (!items) return <LoadingBlock />;

  const byCategory = categories.map((c) => ({ ...c, items: items.filter((i) => i.category_id === c.id) }));

  return (
    <div>
      <div className="sectionHeader">
        <div><h2>Menu &amp; daily specials</h2><p>What the voice agent is allowed to recommend -- nothing it isn't configured here.</p></div>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={15} />Add item</button>
      </div>

      {byCategory.map((cat) => cat.items.length > 0 && (
        <div key={cat.id} style={{ marginBottom: 22 }}>
          <div className="cardTitle" style={{ marginBottom: 10 }}>{cat.name}</div>
          <div className="grid cols-3">
            {cat.items.map((item) => (
              <div key={item.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{item.name}</strong>
                  <span>₹{(item.price_cents / 100).toFixed(0)}</span>
                </div>
                <p className="cardHint" style={{ margin: "6px 0 10px" }}>{item.description}</p>
                <div className="pillRow" style={{ marginBottom: 10 }}>
                  {item.dietary_tags?.map((t) => <span key={t} className="pill">{t}</span>)}
                  {item.complimentary && <span className="pill">complimentary</span>}
                </div>
                <button className={`button small ${item.sold_out ? "secondary" : "danger"}`} onClick={() => toggleSoldOut(item)}>
                  {item.sold_out ? "Mark back in stock" : "Mark sold out"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showAdd && <AddMenuItemModal categories={categories} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); notify("Menu item saved"); load(); }} />}
    </div>
  );
}

function AddMenuItemModal({ categories, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", description: "", priceCents: 0, categoryId: categories[0]?.id || "", dietaryTags: "", recommendTags: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/menu/items", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          categoryId: form.categoryId ? Number(form.categoryId) : null,
          dietaryTags: form.dietaryTags.split(",").map((s) => s.trim()).filter(Boolean),
          recommendTags: form.recommendTags.split(",").map((s) => s.trim()).filter(Boolean)
        })
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader"><h3>Add menu item</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid">
          <div className="field"><label>Name</label><input className="textInput" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Category</label>
            <select className="select" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Description (spoken by the agent)</label><textarea className="textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="field"><label>Price (in paise/cents)</label><input className="textInput" type="number" value={form.priceCents} onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })} /></div>
          <div className="field"><label>Dietary tags (comma separated)</label><input className="textInput" value={form.dietaryTags} onChange={(e) => setForm({ ...form, dietaryTags: e.target.value })} placeholder="vegetarian, vegan" /></div>
          <button className="button primary" type="submit" disabled={saving} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>{saving ? "Saving..." : "Save item"}</button>
        </form>
      </div>
    </div>
  );
}

/* ====================================================================== Restaurant Info */

function RestaurantInfoView({ notify }) {
  const [settings, setSettings] = useState(null);
  const [rules, setRules] = useState(null);
  const [tab, setTab] = useState("profile");
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([apiFetch("/api/restaurant/info"), apiFetch("/api/restaurant/rules")])
      .then(([info, r]) => { setSettings(info.settings); setRules(r); })
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <ErrorBlock message={err} />;
  if (!settings || !rules) return <LoadingBlock />;

  async function saveProfile(patch) {
    try {
      const updated = await apiFetch("/api/restaurant/info", { method: "PUT", body: JSON.stringify(patch) });
      setSettings(updated);
      notify("Restaurant information saved");
    } catch (e) { notify(e.message, "error"); }
  }
  async function saveRules(patch) {
    try {
      const updated = await apiFetch("/api/restaurant/rules", { method: "PUT", body: JSON.stringify(patch) });
      setRules(updated);
      notify("Booking rules saved");
    } catch (e) { notify(e.message, "error"); }
  }

  return (
    <div>
      <div className="sectionHeader"><div><h2>Restaurant information</h2><p>What the voice agent and dashboard both rely on as the single source of truth.</p></div></div>
      <div className="tabRow">
        {[["profile", "Profile & hours"], ["policies", "Policies & amenities"], ["rules", "Booking rules"], ["extra", "Extra Info"]].map(([k, l]) => (
          <button key={k} className={`tabChip ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "profile" && <ProfileForm settings={settings} onSave={saveProfile} />}
      {tab === "policies" && <PoliciesForm settings={settings} onSave={saveProfile} />}
      {tab === "rules" && <RulesForm rules={rules} onSave={saveRules} />}
      {tab === "extra" && <ExtraInfoPanel notify={notify} />}
    </div>
  );
}

function ExtraInfoPanel({ notify }) {
  const [rows, setRows] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    apiFetch("/api/restaurant/extra-info").then(setRows).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggleActive(row) {
    try {
      await apiFetch(`/api/restaurant/extra-info/${row.id}`, { method: "PATCH", body: JSON.stringify({ topic: row.topic, detail: row.detail, active: !row.active }) });
      load();
    } catch (e) { notify(e.message, "error"); }
  }
  async function remove(row) {
    if (!confirm(`Remove "${row.topic}"?`)) return;
    try {
      await apiFetch(`/api/restaurant/extra-info/${row.id}`, { method: "DELETE" });
      notify("Removed");
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  if (err) return <ErrorBlock message={err} />;
  if (!rows) return <LoadingBlock />;

  return (
    <div className="card">
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <div>
          <div className="cardTitle">Extra info</div>
          <p className="cardHint">Add any topic + detail the voice agent should know -- birthday policy, dress code,
            live music nights, anything not covered by the fields above. Only active rows are sent to the agent.</p>
        </div>
        <button className="button primary small" onClick={() => setShowAdd(true)}><Plus size={14} />Add row</button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No extra info yet" hint="Add a topic and detail for anything the agent should be able to answer about." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((row) => (
            <div key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: row.active ? "#fff" : "var(--line-soft)" }}>
              <div>
                <strong style={{ fontSize: 13.5 }}>{row.topic}</strong>
                <p className="cardHint" style={{ marginTop: 4 }}>{row.detail}</p>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "flex-start" }}>
                <span className={`badge ${row.active ? "active" : "inactive"}`}>{row.active ? "Active" : "Hidden"}</span>
                <button className="button ghost small" onClick={() => toggleActive(row)}>{row.active ? "Hide" : "Show"}</button>
                <button className="button danger small" onClick={() => remove(row)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddExtraInfoModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); notify("Extra info saved"); load(); }} />}
    </div>
  );
}

function AddExtraInfoModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ topic: "", detail: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/restaurant/extra-info", { method: "POST", body: JSON.stringify(form) });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader"><h3>Add extra info</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid one">
          <div className="field"><label>Topic / name</label><input className="textInput" required value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Birthday policy" /></div>
          <div className="field"><label>Detail (what the agent should say)</label><textarea className="textarea" rows={4} required value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="e.g. We bring out a complimentary dessert for birthdays -- just mention it when booking." /></div>
          <button className="button primary" type="submit" disabled={saving} style={{ justifyContent: "center" }}>{saving ? "Saving..." : "Save"}</button>
        </form>
      </div>
    </div>
  );
}

function ProfileForm({ settings, onSave }) {
  const [form, setForm] = useState({ address: settings.address || "", phone: settings.phone || "", total_seating_capacity: settings.total_seating_capacity || 0, description: settings.description || "" });
  const [hours, setHours] = useState(settings.opening_hours || {});
  const days = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];

  return (
    <div className="card">
      <div className="formGrid" style={{ marginBottom: 20 }}>
        <div className="field"><label>Phone number</label><input className="textInput" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="field"><label>Total seating capacity</label><input className="textInput" type="number" value={form.total_seating_capacity} onChange={(e) => setForm({ ...form, total_seating_capacity: Number(e.target.value) })} /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}><label>Address</label><input className="textInput" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}><label>Description</label><textarea className="textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      </div>

      <div className="cardTitle" style={{ marginBottom: 10 }}>Opening hours</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {days.map(([key, label]) => {
          const day = hours[key] || { open: "11:00", close: "22:00", closed: false };
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 90, fontSize: 13 }}>{label}</span>
              <input type="checkbox" checked={!day.closed} onChange={(e) => setHours({ ...hours, [key]: { ...day, closed: !e.target.checked } })} />
              <input className="textInput" type="time" disabled={day.closed} value={day.open} onChange={(e) => setHours({ ...hours, [key]: { ...day, open: e.target.value } })} style={{ width: 120 }} />
              <span style={{ fontSize: 12, color: "var(--muted)" }}>to</span>
              <input className="textInput" type="time" disabled={day.closed} value={day.close} onChange={(e) => setHours({ ...hours, [key]: { ...day, close: e.target.value } })} style={{ width: 120 }} />
            </div>
          );
        })}
      </div>

      <button className="button primary" onClick={() => onSave({ ...form, opening_hours: hours })}>Save profile & hours</button>
    </div>
  );
}

function PoliciesForm({ settings, onSave }) {
  const [form, setForm] = useState({
    amenities: (settings.amenities || []).join(", "),
    parking_info: settings.parking_info || "",
    reservation_policy: settings.reservation_policy || "",
    cancellation_policy: settings.cancellation_policy || "",
    voice_greeting: settings.voice_greeting || ""
  });

  return (
    <div className="card">
      <div className="formGrid">
        <div className="field" style={{ gridColumn: "1 / -1" }}><label>Amenities (comma separated)</label><input className="textInput" value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}><label>Parking information (informational only)</label><input className="textInput" value={form.parking_info} onChange={(e) => setForm({ ...form, parking_info: e.target.value })} /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}><label>Reservation policy</label><textarea className="textarea" rows={2} value={form.reservation_policy} onChange={(e) => setForm({ ...form, reservation_policy: e.target.value })} /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}><label>Cancellation & modification policy</label><textarea className="textarea" rows={2} value={form.cancellation_policy} onChange={(e) => setForm({ ...form, cancellation_policy: e.target.value })} /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}><label>Voice agent greeting</label><textarea className="textarea" rows={2} value={form.voice_greeting} onChange={(e) => setForm({ ...form, voice_greeting: e.target.value })} /></div>
      </div>
      <button className="button primary" style={{ marginTop: 16 }} onClick={() => onSave({ ...form, amenities: form.amenities.split(",").map((s) => s.trim()).filter(Boolean) })}>Save policies</button>
    </div>
  );
}

function RulesForm({ rules, onSave }) {
  const [form, setForm] = useState(rules);
  return (
    <div className="card">
      <div className="formGrid">
        <div className="field"><label>Max party size for auto-confirm</label><input className="textInput" type="number" value={form.max_party_size_auto} onChange={(e) => setForm({ ...form, max_party_size_auto: Number(e.target.value) })} /></div>
        <div className="field"><label>Max tables per auto booking</label><input className="textInput" type="number" value={form.max_tables_per_auto_booking} onChange={(e) => setForm({ ...form, max_tables_per_auto_booking: Number(e.target.value) })} /></div>
        <div className="field"><label>Large group threshold (request-only)</label><input className="textInput" type="number" value={form.large_group_threshold} onChange={(e) => setForm({ ...form, large_group_threshold: Number(e.target.value) })} /></div>
        <div className="field"><label>Reservation duration (minutes)</label><input className="textInput" type="number" value={form.reservation_duration_minutes} onChange={(e) => setForm({ ...form, reservation_duration_minutes: Number(e.target.value) })} /></div>
        <div className="field"><label>Cancellation deadline (hours)</label><input className="textInput" type="number" value={form.cancellation_deadline_hours} onChange={(e) => setForm({ ...form, cancellation_deadline_hours: Number(e.target.value) })} /></div>
        <div className="field"><label>Modification deadline (hours)</label><input className="textInput" type="number" value={form.modification_deadline_hours} onChange={(e) => setForm({ ...form, modification_deadline_hours: Number(e.target.value) })} /></div>
        <div className="field"><label>Hold duration (minutes)</label><input className="textInput" type="number" value={form.hold_duration_minutes} onChange={(e) => setForm({ ...form, hold_duration_minutes: Number(e.target.value) })} /></div>
      </div>
      <div style={{ marginTop: 16 }}>
        <SwitchRow label="Full-table bookings require approval" checked={form.full_table_requires_approval} onChange={(v) => setForm({ ...form, full_table_requires_approval: v })} />
        <SwitchRow label="Combined-table arrangements require approval" checked={form.combined_table_requires_approval} onChange={(v) => setForm({ ...form, combined_table_requires_approval: v })} />
        <SwitchRow label="Deposit required for large bookings" checked={form.deposit_required} onChange={(v) => setForm({ ...form, deposit_required: v })} />
      </div>
      <button className="button primary" style={{ marginTop: 16 }} onClick={() => onSave(form)}>Save booking rules</button>
    </div>
  );
}

function SwitchRow({ label, hint, checked, onChange }) {
  return (
    <div className="switchRow">
      <div><div className="switchLabel">{label}</div>{hint && <div className="switchHint">{hint}</div>}</div>
      <button className={`switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><span /></button>
    </div>
  );
}

/* ====================================================================== Voice Agent */

function VoiceAgentView({ staff, notify }) {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [tab, setTab] = useState("tools");
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    Promise.all([apiFetch("/api/voice-agent/config"), fetch("/api/voice-agent/status").then((r) => r.json())])
      .then(([c, s]) => { setConfig(c); setStatus(s.data); })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <ErrorBlock message={err} />;
  if (!config) return <LoadingBlock />;

  return (
    <div>
      <div className="sectionHeader">
        <div><h2>AI Voice Agent -- {config.agent_name}</h2><p>Handles menu questions, availability checks, and reservations end to end.</p></div>
        <span className={`badge ${status?.enabled ? "active" : "inactive"}`}>{status?.enabled ? "Live" : "Not connected"}</span>
      </div>

      <div className="card" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--brand-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Mic size={18} color="var(--brand-dark)" />
        </div>
        <div>
          <strong style={{ fontSize: 13.5 }}>Try it from anywhere</strong>
          <p className="cardHint" style={{ marginTop: 2 }}>
            A &ldquo;Talk to {config.agent_name}&rdquo; launcher is pinned to the bottom-right corner on every screen --
            click it any time to place a real browser test call.
          </p>
        </div>
      </div>

      <div className="tabRow">
        <button className={`tabChip ${tab === "tools" ? "active" : ""}`} onClick={() => setTab("tools")}>Tool Tester</button>
        {staff.role === "super_admin" && <button className={`tabChip ${tab === "config" ? "active" : ""}`} onClick={() => setTab("config")}>Configuration</button>}
      </div>

      {tab === "tools" && <ToolTester notify={notify} />}
      {tab === "config" && staff.role === "super_admin" && <VoiceAgentConfigForm config={config} status={status} onSaved={(c) => { setConfig(c); load(); notify("Voice agent configuration saved"); }} />}
    </div>
  );
}

function ToolTester({ notify }) {
  const TOOL_NAMES = [
    "get_restaurant_information", "get_opening_hours", "get_menu", "get_daily_specials",
    "check_table_availability", "create_reservation", "get_reservation_status",
    "cancel_reservation", "request_human_handoff"
  ];
  const [tool, setTool] = useState(TOOL_NAMES[2]);
  const [argsText, setArgsText] = useState('{\n  "mealPeriod": "dinner"\n}');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const args = JSON.parse(argsText || "{}");
      const data = await apiFetch(`/api/agent-tools/${tool}`, { method: "POST", body: JSON.stringify(args) });
      setResult({ ok: true, data });
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally { setLoading(false); }
  }

  return (
    <div className="card">
      <div className="cardTitle">Text-based tool tester</div>
      <p className="cardHint" style={{ marginBottom: 14 }}>
        Calls the exact server-side tool the voice agent uses, with no audio required -- useful for verifying
        booking/menu logic directly.
      </p>
      <div className="formGrid">
        <div className="field">
          <label>Tool</label>
          <select className="select" value={tool} onChange={(e) => setTool(e.target.value)}>
            {TOOL_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>Arguments (JSON)</label>
        <textarea className="textarea" rows={6} value={argsText} onChange={(e) => setArgsText(e.target.value)} style={{ fontFamily: "monospace" }} />
      </div>
      <button className="button primary" style={{ marginTop: 12 }} onClick={run} disabled={loading}>{loading ? "Running..." : "Run tool"}</button>
      {result && (
        <pre style={{ marginTop: 14, background: "var(--line-soft)", padding: 14, borderRadius: 10, fontSize: 12.5, overflowX: "auto" }}>
          {JSON.stringify(result.ok ? result.data : { error: result.error }, null, 2)}
        </pre>
      )}
    </div>
  );
}

function VoiceAgentConfigForm({ config, status, onSaved }) {
  const [form, setForm] = useState({
    agent_name: config.agent_name, provider_agent_id: config.provider_agent_id || "",
    org_id: config.org_id || "", workspace_id: config.workspace_id || "", app_id: config.app_id || "",
    api_key: "", input_sample_rate: config.input_sample_rate, output_sample_rate: config.output_sample_rate,
    initial_bot_message: config.initial_bot_message || "", telephony_configured: config.telephony_configured, enabled: config.enabled
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const saved = await apiFetch("/api/voice-agent/config", { method: "PUT", body: JSON.stringify(form) });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="card">
      <div className="cardTitle" style={{ display: "flex", alignItems: "center", gap: 8 }}><ShieldCheck size={16} />Super admin configuration</div>
      <p className="cardHint" style={{ marginBottom: 16 }}>
        Credentials are encrypted at rest and never sent to the browser. Telephony (real inbound calls) needs a
        separate connected phone number -- status: <strong>{form.telephony_configured ? "configured" : "not configured"}</strong>.
      </p>
      {error && <div className="loginError">{error}</div>}
      <form onSubmit={submit} className="formGrid">
        <div className="field"><label>Agent name</label><input className="textInput" value={form.agent_name} onChange={(e) => setForm({ ...form, agent_name: e.target.value })} /></div>
        <div className="field"><label>Provider agent ID</label><input className="textInput" value={form.provider_agent_id} onChange={(e) => setForm({ ...form, provider_agent_id: e.target.value })} /></div>
        <div className="field"><label>Org ID</label><input className="textInput" value={form.org_id} onChange={(e) => setForm({ ...form, org_id: e.target.value })} /></div>
        <div className="field"><label>Workspace ID</label><input className="textInput" value={form.workspace_id} onChange={(e) => setForm({ ...form, workspace_id: e.target.value })} /></div>
        <div className="field"><label>App ID</label><input className="textInput" value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value })} /></div>
        <div className="field"><label>API key {config.has_api_key && <span className="cardHint">(set via {config.key_source})</span>}</label><input className="textInput" type="password" placeholder={config.has_api_key ? "Leave blank to keep current key" : "Required"} value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}><label>Greeting</label><textarea className="textarea" rows={2} value={form.initial_bot_message} onChange={(e) => setForm({ ...form, initial_bot_message: e.target.value })} /></div>
      </form>
      <div style={{ marginTop: 10 }}>
        <SwitchRow label="Agent enabled" hint="Turn off to immediately stop the browser test widget and runtime proxy." checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
        <SwitchRow label="Telephony connected" hint="Only enable once a real phone number is wired up and tested end to end." checked={form.telephony_configured} onChange={(v) => setForm({ ...form, telephony_configured: v })} />
      </div>
      <button className="button primary" style={{ marginTop: 16 }} onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save configuration"}</button>
    </div>
  );
}

/* ====================================================================== Calls */

function CallsView({ notify }) {
  const [calls, setCalls] = useState(null);
  const [followups, setFollowups] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    Promise.all([apiFetch("/api/calls"), apiFetch("/api/followups")])
      .then(([c, f]) => { setCalls(c); setFollowups(f); })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function resolveFollowup(id) {
    try {
      await apiFetch(`/api/followups/${id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
      notify("Follow-up marked done");
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  if (err) return <ErrorBlock message={err} />;
  if (!calls || !followups) return <LoadingBlock />;

  return (
    <div>
      <div className="sectionHeader"><div><h2>Calls & follow-ups</h2><p>Every voice agent interaction and anything that needs a staff callback.</p></div></div>

      <div className="cardTitle" style={{ marginBottom: 10 }}>Recent calls</div>
      {calls.length === 0 ? <EmptyState title="No calls yet" hint="Browser test calls and real phone calls will appear here." /> : (
        <div className="tableWrap" style={{ marginBottom: 26 }}>
          <table className="table">
            <thead><tr><th>Caller</th><th>Channel</th><th>Status</th><th>Outcome</th><th>Started</th></tr></thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id}>
                  <td>{c.caller_number || "Unknown"}</td>
                  <td>{c.channel.replace("_", " ")}</td>
                  <td><span className={`badge ${c.status}`}>{c.status}</span></td>
                  <td>{c.outcome || "--"}</td>
                  <td>{new Date(c.started_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="cardTitle" style={{ marginBottom: 10 }}>Staff follow-ups</div>
      {followups.length === 0 ? <EmptyState title="No open follow-ups" hint="Escalations and callback requests will show up here." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {followups.map((f) => (
            <div key={f.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{f.title}</strong>
                <div className="cardHint">{f.notes}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`badge ${f.status}`}>{f.status.replace("_", " ")}</span>
                {f.status !== "done" && <button className="button secondary small" onClick={() => resolveFollowup(f.id)}>Mark done</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ====================================================================== Reports */

function ReportsView({ date }) {
  const [data, setData] = useState(null);
  useEffect(() => { apiFetch(`/api/overview?date=${date}`).then(setData).catch(() => {}); }, [date]);
  if (!data) return <LoadingBlock />;
  const rows = Object.entries(data.reservations);

  return (
    <div>
      <div className="sectionHeader"><div><h2>Reports</h2><p>Reservation mix for {date}.</p></div></div>
      <div className="tableWrap">
        <table className="table">
          <thead><tr><th>Status</th><th>Count</th><th>Guests</th></tr></thead>
          <tbody>
            {rows.map(([status, v]) => (
              <tr key={status}><td><span className={`badge ${status}`}>{status.replace("_", " ")}</span></td><td>{v.count}</td><td>{v.guests}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <div className="cardTitle">Seat occupancy right now</div>
        <div className="statValue">{data.seats.occupied_now} / {data.seats.total_seats}</div>
        <div className="cardHint">seats currently occupied</div>
      </div>
    </div>
  );
}

/* ====================================================================== Team */

function TeamView({ notify }) {
  const [staff, setStaff] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => { apiFetch("/api/staff").then(setStaff).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  async function toggleActive(member) {
    try {
      await apiFetch(`/api/staff/${member.id}`, { method: "PATCH", body: JSON.stringify({ active: !member.active }) });
      notify(member.active ? "Account disabled" : "Account enabled");
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  if (err) return <ErrorBlock message={err} />;
  if (!staff) return <LoadingBlock />;

  return (
    <div>
      <div className="sectionHeader">
        <div><h2>Team & settings</h2><p>Only super admins can create accounts or change roles.</p></div>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={15} />Add staff</button>
      </div>
      <div className="tableWrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {staff.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td><td>{m.username}</td>
                <td><span className="pill">{m.role === "super_admin" ? "Super Admin" : "Admin"}</span></td>
                <td><span className={`badge ${m.active ? "active" : "inactive"}`}>{m.active ? "Active" : "Disabled"}</span></td>
                <td><button className="button ghost small" onClick={() => toggleActive(m)}>{m.active ? "Disable" : "Enable"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && <AddStaffModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); notify("Staff account created"); load(); }} />}
    </div>
  );
}

function AddStaffModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "", role: "admin" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/staff", { method: "POST", body: JSON.stringify(form) });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader"><h3>Add staff account</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid">
          <div className="field"><label>Name</label><input className="textInput" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Username</label><input className="textInput" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div className="field"><label>Email</label><input className="textInput" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><label>Password</label><input className="textInput" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Role</label>
            <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="admin">Admin -- day-to-day operations</option>
              <option value="super_admin">Super Admin -- full configuration access</option>
            </select>
          </div>
          <button className="button primary" type="submit" disabled={saving} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>{saving ? "Creating..." : "Create account"}</button>
        </form>
      </div>
    </div>
  );
}

/* ====================================================================== Shared bits */

function LoadingBlock() { return <div className="emptyState">Loading...</div>; }
function ErrorBlock({ message }) { return <div className="emptyState"><h3>Something went wrong</h3><p>{message}</p></div>; }
function EmptyState({ title, hint }) { return <div className="emptyState"><Sparkles size={22} style={{ marginBottom: 10, opacity: 0.5 }} /><h3>{title}</h3><p>{hint}</p></div>; }
