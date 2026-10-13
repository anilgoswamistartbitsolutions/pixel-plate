"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid, Grid3x3, CalendarClock, Users2, UtensilsCrossed, Building2,
  Mic, PhoneCall, BarChart3, Settings, LogOut, Plus, X, Check, Ban,
  MapPin, Clock, ShieldCheck, Sparkles, ShoppingBag, Layers, CalendarDays, UtensilsCrossed
} from "lucide-react";
import { apiFetch, getStaff, clearSession } from "@/lib/api-client";
import VoiceAgentWidget from "@/components/VoiceAgentWidget";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";

// Every status/tag/source value in the database is lowercase snake_case (confirmed,
// no_show, prepared_paid, ...) -- this is the one place that turns it into display text
// ("Confirmed", "No Show", "Prepared & Paid") so every badge, tab, and table cell reads the
// same way instead of each view hand-rolling its own capitalization.
const LABEL_OVERRIDES = { prepared_paid: "Prepared & Paid", no_show: "No Show", needs_info: "Needs Info" };
function titleCase(value) {
  if (!value) return "";
  if (LABEL_OVERRIDES[value]) return LABEL_OVERRIDES[value];
  return String(value).split(/[_\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "floorplan", label: "Live Floor Plan", icon: Grid3x3 },
  { key: "reservations", label: "Reservations", icon: CalendarClock },
  { key: "groups", label: "Leads", icon: Users2 },
  { key: "menu", label: "Menu & Daily Specials", icon: UtensilsCrossed },
  { key: "takeaway", label: "Take Away", icon: ShoppingBag },
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

  if (!ready) return <div className="fullPageLoader"><div className="spinner" />Loading Pixel Plate...</div>;

  const visibleNav = NAV_ITEMS.filter((item) => !item.superOnly || staff.role === "super_admin");

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark"><UtensilsCrossed size={18} /></div>
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
          <div className="topBarSub">Pixel Plate &middot; {staff.role === "super_admin" ? "Super Admin" : "Admin"} access</div>
          <div className="topBarRight">
            {["overview", "reservations", "reports"].includes(view) && (
              <input className="dateInput" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </div>
        </header>
        <main className="contentArea">
          {view === "overview" && <OverviewView date={date} onNavigate={setView} />}
          {view === "floorplan" && <FloorPlanView notify={notify} staff={staff} />}
          {view === "reservations" && <ReservationsView date={date} notify={notify} />}
          {view === "groups" && <GroupRequestsView notify={notify} />}
          {view === "menu" && <MenuView notify={notify} />}
          {view === "takeaway" && <TakeAwayView notify={notify} />}
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
  const [trend, setTrend] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch(`/api/overview?date=${date}`).then(setData).catch((e) => setErr(e.message));
    apiFetch(`/api/reports/trend?from=${addDays(date, -6)}&to=${date}`).then(setTrend).catch(() => {});
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
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="sectionHeader" style={{ marginBottom: 10 }}>
          <div>
            <div className="cardTitle">Last 7 days</div>
            <p className="cardHint">Confirmed bookings and guests, at a glance.</p>
          </div>
          <button className="button ghost small" onClick={() => onNavigate("reports")}>Full reports &rarr;</button>
        </div>
        {!trend ? <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div> : trend.length === 0 ? (
          <EmptyState title="No data yet" hint="Reservation history will chart here once bookings come in." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend} margin={{ left: -16, right: 8 }}>
              <defs>
                <linearGradient id="ppOverviewBrand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d97b4a" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#d97b4a" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ecdfd0" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short" })} tick={{ fontSize: 11, fill: "#847a6f" }} axisLine={{ stroke: "#ecdfd0" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#847a6f" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #ecdfd0", fontSize: 12.5 }} />
              <Area type="monotone" dataKey="confirmed" name="Confirmed" stroke="#d97b4a" fill="url(#ppOverviewBrand)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
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

function FloorPlanView({ notify, staff }) {
  const [tables, setTables] = useState(null);
  const [floors, setFloors] = useState(null);
  const [openFloorId, setOpenFloorId] = useState(null);
  const [showAddFloor, setShowAddFloor] = useState(false);
  const [err, setErr] = useState("");
  const isSuperAdmin = staff?.role === "super_admin";

  const load = useCallback(() => {
    apiFetch("/api/floor-plan").then(setTables).catch((e) => setErr(e.message));
    apiFetch("/api/floors").then(setFloors).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function deleteFloor(floor) {
    if (!confirm(`Delete floor "${floor.name}"? This only works if it has no tables assigned.`)) return;
    try {
      await apiFetch(`/api/floors/${floor.id}`, { method: "DELETE" });
      notify("Floor deleted");
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  if (err) return <ErrorBlock message={err} />;
  if (!tables || !floors) return <LoadingBlock />;

  if (openFloorId) {
    const floor = floors.find((f) => f.id === openFloorId);
    return (
      <FloorDetailView
        floor={floor} tables={tables.filter((t) => t.floor_id === openFloorId)}
        isSuperAdmin={isSuperAdmin} notify={notify}
        onBack={() => setOpenFloorId(null)}
        onReload={load}
      />
    );
  }

  const unassignedTables = tables.filter((t) => !t.floor_id);

  return (
    <div>
      <div className="sectionHeader">
        <div>
          <h2>Floor plan</h2>
          <p>Select a floor to arrange its tables, or add a new one.</p>
        </div>
        <button className="button primary" onClick={() => setShowAddFloor(true)}><Layers size={15} />Add floor</button>
      </div>

      {floors.length === 0 ? (
        <EmptyState title="No floors yet" hint="Add a floor (e.g. Main Dining, Patio) to start placing tables." />
      ) : (
        <div className="grid cols-3">
          {floors.map((floor) => {
            const floorTables = tables.filter((t) => t.floor_id === floor.id);
            const activeTables = floorTables.filter((t) => t.active);
            const capacity = activeTables.reduce((sum, t) => sum + t.capacity, 0);
            return (
              <div key={floor.id} className="card" style={{ cursor: "pointer" }} onClick={() => setOpenFloorId(floor.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{floor.name}</strong>
                    <p className="cardHint" style={{ marginTop: 4 }}>{activeTables.length} active table{activeTables.length === 1 ? "" : "s"} &middot; {capacity} seats</p>
                  </div>
                  {isSuperAdmin && (
                    <button className="button ghost small" onClick={(e) => { e.stopPropagation(); deleteFloor(floor); }} title="Delete floor">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button className="button secondary small" style={{ marginTop: 12 }} onClick={() => setOpenFloorId(floor.id)}>Open floor &rarr;</button>
              </div>
            );
          })}
        </div>
      )}

      {unassignedTables.length > 0 && (
        <div className="card" style={{ marginTop: 20, background: "var(--amber-soft)" }}>
          <strong style={{ fontSize: 13.5 }}>{unassignedTables.length} table{unassignedTables.length === 1 ? "" : "s"} not assigned to a floor</strong>
          <p className="cardHint" style={{ marginTop: 4 }}>Open a floor and edit a table to assign it, or create one directly from a floor page.</p>
        </div>
      )}

      {showAddFloor && <AddFloorModal onClose={() => setShowAddFloor(false)} onSaved={() => { setShowAddFloor(false); notify("Floor created"); load(); }} />}
    </div>
  );
}

function FloorDetailView({ floor, tables, isSuperAdmin, notify, onBack, onReload }) {
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [localTables, setLocalTables] = useState(tables);

  useEffect(() => { setLocalTables(tables); }, [tables]);

  async function toggleActive(table) {
    try {
      await apiFetch(`/api/tables/${table.id}`, { method: "PATCH", body: JSON.stringify({ action: table.active ? "deactivate" : "reactivate" }) });
      notify(table.active ? "Table deactivated" : "Table reactivated");
      onReload();
    } catch (e) { notify(e.message, "error"); }
  }

  async function deleteTable(table) {
    if (!confirm(`Permanently delete table ${table.code}? This only works if it has no reservation history.`)) return;
    try {
      await apiFetch(`/api/tables/${table.id}`, { method: "DELETE" });
      notify("Table deleted");
      setSelected(null);
      onReload();
    } catch (e) { notify(e.message, "error"); }
  }

  async function handleDrag(table, dx, dy) {
    const posX = Math.max(0, Number(table.pos_x) + dx);
    const posY = Math.max(0, Number(table.pos_y) + dy);
    setLocalTables((prev) => prev.map((t) => (t.id === table.id ? { ...t, pos_x: posX, pos_y: posY } : t)));
    apiFetch(`/api/tables/${table.id}`, { method: "PATCH", body: JSON.stringify({ action: "move", posX, posY }) }).catch(() => {});
  }

  return (
    <div>
      <button className="button ghost small" style={{ marginBottom: 14 }} onClick={onBack}>&larr; All floors</button>
      <div className="sectionHeader">
        <div>
          <h2>{floor?.name}</h2>
          <p>Drag tables to arrange the room -- position saves automatically. Click a table to see seats, reservations, and edit or delete it.</p>
        </div>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={15} />Add table</button>
      </div>

      <div className="legendRow">
        <span><span className="legendDot" style={{ background: "#fff", border: "2px solid var(--line)" }} />Available</span>
        <span><span className="legendDot" style={{ background: "#fbeedb", border: "2px solid var(--amber)" }} />Reserved upcoming</span>
        <span><span className="legendDot" style={{ background: "var(--danger-soft)", border: "2px solid var(--danger)" }} />Occupied now</span>
        <span><span className="legendDot" style={{ background: "#eee7db", border: "2px solid var(--muted)" }} />Inactive</span>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="floorCanvasWrap" style={{ flex: "1 1 560px", minWidth: 320 }}>
          <div className="floorCanvas">
            {localTables.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <EmptyState title="No tables on this floor yet" hint="Click Add table to place your first one here." />
              </div>
            )}
            {localTables.map((table) => (
              <DraggableTable key={table.id} table={table} selected={selected?.id === table.id} onSelect={() => setSelected(table)} onDrag={handleDrag} />
            ))}
          </div>
        </div>

        <div className="card" style={{ flex: "0 0 300px", minWidth: 280, position: "sticky", top: 86 }}>
          {!selected ? (
            <EmptyState title="Select a table" hint="Click a table on the floor plan to see its seats and reservations." />
          ) : (
            <TableDetail table={selected} onToggleActive={toggleActive} onEdit={() => setEditing(selected)}
              onDelete={isSuperAdmin ? () => deleteTable(selected) : null} onClose={() => setSelected(null)} />
          )}
        </div>
      </div>

      {showAdd && <AddTableModal floors={[floor]} defaultFloorId={floor?.id} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); notify("Table created"); onReload(); }} />}
      {editing && <EditTableModal table={editing} floors={[floor]} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); notify("Table updated"); onReload(); }} />}
    </div>
  );
}

function DraggableTable({ table, selected, onSelect, onDrag }) {
  const [dragging, setDragging] = useState(false);

  function onMouseDown(e) {
    if (!table.active) { onSelect(); return; }
    e.preventDefault();
    setDragging(false);
    let moved = false;
    let last = { x: e.clientX, y: e.clientY };
    function onMove(ev) {
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
      last = { x: ev.clientX, y: ev.clientY };
      if (moved) { setDragging(true); onDrag(table, dx, dy); }
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!moved) onSelect();
      setTimeout(() => setDragging(false), 0);
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
      style={{ left: `${table.pos_x}px`, top: `${table.pos_y}px`, width: `${table.width}px`, height: `${table.height}px` }}
      onMouseDown={onMouseDown}
    >
      <span className="code">{table.code}</span>
      <span className="cap">{table.capacity} seats</span>
    </div>
  );
}

function TableDetail({ table, onToggleActive, onEdit, onDelete, onClose }) {
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

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button className="button secondary small" onClick={onEdit}>Edit table</button>
        <button className="button danger small" onClick={() => onToggleActive(table)}>
          {table.active ? "Deactivate" : "Reactivate"}
        </button>
        {onDelete && <button className="button danger small" onClick={onDelete}>Delete permanently</button>}
      </div>
    </div>
  );
}

const TABLE_SIZE_OPTIONS = [["small", "Small (2-top)"], ["medium", "Medium (4-top)"], ["large", "Large (6-top)"], ["xl", "XL / Private (8+)"]];

function AddTableModal({ floors, defaultFloorId, onClose, onSaved }) {
  const [form, setForm] = useState({ code: "", displayName: "", capacity: 4, tableType: "standard", sizeLabel: "medium", floorId: defaultFloorId || floors?.[0]?.id || "", shareable: false });
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
          <div className="field"><label>Floor</label>
            <select className="select" value={form.floorId} onChange={(e) => setForm({ ...form, floorId: e.target.value })}>
              <option value="">No floor assigned</option>
              {floors?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Table type</label>
            <select className="select" value={form.tableType} onChange={(e) => setForm({ ...form, tableType: e.target.value })}>
              <option value="standard">Standard</option><option value="shared">Shared</option><option value="private">Private</option><option value="booth">Booth</option>
            </select>
          </div>
          <div className="field"><label>Size</label>
            <select className="select" value={form.sizeLabel} onChange={(e) => setForm({ ...form, sizeLabel: e.target.value })}>
              {TABLE_SIZE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
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

function AddFloorModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/floors", { method: "POST", body: JSON.stringify({ name }) });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader"><h3>Add floor</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid one">
          <div className="field"><label>Floor name</label><input className="textInput" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ocean View Patio" /></div>
          <button className="button primary" type="submit" disabled={saving} style={{ justifyContent: "center" }}>{saving ? "Creating..." : "Create floor"}</button>
        </form>
      </div>
    </div>
  );
}

function EditTableModal({ table, floors, onClose, onSaved }) {
  const [form, setForm] = useState({
    displayName: table.display_name, capacity: table.capacity, tableType: table.table_type,
    sizeLabel: table.size_label || "medium", floorId: table.floor_id || "",
    shareable: table.shareable, exclusiveOnly: table.exclusive_only, fullTableRequiresApproval: table.full_table_requires_approval
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/tables/${table.id}`, { method: "PATCH", body: JSON.stringify(form) });
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
        <div className="modalHeader"><h3>Edit table {table.code}</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid">
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Display name</label><input className="textInput" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
          <div className="field">
            <label>Capacity</label>
            <input className="textInput" type="number" min="1" required value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            <span className="cardHint">Changing this does not alter existing seat codes/allocations.</span>
          </div>
          <div className="field"><label>Table type</label>
            <select className="select" value={form.tableType} onChange={(e) => setForm({ ...form, tableType: e.target.value })}>
              <option value="standard">Standard</option><option value="shared">Shared</option><option value="private">Private</option><option value="booth">Booth</option>
            </select>
          </div>
          <div className="field"><label>Floor</label>
            <select className="select" value={form.floorId} onChange={(e) => setForm({ ...form, floorId: e.target.value })}>
              <option value="">No floor assigned</option>
              {floors?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Size</label>
            <select className="select" value={form.sizeLabel} onChange={(e) => setForm({ ...form, sizeLabel: e.target.value })}>
              {TABLE_SIZE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.shareable} onChange={(e) => setForm({ ...form, shareable: e.target.checked })} /> Allow sharing with other parties
            </label>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.fullTableRequiresApproval} onChange={(e) => setForm({ ...form, fullTableRequiresApproval: e.target.checked })} /> Full-table bookings on this table need staff approval
            </label>
          </div>
          <button className="button primary" type="submit" disabled={saving} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>{saving ? "Saving..." : "Save changes"}</button>
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
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(date);
  const [rangeTo, setRangeTo] = useState(date);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    const params = rangeMode
      ? { from: rangeFrom, to: rangeTo }
      : { date };
    const qs = new URLSearchParams({ ...params, ...(status ? { status } : {}) });
    apiFetch(`/api/reservations?${qs}`).then(setList).catch((e) => setErr(e.message));
  }, [date, status, rangeMode, rangeFrom, rangeTo]);

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
        <div>
          <h2>Reservations</h2>
          <p>{rangeMode ? `Bookings from ${rangeFrom} to ${rangeTo}` : `Bookings for ${date}`}, with real-time seat allocations.</p>
        </div>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={15} />New reservation</button>
      </div>

      <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`button small ${!rangeMode ? "primary" : "secondary"}`} onClick={() => setRangeMode(false)}>Single day</button>
          <button className={`button small ${rangeMode ? "primary" : "secondary"}`} onClick={() => setRangeMode(true)}>Date range</button>
        </div>
        {rangeMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input className="dateInput" type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
            <span className="cardHint">to</span>
            <input className="dateInput" type="date" value={rangeTo} min={rangeFrom} onChange={(e) => setRangeTo(e.target.value)} />
          </div>
        )}
        {!rangeMode && <span className="cardHint">Using the date picker in the top bar. Switch to Date range to view multiple days at once.</span>}
      </div>

      <div className="tabRow">
        {["", "confirmed", "pending", "seated", "completed", "cancelled", "no_show"].map((s) => (
          <button key={s} className={`tabChip ${status === s ? "active" : ""}`} onClick={() => setStatus(s)}>{s ? titleCase(s) : "All"}</button>
        ))}
      </div>

      {!list ? <LoadingBlock /> : list.length === 0 ? (
        <EmptyState title="No reservations" hint="New bookings from the dashboard or the voice agent will show up here." />
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Ref</th><th>Guest</th><th>Party</th>{rangeMode && <th>Date</th>}<th>Time</th><th>Seating</th><th>Status</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{r.booking_ref}</td>
                  <td>{r.customer_name}<div className="cardHint">{r.phone}</div></td>
                  <td>{r.party_size}</td>
                  {rangeMode && <td>{String(r.reservation_date).slice(0, 10)}</td>}
                  <td>{r.start_time?.slice(0, 5)}</td>
                  <td>
                    {titleCase(r.seating_mode)}
                    {r.seats?.length > 0 && (
                      <div className="pillRow" style={{ marginTop: 4 }}>
                        {r.seats.map((s, i) => <span key={i} className="pill">{s.code}</span>)}
                      </div>
                    )}
                  </td>
                  <td><span className={`badge ${r.status}`}>{titleCase(r.status)}</span></td>
                  <td>{titleCase(r.source)}</td>
                  <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["confirmed", "pending", "seated"].includes(r.status) && <button className="button ghost small" onClick={() => setEditing(r)}>Edit</button>}
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
      {editing && <EditReservationModal reservation={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); notify("Reservation updated"); load(); }} />}
    </div>
  );
}

const TIME_SLOTS = [
  { label: "Morning", icon: "🌅", times: ["08:00", "09:00", "10:00", "11:00"] },
  { label: "Mid-day", icon: "☀️", times: ["12:00", "13:00", "14:00", "15:00"] },
  { label: "Evening", icon: "🌙", times: ["18:00", "19:00", "20:00", "21:00"] }
];

function EditReservationModal({ reservation, onClose, onSaved }) {
  const [form, setForm] = useState({
    reservationDate: String(reservation.reservation_date).slice(0, 10),
    startTime: reservation.start_time?.slice(0, 5) || "19:00",
    partySize: reservation.party_size
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/reservations/${reservation.id}`, { method: "PATCH", body: JSON.stringify({ action: "modify", ...form }) });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader"><h3>Edit reservation {reservation.booking_ref}</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        {error && <div className="loginError">{error}</div>}
        <div className="cardHint" style={{ marginBottom: 14 }}>{reservation.customer_name} &middot; {reservation.phone}</div>
        <form onSubmit={submit} className="formGrid">
          <div className="field"><label>Date</label><input className="textInput" type="date" required value={form.reservationDate} onChange={(e) => setForm({ ...form, reservationDate: e.target.value })} /></div>
          <div className="field"><label>Time</label><input className="textInput" type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
          <div className="field"><label>Party size</label><input className="textInput" type="number" min="1" required value={form.partySize} onChange={(e) => setForm({ ...form, partySize: Number(e.target.value) })} /></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="cardHint">If the new time/size isn&rsquo;t available, the original booking stays unchanged.</span>
          </div>
          <button className="button primary" type="submit" disabled={saving} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>{saving ? "Checking availability..." : "Save changes"}</button>
        </form>
      </div>
    </div>
  );
}

function AddReservationModal({ defaultDate, onClose, onSaved }) {
  const [form, setForm] = useState({ customerName: "", phone: "", partySize: 2, reservationDate: defaultDate, startTime: "19:00", seatingPreference: "together", notes: "" });
  const [tableIds, setTableIds] = useState([]);
  const [options, setOptions] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const activeSlot = TIME_SLOTS.find((s) => s.times.includes(form.startTime))?.label;

  function toggleTable(id) {
    setTableIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  async function checkAvailability() {
    setChecking(true);
    setError("");
    setOptions(null);
    setTableIds([]);
    try {
      const qs = new URLSearchParams({ date: form.reservationDate, time: form.startTime, partySize: String(form.partySize) });
      const result = await apiFetch(`/api/availability?${qs}`);
      setOptions(result.options);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const outcome = await apiFetch("/api/reservations", { method: "POST", body: JSON.stringify({ ...form, preferredTableIds: tableIds.length ? tableIds : null }) });
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
          <div className="field"><label>Party size</label><input className="textInput" type="number" min="1" required value={form.partySize} onChange={(e) => { setForm({ ...form, partySize: Number(e.target.value) }); setOptions(null); }} /></div>
          <div className="field"><label>Date</label><input className="textInput" type="date" required value={form.reservationDate} onChange={(e) => { setForm({ ...form, reservationDate: e.target.value }); setOptions(null); }} /></div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Time of day</label>
            <div className="pillRow">
              {TIME_SLOTS.map((slot) => (
                <button type="button" key={slot.label}
                  className={`button small ${activeSlot === slot.label ? "primary" : "secondary"}`}
                  onClick={() => { setForm({ ...form, startTime: slot.times[0] }); setOptions(null); }}>
                  {slot.icon} {slot.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field"><label>Exact time</label><input className="textInput" type="time" required value={form.startTime} onChange={(e) => { setForm({ ...form, startTime: e.target.value }); setOptions(null); }} /></div>
          <div className="field"><label>Seating preference</label>
            <select className="select" value={form.seatingPreference} onChange={(e) => setForm({ ...form, seatingPreference: e.target.value })}>
              <option value="together">Everyone together</option>
              <option value="split_ok">Nearby tables okay</option>
              <option value="shared_ok">Shared table okay</option>
            </select>
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="button secondary small" onClick={checkAvailability} disabled={checking}>
              {checking ? "Checking..." : "Check table availability"}
            </button>
          </div>

          {options && (
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              {options.length === 0 ? (
                <div className="cardHint" style={{ background: "var(--amber-soft)", padding: 10, borderRadius: 10, color: "#9a6d13" }}>
                  No tables currently fit {form.partySize} guests at that time -- booking will be sent for staff review as a group request.
                </div>
              ) : (
                <>
                  <label>
                    {options.length} table{options.length === 1 ? "" : "s"} available -- select one or more
                    (optional, we&rsquo;ll choose the best fit otherwise; selecting several seats the party across
                    those exact tables together)
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {options.map((o) => (
                      <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: `1px solid ${tableIds.includes(o.id) ? "var(--brand)" : "var(--line)"}`, borderRadius: "var(--radius-sm)", background: tableIds.includes(o.id) ? "var(--brand-soft)" : "#fff", cursor: "pointer" }}>
                        <input type="checkbox" checked={tableIds.includes(o.id)} onChange={() => toggleTable(o.id)} />
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{o.displayName}</span>
                        <span className="cardHint">{o.capacity} seats &middot; {o.freeSeatCount} free{o.fullTable ? " &middot; full table" : ""}</span>
                      </label>
                    ))}
                  </div>
                  {tableIds.length > 1 && <div className="cardHint" style={{ marginTop: 6 }}>Multiple tables selected -- this will need staff approval as a combined-table booking.</div>}
                </>
              )}
            </div>
          )}

          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button className="button primary" type="submit" disabled={saving} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>{saving ? "Booking..." : "Check & book"}</button>
        </form>
      </div>
    </div>
  );
}

/* ====================================================================== Group Requests */

const LEAD_TYPE_LABELS = { group_booking: "Group Booking", full_floor: "Full Floor", general_inquiry: "General Inquiry", other: "Other" };
const PRIORITY_COLORS = { urgent: "cancelled", high: "pending", normal: "active", low: "completed" };

function GroupRequestsView({ notify }) {
  const [list, setList] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    const qs = filterStatus ? `?status=${filterStatus}` : "";
    apiFetch(`/api/group-requests${qs}`).then(setList).catch((e) => setErr(e.message));
  }, [filterStatus]);
  useEffect(() => { load(); }, [load]);

  async function confirmRequest(id) {
    try {
      const result = await apiFetch(`/api/group-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action: "confirm" }) });
      notify(result.status === "confirmed" ? "Lead confirmed" : "Still unavailable -- marked needs info");
      load();
    } catch (e) { notify(e.message, "error"); }
  }
  async function rejectRequest(id) {
    try {
      await apiFetch(`/api/group-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action: "reject", staffNotes: "Unable to accommodate" }) });
      notify("Lead rejected");
      load();
    } catch (e) { notify(e.message, "error"); }
  }
  async function setPriority(id, priority) {
    try {
      await apiFetch(`/api/group-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action: "update_meta", priority }) });
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  if (err) return <ErrorBlock message={err} />;

  return (
    <div>
      <div className="sectionHeader">
        <div><h2>Leads</h2><p>Large parties, full-floor requests, and anything needing staff review before it becomes a real booking.</p></div>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={15} />New lead</button>
      </div>

      <div className="tabRow">
        {["", "pending", "needs_info", "confirmed", "rejected"].map((s) => (
          <button key={s} className={`tabChip ${filterStatus === s ? "active" : ""}`} onClick={() => setFilterStatus(s)}>{s ? titleCase(s) : "All"}</button>
        ))}
      </div>

      {!list ? <LoadingBlock /> : list.length === 0 ? (
        <EmptyState title="No leads" hint="Large or ambiguous booking requests from the voice agent or staff will land here." />
      ) : (
        <div className="grid cols-2">
          {list.map((req) => (
            <div key={req.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <strong>{req.customer_name}</strong>
                <div style={{ display: "flex", gap: 6 }}>
                  <span className={`badge ${PRIORITY_COLORS[req.priority]}`}>{titleCase(req.priority)}</span>
                  <span className={`badge ${req.status}`}>{titleCase(req.status)}</span>
                </div>
              </div>
              <div className="pillRow" style={{ marginBottom: 8 }}>
                <span className="pill">{LEAD_TYPE_LABELS[req.lead_type] || titleCase(req.lead_type)}</span>
              </div>
              <div className="cardHint">{req.phone}</div>
              <div style={{ margin: "10px 0", fontSize: 13.5 }}>
                <div><Users2 size={13} style={{ verticalAlign: "-2px" }} /> {req.party_size} guests</div>
                <div><Clock size={13} style={{ verticalAlign: "-2px" }} /> {String(req.requested_date).slice(0, 10)} at {req.requested_time?.slice(0, 5)}</div>
                {req.seating_preference && <div><MapPin size={13} style={{ verticalAlign: "-2px" }} /> {req.seating_preference}</div>}
              </div>
              {req.notes && <p className="cardHint">{req.notes}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {["pending", "needs_info"].includes(req.status) && (
                  <>
                    <button className="button primary small" onClick={() => confirmRequest(req.id)}><Check size={13} />Confirm</button>
                    <button className="button danger small" onClick={() => rejectRequest(req.id)}><Ban size={13} />Reject</button>
                  </>
                )}
                <select className="select" style={{ minHeight: 32, padding: "4px 28px 4px 10px", fontSize: 12.5 }} value={req.priority} onChange={(e) => setPriority(req.id, e.target.value)}>
                  <option value="low">Low priority</option>
                  <option value="normal">Normal priority</option>
                  <option value="high">High priority</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); notify("Lead created"); load(); }} />}
    </div>
  );
}

function AddLeadModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    customerName: "", phone: "", partySize: 8, requestedDate: "", requestedTime: "19:00",
    seatingPreference: "", notes: "", priority: "normal", leadType: "group_booking"
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/group-requests", { method: "POST", body: JSON.stringify(form) });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader"><h3>New lead</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid">
          <div className="field"><label>Lead type</label>
            <select className="select" value={form.leadType} onChange={(e) => setForm({ ...form, leadType: e.target.value })}>
              <option value="group_booking">Group Booking</option>
              <option value="full_floor">Full Floor (needs 7+ days notice)</option>
              <option value="general_inquiry">General Inquiry</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field"><label>Priority</label>
            <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="field"><label>Name</label><input className="textInput" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></div>
          <div className="field"><label>Phone</label><input className="textInput" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="field"><label>Party size</label><input className="textInput" type="number" min="1" value={form.partySize} onChange={(e) => setForm({ ...form, partySize: Number(e.target.value) })} /></div>
          <div className="field"><label>Requested date</label><input className="textInput" type="date" required value={form.requestedDate} onChange={(e) => setForm({ ...form, requestedDate: e.target.value })} /></div>
          <div className="field"><label>Requested time</label><input className="textInput" type="time" value={form.requestedTime} onChange={(e) => setForm({ ...form, requestedTime: e.target.value })} /></div>
          {form.leadType === "full_floor" && (
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <span className="cardHint" style={{ background: "var(--amber-soft)", padding: 8, borderRadius: 8, display: "block", color: "#9a6d13" }}>
                Full-floor requests require at least 7 days&rsquo; notice and the entire floor must be empty for the slot -- staff review and approve these manually.
              </span>
            </div>
          )}
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button className="button primary" type="submit" disabled={saving} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>{saving ? "Creating..." : "Create lead"}</button>
        </form>
      </div>
    </div>
  );
}

/* ====================================================================== Menu */

function MenuView({ notify }) {
  const [tab, setTab] = useState("items");
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
        {tab === "items" && <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={15} />Add item</button>}
      </div>

      <div className="tabRow">
        <button className={`tabChip ${tab === "items" ? "active" : ""}`} onClick={() => setTab("items")}>Items</button>
        <button className={`tabChip ${tab === "config" ? "active" : ""}`} onClick={() => setTab("config")}><Layers size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Configurations</button>
        <button className={`tabChip ${tab === "calendar" ? "active" : ""}`} onClick={() => setTab("calendar")}><CalendarDays size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Calendar</button>
      </div>

      {tab === "config" && <MenuConfigurationsPanel items={items} notify={notify} />}
      {tab === "calendar" && <MenuCalendarPanel notify={notify} />}

      {tab === "items" && byCategory.map((cat) => cat.items.length > 0 && (
        <div key={cat.id} style={{ marginBottom: 22 }}>
          <div className="cardTitle" style={{ marginBottom: 10 }}>{cat.name}</div>
          <div className="grid cols-3">
            {cat.items.map((item) => (
              <div key={item.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{item.name}</strong>
                  <span>${(item.price_cents / 100).toFixed(2)}</span>
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

function MenuConfigurationsPanel({ items, notify }) {
  const [configs, setConfigs] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    apiFetch("/api/menu/configurations").then(setConfigs).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <ErrorBlock message={err} />;
  if (!configs) return <LoadingBlock />;

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="cardHint">
          Build a named set of items once (e.g. &ldquo;Monday&rdquo;, &ldquo;Valentine&rsquo;s Special&rdquo;, &ldquo;Thanksgiving Special&rdquo;),
          then assign it to any calendar date in the Calendar tab -- on that date, only this configuration&rsquo;s items are available.
        </p>
      </div>
      <button className="button primary small" style={{ marginBottom: 16 }} onClick={() => setShowAdd(true)}><Plus size={14} />New configuration</button>

      {configs.length === 0 ? (
        <EmptyState title="No configurations yet" hint="Create one to build a reusable named menu you can assign to any date." />
      ) : (
        <div className="grid cols-3">
          {configs.map((cfg) => (
            <div key={cfg.id} className="card">
              <strong>{cfg.name}</strong>
              <p className="cardHint" style={{ margin: "6px 0 10px" }}>{cfg.description}</p>
              <div className="cardHint" style={{ marginBottom: 10 }}>{cfg.item_ids.length} item{cfg.item_ids.length === 1 ? "" : "s"}</div>
              <button className="button secondary small" onClick={() => setEditing(cfg)}>Edit items</button>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddConfigurationModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); notify("Configuration created"); load(); }} />}
      {editing && <EditConfigurationItemsModal config={editing} items={items} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); notify("Configuration updated"); load(); }} />}
    </div>
  );
}

function AddConfigurationModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/menu/configurations", { method: "POST", body: JSON.stringify(form) });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader"><h3>New configuration</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid one">
          <div className="field"><label>Name</label><input className="textInput" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Thanksgiving Special" /></div>
          <div className="field"><label>Description</label><textarea className="textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <button className="button primary" type="submit" disabled={saving} style={{ justifyContent: "center" }}>{saving ? "Creating..." : "Create"}</button>
        </form>
      </div>
    </div>
  );
}

function EditConfigurationItemsModal({ config, items, onClose, onSaved }) {
  const [selected, setSelected] = useState(config.item_ids.map(String));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(id) {
    const key = String(id);
    setSelected((prev) => (prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/menu/configurations/${config.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "set_items", itemIds: selected.map(Number) })
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modalHeader"><h3>{config.name}: select items</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        {error && <div className="loginError">{error}</div>}
        <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {items.map((item) => (
            <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.includes(String(item.id))} onChange={() => toggle(item.id)} />
              <span style={{ fontSize: 13.5, flex: 1 }}>{item.name}</span>
              <span className="cardHint">${(item.price_cents / 100).toFixed(2)}</span>
            </label>
          ))}
        </div>
        <button className="button primary" onClick={submit} disabled={saving} style={{ width: "100%", justifyContent: "center" }}>{saving ? "Saving..." : `Save (${selected.length} selected)`}</button>
      </div>
    </div>
  );
}

const SLOT_LABELS = { morning: "Morning", midday: "Mid-day", evening: "Evening" };
const SLOT_MODE_BADGE = { default: "completed", configuration: "active", custom: "pending", closed: "cancelled" };
const SLOT_MODE_LABEL = { default: "Default", configuration: "Configured", custom: "Custom", closed: "Closed" };

function MenuCalendarPanel({ notify }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [schedule, setSchedule] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [items, setItems] = useState([]);
  const [slots, setSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const todayIso = new Date().toISOString().slice(0, 10);

  const from = `${month}-01`;
  const to = new Date(new Date(`${from}T00:00:00Z`).getUTCFullYear(), new Date(`${from}T00:00:00Z`).getUTCMonth() + 1, 0).toISOString().slice(0, 10);

  const load = useCallback(() => {
    apiFetch(`/api/menu/schedule?from=${from}&to=${to}`).then(setSchedule).catch(() => setSchedule([]));
    apiFetch("/api/menu/configurations").then(setConfigs).catch(() => {});
    apiFetch("/api/menu/items").then(setItems).catch(() => {});
    apiFetch("/api/menu/daily-slots").then(setSlots).catch(() => {});
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  if (!schedule) return <LoadingBlock />;

  const scheduleByDate = new Map(schedule.map((s) => [String(s.schedule_date).slice(0, 10), s]));
  const [year, m] = month.split("-").map(Number);
  const daysInMonth = new Date(year, m, 0).getDate();
  const firstWeekday = new Date(Date.UTC(year, m - 1, 1)).getUTCDay();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button className="button secondary small" onClick={() => setMonth((m) => addMonths(m, -1))}>&larr;</button>
          <strong style={{ fontSize: 13.5 }}>{new Date(`${from}T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
          <button className="button secondary small" onClick={() => setMonth((m) => addMonths(m, 1))}>&rarr;</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>{d}</div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={`blank-${i}`} />;
            const iso = `${month}-${String(day).padStart(2, "0")}`;
            const scheduled = scheduleByDate.get(iso);
            const isPast = iso < todayIso;
            return (
              <button key={iso} onClick={() => setSelectedDate(iso)}
                style={{
                  aspectRatio: "1", borderRadius: 8, border: `1px solid ${scheduled ? "var(--brand)" : "var(--line)"}`,
                  background: scheduled ? "var(--brand-soft)" : "#fff", cursor: "pointer", padding: 2, opacity: isPast ? 0.45 : 1,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 600
                }}>
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="cardHint">Click any date to configure Morning / Mid-day / Evening separately -- each slot can have its own menu or be closed.</div>

      {selectedDate && (
        <DayScheduleModal
          date={selectedDate} slots={slots} configs={configs} items={items} isPast={selectedDate < todayIso}
          onClose={() => setSelectedDate(null)}
          onChanged={() => { load(); notify("Schedule updated"); }}
        />
      )}
    </div>
  );
}

function addMonths(yyyyMm, delta) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function DayScheduleModal({ date, slots, configs, items, isPast, onClose, onChanged }) {
  const [day, setDay] = useState(null);
  const [activeSlot, setActiveSlot] = useState("morning");
  const [draftItemIds, setDraftItemIds] = useState([]);
  const [configId, setConfigId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiFetch(`/api/menu/day-schedule?date=${date}`).then((data) => {
      setDay(data);
      const resolved = data.resolved[activeSlot];
      setDraftItemIds((resolved.items || []).map((i) => i.id));
      setConfigId(data.schedule[activeSlot].configurationId || "");
    }).catch(() => {});
  }, [date, activeSlot]);
  useEffect(() => { load(); }, [load]);

  function toggleItem(id) {
    setDraftItemIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  async function loadFromConfiguration(id) {
    setConfigId(id);
    const config = configs.find((c) => String(c.id) === String(id));
    if (config) setDraftItemIds(config.item_ids.map(Number));
  }

  async function saveConfiguration() {
    if (!configId) return;
    setSaving(true);
    try {
      await apiFetch("/api/menu/day-schedule", { method: "PATCH", body: JSON.stringify({ date, slot: activeSlot, action: "assign_configuration", configurationId: Number(configId) }) });
      onChanged();
      load();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  }

  async function saveCustomItems() {
    setSaving(true);
    try {
      await apiFetch("/api/menu/day-schedule", { method: "PATCH", body: JSON.stringify({ date, slot: activeSlot, action: "set_items", itemIds: draftItemIds, configurationId: configId ? Number(configId) : null }) });
      onChanged();
      load();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  }

  async function toggleClosed(closed) {
    setSaving(true);
    try {
      await apiFetch("/api/menu/day-schedule", { method: "PATCH", body: JSON.stringify({ date, slot: activeSlot, action: "set_closed", closed }) });
      onChanged();
      load();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  }

  const slotTimes = Object.fromEntries(slots.map((s) => [s.slot, `${s.start_time?.slice(0, 5)}-${s.end_time?.slice(0, 5)}`]));
  const slotState = day?.schedule[activeSlot];
  const closed = slotState?.mode === "closed";

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modalHeader">
          <h3>{new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h3>
          <button className="button ghost small" onClick={onClose}><X size={14} /></button>
        </div>

        {isPast ? (
          <div className="cardHint" style={{ background: "var(--line-soft)", padding: 10, borderRadius: 10 }}>This date is in the past and cannot be edited.</div>
        ) : !day ? <LoadingBlock /> : (
          <>
            <div className="tabRow">
              {["morning", "midday", "evening"].map((slot) => (
                <button key={slot} className={`tabChip ${activeSlot === slot ? "active" : ""}`} onClick={() => setActiveSlot(slot)}>
                  {SLOT_LABELS[slot]} <span className="cardHint">({slotTimes[slot]})</span>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span className={`badge ${SLOT_MODE_BADGE[slotState?.mode]}`}>{SLOT_MODE_LABEL[slotState?.mode]}</span>
              <button className={`button small ${closed ? "danger" : "secondary"}`} onClick={() => toggleClosed(!closed)} disabled={saving}>
                {closed ? "Reopen this slot" : "Mark slot closed"}
              </button>
            </div>

            {!closed && (
              <>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>Quick-fill from a configuration</label>
                  <select className="select" value={configId} onChange={(e) => loadFromConfiguration(e.target.value)}>
                    <option value="">Pick items manually...</option>
                    {configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5, marginBottom: 14, border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: 8 }}>
                  {items.map((item) => (
                    <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", fontSize: 13 }}>
                      <input type="checkbox" checked={draftItemIds.includes(item.id)} onChange={() => toggleItem(item.id)} />
                      <span style={{ flex: 1 }}>{item.name}</span>
                      <span className="cardHint">${(item.price_cents / 100).toFixed(2)}</span>
                    </label>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  {configId && <button className="button secondary small" onClick={saveConfiguration} disabled={saving}>Use configuration as-is</button>}
                  <button className="button primary small" onClick={saveCustomItems} disabled={saving}>{saving ? "Saving..." : `Save ${draftItemIds.length} item${draftItemIds.length === 1 ? "" : "s"} for ${SLOT_LABELS[activeSlot]}`}</button>
                </div>
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}

const DIETARY_TAG_OPTIONS = ["vegetarian", "vegan", "gluten_free", "dairy_free", "spicy", "fresh", "seasonal"];
const RECOMMEND_TAG_OPTIONS = ["popular", "chef_pick", "fresh", "seasonal", "comfort_food", "spicy"];
const SLOT_OPTIONS = [["morning", "Morning"], ["midday", "Mid-day"], ["evening", "Evening"]];

function TagPicker({ options, selected, onToggle }) {
  return (
    <div className="pillRow">
      {options.map((tag) => (
        <button type="button" key={tag}
          className={`button small ${selected.includes(tag) ? "primary" : "secondary"}`}
          onClick={() => onToggle(tag)}>
          {tag.replace("_", " ")}
        </button>
      ))}
    </div>
  );
}

function AddMenuItemModal({ categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "", description: "", priceDollars: "", categoryId: categories[0]?.id || "",
    dietaryTags: [], recommendTags: [], mealPeriods: ["midday", "evening"], complimentary: false
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(field, value) {
    setForm((f) => ({ ...f, [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value] }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/menu/items", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          categoryId: form.categoryId ? Number(form.categoryId) : null,
          priceCents: Math.round(Number(form.priceDollars || 0) * 100),
          dietaryTags: form.dietaryTags,
          recommendTags: form.recommendTags,
          mealPeriods: form.mealPeriods,
          complimentary: form.complimentary
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
          <div className="field"><label>Price (USD)</label>
            <input className="textInput" type="number" min="0" step="0.01" placeholder="0.00" required value={form.priceDollars} onChange={(e) => setForm({ ...form, priceDollars: e.target.value })} />
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.complimentary} onChange={(e) => setForm({ ...form, complimentary: e.target.checked })} /> Complimentary item
            </label>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Available during</label>
            <div className="pillRow">
              {SLOT_OPTIONS.map(([k, l]) => (
                <button type="button" key={k} className={`button small ${form.mealPeriods.includes(k) ? "primary" : "secondary"}`} onClick={() => toggle("mealPeriods", k)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Dietary tags</label>
            <TagPicker options={DIETARY_TAG_OPTIONS} selected={form.dietaryTags} onToggle={(t) => toggle("dietaryTags", t)} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Recommendation tags</label>
            <TagPicker options={RECOMMEND_TAG_OPTIONS} selected={form.recommendTags} onToggle={(t) => toggle("recommendTags", t)} />
          </div>
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

/* ====================================================================== Take Away */

const TAKEAWAY_STATUSES = ["pending", "preparing", "prepared_paid", "taken", "no_pickup", "cancelled", "other"];
const TAKEAWAY_STATUS_LABELS = {
  pending: "Pending", preparing: "Preparing", prepared_paid: "Prepared & Paid",
  taken: "Taken", no_pickup: "No Pickup", cancelled: "Cancelled", other: "Other"
};
const TAKEAWAY_NEXT_STATUS = { pending: "preparing", preparing: "prepared_paid", prepared_paid: "taken" };

function TakeAwayView({ notify }) {
  const [orders, setOrders] = useState(null);
  const [status, setStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    const qs = status ? `?status=${status}` : "";
    apiFetch(`/api/takeaway${qs}`).then(setOrders).catch((e) => setErr(e.message));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function advance(order) {
    const next = TAKEAWAY_NEXT_STATUS[order.status];
    if (!next) return;
    try {
      await apiFetch(`/api/takeaway/${order.id}`, { method: "PATCH", body: JSON.stringify({ status: next, paymentStatus: next === "prepared_paid" ? "paid" : undefined }) });
      notify(`Marked ${TAKEAWAY_STATUS_LABELS[next]}`);
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  async function setOther(order, newStatus) {
    try {
      await apiFetch(`/api/takeaway/${order.id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
      notify(`Marked ${TAKEAWAY_STATUS_LABELS[newStatus]}`);
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  if (err) return <ErrorBlock message={err} />;

  return (
    <div>
      <div className="sectionHeader">
        <div><h2>Take away</h2><p>Pickup orders -- combos of menu items, paid at pickup, with a 5% service charge.</p></div>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={15} />New takeaway order</button>
      </div>

      <div className="tabRow">
        <button className={`tabChip ${status === "" ? "active" : ""}`} onClick={() => setStatus("")}>All</button>
        {TAKEAWAY_STATUSES.map((s) => (
          <button key={s} className={`tabChip ${status === s ? "active" : ""}`} onClick={() => setStatus(s)}>{TAKEAWAY_STATUS_LABELS[s]}</button>
        ))}
      </div>

      {!orders ? <LoadingBlock /> : orders.length === 0 ? (
        <EmptyState title="No takeaway orders" hint="Orders created here or by the voice agent will show up as cards you can move through pending → preparing → prepared & paid → taken." />
      ) : (
        <div className="grid cols-3">
          {orders.map((order) => (
            <div key={order.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <strong>{order.order_ref}</strong>
                <span className={`badge ${order.status}`}>{TAKEAWAY_STATUS_LABELS[order.status]}</span>
              </div>
              <div className="cardHint">{order.customer_name} &middot; {order.phone}</div>
              <div className="pillRow" style={{ margin: "10px 0" }}>
                {order.items.map((item, i) => <span key={i} className="pill">{item.quantity}&times; {item.name}</span>)}
              </div>
              <div style={{ fontSize: 13.5, display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span className="cardHint">Total (incl. {order.service_charge_pct}% service)</span>
                <strong>${(order.total_cents / 100).toFixed(2)}</strong>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {TAKEAWAY_NEXT_STATUS[order.status] && (
                  <button className="button primary small" onClick={() => advance(order)}>
                    Mark {TAKEAWAY_STATUS_LABELS[TAKEAWAY_NEXT_STATUS[order.status]]}
                  </button>
                )}
                {!["taken", "cancelled", "no_pickup"].includes(order.status) && (
                  <>
                    <button className="button ghost small" onClick={() => setOther(order, "no_pickup")}>No pickup</button>
                    <button className="button danger small" onClick={() => setOther(order, "cancelled")}>Cancel</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <NewTakeawayModal onClose={() => setShowAdd(false)} onSaved={(order) => { setShowAdd(false); notify(`Takeaway ${order.order_ref} created -- $${(order.total_cents / 100).toFixed(2)} total`); load(); }} />}
    </div>
  );
}

function NewTakeawayModal({ onClose, onSaved }) {
  const [items, setItems] = useState([]);
  const [lines, setLines] = useState([]);
  const [form, setForm] = useState({ customerName: "", phone: "", requestedSlot: "midday", notes: "" });
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { apiFetch("/api/menu/items").then(setItems).catch(() => {}); }, []);

  function addLine(itemId) {
    setLines((prev) => {
      const existing = prev.find((l) => l.menuItemId === itemId);
      if (existing) return prev.map((l) => (l.menuItemId === itemId ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { menuItemId: itemId, quantity: 1 }];
    });
    setQuote(null);
  }
  function removeLine(itemId) {
    setLines((prev) => prev.filter((l) => l.menuItemId !== itemId));
    setQuote(null);
  }

  async function getQuote() {
    setQuoting(true);
    setError("");
    try {
      const result = await apiFetch("/api/takeaway", { method: "POST", body: JSON.stringify({ quoteOnly: true, lines }) });
      setQuote(result);
    } catch (e) { setError(e.message); } finally { setQuoting(false); }
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await apiFetch("/api/takeaway", { method: "POST", body: JSON.stringify({ ...form, lines }) });
      onSaved(result.order);
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  const available = items.filter((i) => i.available && !i.sold_out);

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modalHeader"><h3>New takeaway order</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        {error && <div className="loginError">{error}</div>}

        <div className="field" style={{ marginBottom: 14 }}>
          <label>Add items</label>
          <select className="select" value="" onChange={(e) => e.target.value && addLine(Number(e.target.value))}>
            <option value="">Select a menu item...</option>
            {available.map((i) => <option key={i.id} value={i.id}>{i.name} -- ${(i.price_cents / 100).toFixed(2)}</option>)}
          </select>
        </div>

        {lines.length > 0 && (
          <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            {lines.map((line) => {
              const item = items.find((i) => i.id === line.menuItemId);
              return (
                <div key={line.menuItemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5 }}>
                  <span>{line.quantity}&times; {item?.name}</span>
                  <button type="button" className="button ghost small" onClick={() => removeLine(line.menuItemId)}><X size={13} /></button>
                </div>
              );
            })}
            <button type="button" className="button secondary small" onClick={getQuote} disabled={quoting} style={{ marginTop: 4 }}>
              {quoting ? "Pricing..." : "Get quote"}
            </button>
            {quote && (
              <div className="cardHint" style={{ background: "var(--line-soft)", padding: 10, borderRadius: 10 }}>
                Subtotal ${(quote.subtotalCents / 100).toFixed(2)} + {quote.serviceChargePct}% service = <strong>${(quote.totalCents / 100).toFixed(2)} total</strong>
              </div>
            )}
          </div>
        )}

        <form onSubmit={submit} className="formGrid">
          <div className="field"><label>Customer name</label><input className="textInput" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></div>
          <div className="field"><label>Phone</label><input className="textInput" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Pickup slot</label>
            <div className="pillRow">
              {SLOT_OPTIONS.map(([k, l]) => (
                <button type="button" key={k} className={`button small ${form.requestedSlot === k ? "primary" : "secondary"}`} onClick={() => setForm({ ...form, requestedSlot: k })}>{l}</button>
              ))}
            </div>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button className="button primary" type="submit" disabled={saving || lines.length === 0} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>
            {saving ? "Creating..." : "Create takeaway order (pay at pickup)"}
          </button>
        </form>
      </div>
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
                  <td>{titleCase(c.channel)}</td>
                  <td><span className={`badge ${c.status}`}>{titleCase(c.status)}</span></td>
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
                <span className={`badge ${f.status}`}>{titleCase(f.status)}</span>
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

function addDays(isoDate, delta) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function ReportsView({ date }) {
  const [tab, setTab] = useState("charts");
  const [from, setFrom] = useState(addDays(date, -13));
  const [to, setTo] = useState(date);
  const [trend, setTrend] = useState(null);
  const [dayData, setDayData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch(`/api/reports/trend?from=${from}&to=${to}`).then(setTrend).catch((e) => setErr(e.message));
  }, [from, to]);
  useEffect(() => { apiFetch(`/api/overview?date=${date}`).then(setDayData).catch(() => {}); }, [date]);

  const presets = [
    ["Last 7 days", 6], ["Last 14 days", 13], ["Last 30 days", 29]
  ];

  return (
    <div>
      <div className="sectionHeader"><div><h2>Reports</h2><p>Reservation and call trends over a date range, plus today&rsquo;s status mix.</p></div></div>

      <div className="tabRow">
        <button className={`tabChip ${tab === "charts" ? "active" : ""}`} onClick={() => setTab("charts")}>Charts</button>
        <button className={`tabChip ${tab === "table" ? "active" : ""}`} onClick={() => setTab("table")}>Status table</button>
      </div>

      {tab === "charts" && (
        <>
          <div className="card" style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {presets.map(([label, days]) => (
              <button key={label} className="button secondary small" onClick={() => { setFrom(addDays(to, -days)); }}>{label}</button>
            ))}
            <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <input className="dateInput" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <span className="cardHint">to</span>
              <input className="dateInput" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </span>
          </div>

          {err && <ErrorBlock message={err} />}
          {!trend ? <LoadingBlock /> : <ReportCharts trend={trend} />}
        </>
      )}

      {tab === "table" && (
        !dayData ? <LoadingBlock /> : (
          <>
            <div className="tableWrap">
              <table className="table">
                <thead><tr><th>Status</th><th>Count</th><th>Guests</th></tr></thead>
                <tbody>
                  {Object.entries(dayData.reservations).map(([status, v]) => (
                    <tr key={status}><td><span className={`badge ${status}`}>{titleCase(status)}</span></td><td>{v.count}</td><td>{v.guests}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card" style={{ marginTop: 20 }}>
              <div className="cardTitle">Seat occupancy right now</div>
              <div className="statValue">{dayData.seats.occupied_now} / {dayData.seats.total_seats}</div>
              <div className="cardHint">seats currently occupied</div>
            </div>
          </>
        )
      )}
    </div>
  );
}

function ReportChartsInner({ trend }) {
  const totalGuests = trend.reduce((sum, d) => sum + d.guests, 0);
  const totalConfirmed = trend.reduce((sum, d) => sum + d.confirmed, 0);
  const totalCalls = trend.reduce((sum, d) => sum + d.calls, 0);
  const totalCancelled = trend.reduce((sum, d) => sum + d.cancelled, 0);

  const fmtDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div>
      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <StatCard label="Confirmed bookings" value={totalConfirmed} foot="in range" />
        <StatCard label="Guests" value={totalGuests} foot="in range" />
        <StatCard label="Calls" value={totalCalls} foot="in range" />
        <StatCard label="Cancellations" value={totalCancelled} foot="in range" />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="cardTitle" style={{ marginBottom: 14 }}>Confirmed reservations &amp; guests</div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={trend} margin={{ left: -16, right: 8 }}>
            <defs>
              <linearGradient id="ppBrand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d97b4a" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#d97b4a" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="ppAmber" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e3a23a" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#e3a23a" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ecdfd0" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: "#847a6f" }} axisLine={{ stroke: "#ecdfd0" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#847a6f" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip labelFormatter={fmtDate} contentStyle={{ borderRadius: 10, border: "1px solid #ecdfd0", fontSize: 12.5 }} />
            <Legend wrapperStyle={{ fontSize: 12.5 }} />
            <Area type="monotone" dataKey="confirmed" name="Confirmed bookings" stroke="#d97b4a" fill="url(#ppBrand)" strokeWidth={2} />
            <Area type="monotone" dataKey="guests" name="Guests" stroke="#e3a23a" fill="url(#ppAmber)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="cardTitle" style={{ marginBottom: 14 }}>Calls &amp; cancellations</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={trend} margin={{ left: -16, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ecdfd0" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: "#847a6f" }} axisLine={{ stroke: "#ecdfd0" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#847a6f" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip labelFormatter={fmtDate} contentStyle={{ borderRadius: 10, border: "1px solid #ecdfd0", fontSize: 12.5 }} />
            <Legend wrapperStyle={{ fontSize: 12.5 }} />
            <Bar dataKey="calls" name="Calls" fill="#3f8fd6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="cancelled" name="Cancelled" fill="#e2574c" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ReportCharts({ trend }) {
  if (trend.length === 0) return <EmptyState title="No data in this range" hint="Pick a different date range." />;
  return <ReportChartsInner trend={trend} />;
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

function LoadingBlock() {
  return (
    <div className="emptyState" style={{ padding: "60px 20px" }}>
      <div className="spinner" />
      <p style={{ marginTop: 14 }}>Loading...</p>
    </div>
  );
}
function ErrorBlock({ message }) { return <div className="emptyState"><h3>Something went wrong</h3><p>{message}</p></div>; }
function EmptyState({ title, hint }) { return <div className="emptyState"><Sparkles size={22} style={{ marginBottom: 10, opacity: 0.5 }} /><h3>{title}</h3><p>{hint}</p></div>; }
