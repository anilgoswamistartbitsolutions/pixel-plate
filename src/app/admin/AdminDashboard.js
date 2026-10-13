"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid, Grid3x3, CalendarClock, Users2, UtensilsCrossed, Building2,
  Mic, PhoneCall, BarChart3, Settings, LogOut, Plus, X, Check, Ban,
  MapPin, Clock, ShieldCheck, Sparkles, ShoppingBag, Layers, CalendarDays, ChevronRight
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
            {["overview", "reports"].includes(view) && (
              <input className="dateInput" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </div>
        </header>
        <main className="contentArea">
          {view === "overview" && <OverviewView date={date} onNavigate={setView} />}
          {view === "floorplan" && <FloorPlanView notify={notify} staff={staff} />}
          {view === "reservations" && <ReservationsView notify={notify} />}
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
  // Re-fetch every time a floor is opened -- the list that was loaded when this page first
  // mounted can be stale by the time staff actually click into a floor (another session's
  // edits, a reservation made in the meantime, etc.), so entering a floor always pulls fresh
  // data rather than trusting whatever is already sitting in memory.
  useEffect(() => { if (openFloorId) load(); }, [openFloorId, load]);

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
        <div className="grid cols-2">
          {floors.map((floor) => {
            const floorTables = tables.filter((t) => t.floor_id === floor.id);
            const activeTables = floorTables.filter((t) => t.active);
            const inactiveTables = floorTables.filter((t) => !t.active);
            const capacity = activeTables.reduce((sum, t) => sum + t.capacity, 0);
            return (
              <div key={floor.id} className="card" style={{ cursor: "pointer", padding: 20 }} onClick={() => setOpenFloorId(floor.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--brand-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Layers size={19} style={{ color: "var(--brand-dark)" }} />
                    </div>
                    <strong style={{ fontSize: 16.5 }}>{floor.name}</strong>
                  </div>
                  {isSuperAdmin && (
                    <button className="button ghost small" onClick={(e) => { e.stopPropagation(); deleteFloor(floor); }} title="Delete floor">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {floor.description && <p className="cardHint" style={{ marginTop: 12, lineHeight: 1.55, fontSize: 13 }}>{floor.description}</p>}

                <div className="pillRow" style={{ marginTop: 14 }}>
                  <span className="pill">{activeTables.length} table{activeTables.length === 1 ? "" : "s"}</span>
                  <span className="pill">{capacity} seat{capacity === 1 ? "" : "s"}</span>
                  {inactiveTables.length > 0 && <span className="pill">{inactiveTables.length} deactivated</span>}
                </div>

                <button className="button secondary small" style={{ marginTop: 16 }} onClick={() => setOpenFloorId(floor.id)}>Open floor &rarr;</button>
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
  const [editMode, setEditMode] = useState(false);
  const [localTables, setLocalTables] = useState(tables);

  useEffect(() => {
    setLocalTables(tables);
    // The side panel (TableDetail) was holding onto the table object from before the edit --
    // re-point it at the fresh copy by id so an edit/toggle is reflected immediately instead
    // of only updating the canvas while the panel still shows stale data.
    setSelected((prev) => (prev ? tables.find((t) => t.id === prev.id) || null : null));
  }, [tables]);

  const inactiveCount = localTables.filter((t) => !t.active).length;
  const visibleTables = localTables.filter((t) => t.active);

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

  async function handleDrag(tableId, posX, posY, commit) {
    setLocalTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, pos_x: posX, pos_y: posY } : t)));
    // Only persist once, when the mouse is released -- every intermediate move only updates
    // the on-screen position so dragging doesn't fire a request per pixel.
    if (commit) {
      apiFetch(`/api/tables/${tableId}`, { method: "PATCH", body: JSON.stringify({ action: "move", posX, posY }) }).catch(() => {});
    }
  }

  return (
    <div>
      <button className="button ghost small" style={{ marginBottom: 14 }} onClick={onBack}>&larr; All floors</button>
      <div className="sectionHeader">
        <div>
          <h2>{floor?.name}</h2>
          <p>{editMode ? "Edit mode: drag tables to arrange the room -- position saves automatically." : "Click a table to see seats and reservations. Turn on Edit mode to move or add tables."}</p>
          {floor?.description && <p className="cardHint" style={{ marginTop: 6, maxWidth: 560, lineHeight: 1.5 }}>{floor.description}</p>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`button ${editMode ? "primary" : "secondary"}`} onClick={() => setEditMode((v) => !v)}>
            {editMode ? "Done editing" : "Edit mode"}
          </button>
          {editMode && <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={15} />Add table</button>}
        </div>
      </div>

      <div className="legendRow">
        <span><span className="legendDot" style={{ background: "#fff", border: "2px solid var(--line)" }} />Available</span>
        <span><span className="legendDot" style={{ background: "#fbeedb", border: "2px solid var(--amber)" }} />Reserved upcoming</span>
        <span><span className="legendDot" style={{ background: "var(--danger-soft)", border: "2px solid var(--danger)" }} />Occupied now</span>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="floorCanvasWrap" style={{ flex: "1 1 560px", minWidth: 320 }}>
          <div className="floorCanvas">
            {visibleTables.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <EmptyState title="No tables on this floor yet" hint="Turn on Edit mode and click Add table to place your first one here." />
              </div>
            )}
            {visibleTables.map((table) => (
              <DraggableTable key={table.id} table={table} selected={selected?.id === table.id} onSelect={() => setSelected(table)} onDrag={handleDrag} draggable={editMode} />
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

      {inactiveCount > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="cardTitle" style={{ marginBottom: 4 }}>Deactivated tables</div>
          <p className="cardHint" style={{ marginBottom: 12 }}>Kept off the floor plan but never deleted, so past reservations stay intact. Reactivate to bring one back.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {localTables.filter((t) => !t.active).map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--line-soft)" }}>
                <div>
                  <strong style={{ fontSize: 13.5 }}>{t.code} -- {t.display_name}</strong>
                  <div className="cardHint">{t.capacity} seats &middot; {titleCase(t.table_type)}</div>
                </div>
                <button className="button secondary small" onClick={() => toggleActive(t)}>Reactivate</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && <AddTableModal floors={[floor]} defaultFloorId={floor?.id} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); notify("Table created"); onReload(); }} />}
      {editing && <EditTableModal table={editing} floors={[floor]} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); notify("Table updated"); onReload(); }} />}
    </div>
  );
}

function DraggableTable({ table, selected, onSelect, onDrag, draggable }) {
  const [dragging, setDragging] = useState(false);

  function onMouseDown(e) {
    if (!table.active || !draggable) { onSelect(); return; }
    e.preventDefault();
    setDragging(false);
    // Anchor to the position/cursor at drag start and always compute the new absolute
    // position from that anchor -- the previous version recomputed from the component's
    // original (never-updated) `table` prop plus only the latest incremental delta each
    // move event, so the table barely twitched near its start point instead of following
    // the cursor.
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = Number(table.pos_x);
    const startPosY = Number(table.pos_y);
    let moved = false;
    let lastPos = { x: startPosX, y: startPosY };
    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      if (moved) {
        setDragging(true);
        lastPos = { x: Math.max(0, startPosX + dx), y: Math.max(0, startPosY + dy) };
        onDrag(table.id, lastPos.x, lastPos.y, false); // visual-only while dragging
      }
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!moved) onSelect();
      else onDrag(table.id, lastPos.x, lastPos.y, true); // persist once, on release
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
      style={{ left: `${table.pos_x}px`, top: `${table.pos_y}px`, width: `${table.width}px`, height: `${table.height}px`, cursor: draggable && table.active ? "grab" : "pointer" }}
      onMouseDown={onMouseDown}
    >
      {renderChairs(table)}
      <span className="code">{table.code}</span>
      <span className="cap">{table.capacity} seats</span>
    </div>
  );
}

const CHAIR_WIDTH = 8;
const CHAIR_HEIGHT = 16;

/** One chair per seat, ringed evenly around the table's actual footprint and rotated to face
 * the table -- a rectangle (seat + back, viewed from above), not a plain dot -- so a 6-top
 * visibly has six chairs around it, not just a capacity number in the corner. */
function renderChairs(table) {
  const width = Number(table.width);
  const height = Number(table.height);
  const rx = width / 2 + 12;
  const ry = height / 2 + 12;
  return Array.from({ length: table.capacity }, (_, i) => {
    const angle = (i / table.capacity) * Math.PI * 2 - Math.PI / 2;
    const x = width / 2 + rx * Math.cos(angle);
    const y = height / 2 + ry * Math.sin(angle);
    const rotateDeg = (angle * 180) / Math.PI + 90;
    return (
      <span
        key={i} className="chairRect"
        style={{ left: `${x - CHAIR_WIDTH / 2}px`, top: `${y - CHAIR_HEIGHT / 2}px`, transform: `rotate(${rotateDeg}deg)` }}
      />
    );
  });
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
const TABLE_SHAPE_OPTIONS = [["rect", "Rectangle"], ["round", "Circular"], ["oval_h", "Oval (horizontal)"], ["oval_v", "Oval (vertical)"]];

function AddTableModal({ floors, defaultFloorId, onClose, onSaved }) {
  const [form, setForm] = useState({ code: "", displayName: "", capacity: 4, tableType: "standard", sizeLabel: "medium", shape: "rect", floorId: defaultFloorId || floors?.[0]?.id || "", shareable: false });
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
        <div className="modalBody">
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
          <div className="field"><label>Shape</label>
            <select className="select" value={form.shape} onChange={(e) => setForm({ ...form, shape: e.target.value })}>
              {TABLE_SHAPE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
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
        <div className="modalBody">
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid one">
          <div className="field"><label>Floor name</label><input className="textInput" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ocean View Patio" /></div>
          <button className="button primary" type="submit" disabled={saving} style={{ justifyContent: "center" }}>{saving ? "Creating..." : "Create floor"}</button>
        </form>
        </div>
      </div>
    </div>
  );
}

function EditTableModal({ table, floors, onClose, onSaved }) {
  const [form, setForm] = useState({
    displayName: table.display_name, capacity: table.capacity, tableType: table.table_type,
    sizeLabel: table.size_label || "medium", shape: table.shape || "rect", floorId: table.floor_id || "",
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
        <div className="modalBody">
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
          <div className="field"><label>Shape</label>
            <select className="select" value={form.shape} onChange={(e) => setForm({ ...form, shape: e.target.value })}>
              {TABLE_SHAPE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
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
    </div>
  );
}

/* ====================================================================== Reservations */

function todayIso() { return new Date().toISOString().slice(0, 10); }

/** "3 from Table A, 4 from Table B (full)" -- groups a reservation's seat allocations by
 * table so the connection between a booking and exactly which tables/how many seats on each
 * is readable at a glance, instead of a flat list of seat codes. */
function SeatBreakdown({ seats }) {
  if (!seats?.length) return null;
  const byTable = new Map();
  for (const s of seats) {
    const entry = byTable.get(s.table_id) || { name: s.table_name, capacity: s.table_capacity, codes: [] };
    entry.codes.push(s.code);
    byTable.set(s.table_id, entry);
  }
  return (
    <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
      {Array.from(byTable.values()).map((t, i) => (
        <div key={i} className="cardHint" style={{ fontSize: 11.5 }}>
          {t.codes.length} from {t.name}{t.codes.length === t.capacity ? " (full table)" : ""} &middot; {t.codes.join(", ")}
        </div>
      ))}
    </div>
  );
}

function ReservationsView({ notify }) {
  const [status, setStatus] = useState("");
  const [list, setList] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [err, setErr] = useState("");
  const [rangeMode, setRangeMode] = useState(false);
  const [date, setDate] = useState(todayIso);
  const [rangeFrom, setRangeFrom] = useState(todayIso);
  const [rangeTo, setRangeTo] = useState(todayIso);
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
        {rangeMode ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input className="dateInput" type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
            <span className="cardHint">to</span>
            <input className="dateInput" type="date" value={rangeTo} min={rangeFrom} onChange={(e) => setRangeTo(e.target.value)} />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input className="dateInput" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {date !== todayIso() && <button className="button ghost small" onClick={() => setDate(todayIso())}>Today</button>}
          </div>
        )}
        <button className="button ghost small" onClick={() => {
          setRangeMode(true);
          setRangeFrom(todayIso());
          const d = new Date(`${todayIso()}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 6);
          setRangeTo(d.toISOString().slice(0, 10));
        }}>
          Next 7 days
        </button>
      </div>

      <div className="tabRow">
        {["", "confirmed", "pending", "seated", "completed", "cancelled", "no_show"].map((s) => (
          <button key={s} className={`tabChip ${status === s ? "active" : ""}`} onClick={() => setStatus(s)}>{s ? titleCase(s) : "All"}</button>
        ))}
      </div>

      {!list ? <LoadingBlock /> : list.length === 0 ? (
        <EmptyState title="No reservations" hint={rangeMode
          ? "New bookings from the dashboard or the voice agent will show up here."
          : `Nothing for ${date}. A caller can book any future date -- try "Next 7 days" above if you're expecting a booking you don't see here.`} />
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
                    <SeatBreakdown seats={r.seats} />
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

      {showAdd && <AddReservationModal defaultDate={date} onClose={() => setShowAdd(false)} onSaved={(outcome) => {
        setShowAdd(false);
        if (outcome.status === "confirmed") {
          notify(`Confirmed: ${outcome.reservation.booking_ref}`);
          // A booking can land on any date -- jump the view to it instead of leaving staff
          // staring at an empty list for whatever date happened to be open before.
          const bookedDate = String(outcome.reservation.reservation_date).slice(0, 10);
          if (!rangeMode && bookedDate !== date) setDate(bookedDate);
          else load();
        } else {
          notify("Sent for staff review -- find it under Leads, not Reservations.");
          load();
        }
      }} />}
      {editing && <EditReservationModal reservation={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); notify("Reservation updated"); load(); }} />}
    </div>
  );
}

const SLOT_ICONS = { morning: "\u{1F305}", midday: "\u{2600}\u{FE0F}", evening: "\u{1F319}" };

/** HH:MM options at a fixed interval within [start, end), inclusive of start -- used to build
 * the time dropdown instead of a free native time picker, so staff can only pick a time that
 * actually falls within the restaurant's configured slot window. */
function timeOptionsInRange(start, end, intervalMinutes = 30) {
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const startMin = toMin(start);
  const endMin = toMin(end);
  const options = [];
  for (let m = startMin; m < endMin; m += intervalMinutes) {
    options.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return options;
}

function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function Stepper({ value, min = 0, max, onChange, disabled }) {
  return (
    <div className="stepper">
      <button type="button" className="stepperBtn" disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))}>&minus;</button>
      <span className="stepperValue">{value}</span>
      <button type="button" className="stepperBtn" disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

function EditReservationModal({ reservation, onClose, onSaved }) {
  const [form, setForm] = useState({
    reservationDate: String(reservation.reservation_date).slice(0, 10),
    startTime: reservation.start_time?.slice(0, 5) || "19:00",
    partySize: reservation.party_size
  });
  const [slots, setSlots] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { apiFetch("/api/menu/daily-slots").then(setSlots).catch(() => {}); }, []);
  const allTimes = slots ? slots.flatMap((s) => timeOptionsInRange(s.start_time.slice(0, 5), s.end_time.slice(0, 5)).map((t) => ({ t, slot: s.slot }))) : [];

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
        <div className="modalBody">
        {error && <div className="loginError">{error}</div>}
        <div className="cardHint" style={{ marginBottom: 14 }}>{reservation.customer_name} &middot; {reservation.phone}</div>
        <form onSubmit={submit} className="formGrid">
          <div className="field"><label>Date</label><input className="textInput" type="date" required value={form.reservationDate} onChange={(e) => setForm({ ...form, reservationDate: e.target.value })} /></div>
          <div className="field"><label>Time</label>
            <select className="select" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}>
              {!allTimes.some((o) => o.t === form.startTime) && <option value={form.startTime}>{formatTime12h(form.startTime)} (current)</option>}
              {allTimes.map((o) => <option key={o.t} value={o.t}>{formatTime12h(o.t)} &middot; {titleCase(o.slot)}</option>)}
            </select>
          </div>
          <div className="field"><label>Party size</label><input className="textInput" type="number" min="1" required value={form.partySize} onChange={(e) => setForm({ ...form, partySize: Number(e.target.value) })} /></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="cardHint">If the new time/size isn&rsquo;t available, the original booking stays unchanged.</span>
          </div>
          <button className="button primary" type="submit" disabled={saving} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>{saving ? "Checking availability..." : "Save changes"}</button>
        </form>
        </div>
      </div>
    </div>
  );
}

function AddReservationModal({ defaultDate, onClose, onSaved }) {
  const [form, setForm] = useState({ customerName: "", phone: "", partySize: 2, reservationDate: defaultDate, startTime: "", seatingPreference: "together", notes: "" });
  const [activeSlot, setActiveSlot] = useState("evening");
  const [slots, setSlots] = useState(null);
  // tableCounts: { [tableId]: guestsAtThatTable } -- explicit per-table split ("3 on table A,
  // 3 on table B"), not just which tables to use.
  const [tableCounts, setTableCounts] = useState({});
  const [options, setOptions] = useState(null);
  const [optionFilter, setOptionFilter] = useState("all"); // "all" | "fits"
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/menu/daily-slots").then((rows) => {
      setSlots(rows);
      const evening = rows.find((s) => s.slot === "evening");
      if (evening) {
        setActiveSlot("evening");
        setForm((f) => ({ ...f, startTime: timeOptionsInRange(evening.start_time.slice(0, 5), evening.end_time.slice(0, 5))[0] || "" }));
      }
    }).catch(() => {});
  }, []);

  const slotTimes = slots ? Object.fromEntries(slots.map((s) => [s.slot, timeOptionsInRange(s.start_time.slice(0, 5), s.end_time.slice(0, 5))])) : {};
  const currentSlotTimes = slotTimes[activeSlot] || [];

  function pickSlot(slotKey) {
    setActiveSlot(slotKey);
    const times = slotTimes[slotKey] || [];
    setForm((f) => ({ ...f, startTime: times[0] || "" }));
    setOptions(null);
  }

  const assignedTotal = Object.values(tableCounts).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const anyAssigned = Object.values(tableCounts).some((n) => Number(n) > 0);
  const splitValid = !anyAssigned || assignedTotal === form.partySize;

  // Available tables bucketed by floor, so staff scan "Ocean View" / "Rooftop" rather than one
  // long flat list across every room. Floor order follows the backend's sort (floor sort_order).
  const groupedOptions = (() => {
    if (!options) return [];
    const filtered = optionFilter === "fits" ? options.filter((o) => o.fitsWholeParty) : options;
    const groups = new Map();
    for (const option of filtered) {
      const key = option.floorName || "Unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(option);
    }
    return Array.from(groups.entries());
  })();

  function toggleTable(optionId, maxFree) {
    setTableCounts((prev) => {
      const current = prev[optionId] || 0;
      if (current > 0) return { ...prev, [optionId]: 0 };
      const otherTotal = Object.entries(prev).reduce((sum, [id, n]) => (id === String(optionId) ? sum : sum + (Number(n) || 0)), 0);
      const remaining = Math.max(0, form.partySize - otherTotal);
      return { ...prev, [optionId]: Math.max(1, Math.min(maxFree, remaining || 1)) };
    });
  }

  function setTableCount(optionId, maxFree, nextValue) {
    const otherTotal = Object.entries(tableCounts).reduce((sum, [id, n]) => (id === String(optionId) ? sum : sum + (Number(n) || 0)), 0);
    const remaining = Math.max(0, form.partySize - otherTotal);
    const clamped = Math.max(0, Math.min(nextValue, maxFree, remaining));
    setTableCounts((prev) => ({ ...prev, [optionId]: clamped }));
  }

  async function checkAvailability() {
    setChecking(true);
    setError("");
    setOptions(null);
    setTableCounts({});
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
    if (!splitValid) {
      setError(`Table split must add up to exactly ${form.partySize} guests (currently ${assignedTotal}).`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const tableSeatCounts = anyAssigned
        ? Object.fromEntries(Object.entries(tableCounts).filter(([, n]) => Number(n) > 0))
        : null;
      const outcome = await apiFetch("/api/reservations", { method: "POST", body: JSON.stringify({ ...form, tableSeatCounts }) });
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
        <div className="modalBody">
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid">
          <div className="field"><label>Guest name</label><input className="textInput" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></div>
          <div className="field"><label>Phone</label><input className="textInput" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="field"><label>Party size</label><input className="textInput" type="number" min="1" required value={form.partySize} onChange={(e) => { setForm({ ...form, partySize: Number(e.target.value) }); setOptions(null); }} /></div>
          <div className="field"><label>Date</label><input className="textInput" type="date" required value={form.reservationDate} onChange={(e) => { setForm({ ...form, reservationDate: e.target.value }); setOptions(null); }} /></div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Time of day</label>
            {!slots ? <span className="cardHint">Loading serving hours...</span> : (
              <div className="pillRow">
                {slots.map((s) => (
                  <button type="button" key={s.slot}
                    className={`button small ${activeSlot === s.slot ? "primary" : "secondary"}`}
                    onClick={() => pickSlot(s.slot)}>
                    {SLOT_ICONS[s.slot]} {titleCase(s.slot)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="field"><label>Time</label>
            <select className="select" required value={form.startTime} onChange={(e) => { setForm({ ...form, startTime: e.target.value }); setOptions(null); }}>
              {currentSlotTimes.length === 0 && <option value="">No times in this slot</option>}
              {currentSlotTimes.map((t) => <option key={t} value={t}>{formatTime12h(t)}</option>)}
            </select>
          </div>
          <div className="field"><label>Seating preference</label>
            <select className="select" value={form.seatingPreference} onChange={(e) => setForm({ ...form, seatingPreference: e.target.value })}>
              <option value="together">Everyone together</option>
              <option value="split_ok">Nearby tables okay</option>
              <option value="shared_ok">Shared table okay</option>
            </select>
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="checkAvailabilityBtn" onClick={checkAvailability} disabled={checking}>
              <CalendarClock size={16} />
              {checking ? "Checking availability..." : "Check table availability"}
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
                    {options.length} table{options.length === 1 ? "" : "s"} free, grouped by floor -- check a table to seat guests there,
                    then set how many with the +/- (e.g. 3 on one table, 4 on another). Leave none checked to let us pick the best fit.
                  </label>

                  <div className="pillRow" style={{ margin: "8px 0 10px" }}>
                    <button type="button" className={`button small ${optionFilter === "all" ? "primary" : "secondary"}`} onClick={() => setOptionFilter("all")}>
                      All free tables
                    </button>
                    <button type="button" className={`button small ${optionFilter === "fits" ? "primary" : "secondary"}`} onClick={() => setOptionFilter("fits")}>
                      Fits all {form.partySize} alone ({options.filter((o) => o.fitsWholeParty).length})
                    </button>
                  </div>

                  {groupedOptions.length === 0 ? (
                    <div className="cardHint" style={{ background: "var(--amber-soft)", padding: 10, borderRadius: 10, color: "#9a6d13" }}>
                      No single table seats {form.partySize} on its own -- switch to &ldquo;All free tables&rdquo; to split the party across two or more.
                    </div>
                  ) : groupedOptions.map(([floorName, floorOptions]) => {
                    const floorFree = floorOptions.reduce((sum, o) => sum + o.freeSeatCount, 0);
                    return (
                      <div key={floorName} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <strong style={{ fontSize: 12.5 }}><Layers size={12} style={{ verticalAlign: "-1px", marginRight: 5 }} />{floorName}</strong>
                          <span className="cardHint">{floorOptions.length} table{floorOptions.length === 1 ? "" : "s"} &middot; {floorFree} seats free</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {floorOptions.map((o) => {
                            const count = tableCounts[o.id] || 0;
                            const checked = count > 0;
                            const maxForThis = Math.min(o.freeSeatCount, form.partySize);
                            return (
                              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: `1px solid ${checked ? "var(--brand)" : "var(--line)"}`, borderRadius: "var(--radius-sm)", background: checked ? "var(--brand-soft)" : "#fff" }}>
                                <input type="checkbox" checked={checked} onChange={() => toggleTable(o.id, o.freeSeatCount)} />
                                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => toggleTable(o.id, o.freeSeatCount)}>
                                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{o.displayName}</span>
                                  {o.fitsWholeParty && <span className="badge active" style={{ marginLeft: 6 }}>Fits all {form.partySize}</span>}
                                  <div className="cardHint">{o.capacity} seats &middot; {o.freeSeatCount} free{o.fullTable ? " · full table" : ""}</div>
                                </div>
                                <Stepper value={count} min={0} max={maxForThis} disabled={!checked} onChange={(next) => setTableCount(o.id, o.freeSeatCount, next)} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  <div className="cardHint" style={{ marginTop: 8, color: anyAssigned && !splitValid ? "var(--danger)" : undefined }}>
                    {assignedTotal} of {form.partySize} guests assigned{anyAssigned && !splitValid ? " -- must match exactly before booking" : ""}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button className="button primary" type="submit" disabled={saving || !splitValid} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>{saving ? "Booking..." : "Check & book"}</button>
        </form>
        </div>
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
        <div className="modalBody">
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
    </div>
  );
}

/* ====================================================================== Menu */

function MenuView({ notify }) {
  const [tab, setTab] = useState("today");

  return (
    <div>
      <div className="sectionHeader">
        <div><h2>Menu &amp; daily specials</h2><p>What the voice agent is allowed to recommend -- nothing it isn't configured here.</p></div>
      </div>

      <div className="stepStrip">
        <div className="stepStripItem"><span className="stepStripNum">1</span>Create every item once in <strong>All Items</strong></div>
        <ChevronRight size={14} className="stepStripArrow" />
        <div className="stepStripItem"><span className="stepStripNum">2</span>Group items into a <strong>Master</strong> (e.g. &ldquo;Weekday Lunch&rdquo;)</div>
        <ChevronRight size={14} className="stepStripArrow" />
        <div className="stepStripItem"><span className="stepStripNum">3</span>On <strong>Today</strong> or the <strong>Calendar</strong>, load a master in one click -- or add items one by one</div>
      </div>

      <div className="tabRow">
        <button className={`tabChip ${tab === "today" ? "active" : ""}`} onClick={() => setTab("today")}><Clock size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Today&rsquo;s Items</button>
        <button className={`tabChip ${tab === "config" ? "active" : ""}`} onClick={() => setTab("config")}><Layers size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Masters</button>
        <button className={`tabChip ${tab === "calendar" ? "active" : ""}`} onClick={() => setTab("calendar")}><CalendarDays size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Calendar</button>
        <button className={`tabChip ${tab === "allItems" ? "active" : ""}`} onClick={() => setTab("allItems")}><UtensilsCrossed size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />All Items</button>
      </div>

      {tab === "today" && <TodaysItemsPanel />}
      {tab === "config" && <MenuConfigurationsPanelWrapper notify={notify} />}
      {tab === "calendar" && <MenuCalendarPanel notify={notify} />}
      {tab === "allItems" && <AllItemsPanel notify={notify} />}
    </div>
  );
}

// MenuConfigurationsPanel needs the item catalog to build/edit masters -- fetches it once here
// rather than making every tab in MenuView load items whether it needs them or not.
function MenuConfigurationsPanelWrapper({ notify }) {
  const [items, setItems] = useState(null);
  useEffect(() => { apiFetch("/api/menu/items").then(setItems).catch(() => {}); }, []);
  if (!items) return <LoadingBlock />;
  return <MenuConfigurationsPanel items={items} notify={notify} />;
}

function AllItemsPanel({ notify }) {
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    Promise.all([apiFetch("/api/menu/items"), apiFetch("/api/menu/categories")])
      .then(([i, c]) => { setItems(i); setCategories(c); })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function removeItem(item) {
    if (!confirm(`Delete "${item.name}" from the menu? This can't be undone.`)) return;
    try {
      await apiFetch(`/api/menu/items/${item.id}`, { method: "DELETE" });
      notify("Item deleted");
      load();
    } catch (e) { notify(e.message, "error"); }
  }

  if (err) return <ErrorBlock message={err} />;
  if (!items) return <LoadingBlock />;

  const byCategory = categories.map((c) => ({ ...c, items: items.filter((i) => i.category_id === c.id) }));

  return (
    <div>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <div><p className="cardHint">Every dish the restaurant can ever serve -- build masters and daily menus from this list. Day-to-day sold-out status is set from Today&rsquo;s Items or the Calendar, not here.</p></div>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={15} />Add item</button>
      </div>

      {items.length === 0 && (
        <EmptyState title="No items" hint="Add a menu item to get started." />
      )}

      {byCategory.map((cat) => cat.items.length > 0 && (
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
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="button secondary small" onClick={() => setEditingItem(item)}>Edit</button>
                  <button className="button ghost small" onClick={() => removeItem(item)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showAdd && <AddMenuItemModal categories={categories} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); notify("Menu item saved"); load(); }} />}
      {editingItem && <AddMenuItemModal categories={categories} editingItem={editingItem} onClose={() => setEditingItem(null)} onSaved={() => { setEditingItem(null); notify("Menu item updated"); load(); }} />}
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
          Select items from your catalog once to build a named master (e.g. &ldquo;Weekday Lunch&rdquo;, &ldquo;Valentine&rsquo;s Special&rdquo;, &ldquo;Thanksgiving Special&rdquo;).
          Then on the Calendar tab, apply that master to any date in one click -- no need to pick items again.
        </p>
      </div>
      <button className="button primary small" style={{ marginBottom: 16 }} onClick={() => setShowAdd(true)}><Plus size={14} />New master</button>

      {configs.length === 0 ? (
        <EmptyState title="No masters yet" hint="Create one to build a reusable named menu you can apply to any date in one click." />
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
        <div className="modalHeader"><h3>New master</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        <div className="modalBody">
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid one">
          <div className="field"><label>Name</label><input className="textInput" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Weekday Lunch" /></div>
          <div className="field"><label>Description</label><textarea className="textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <button className="button primary" type="submit" disabled={saving} style={{ justifyContent: "center" }}>{saving ? "Creating..." : "Create"}</button>
        </form>
        </div>
      </div>
    </div>
  );
}

function EditConfigurationItemsModal({ config, items, onClose, onSaved }) {
  const [selected, setSelected] = useState(config.item_ids.map(String));
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(id) {
    const key = String(id);
    setSelected((prev) => (prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]));
  }

  const visible = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

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
        <div className="modalHeader"><h3>{config.name}: master items</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        <div className="modalBody">
        {error && <div className="loginError">{error}</div>}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input className="textInput" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
          <button type="button" className="button secondary small" onClick={() => setSelected(visible.map((i) => String(i.id)))}>Select all</button>
          <button type="button" className="button ghost small" onClick={() => setSelected([])}>Clear</button>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {visible.length === 0 && <EmptyState title="No matching items" hint="Try a different search." />}
          {visible.map((item) => (
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
    </div>
  );
}

const SLOT_LABELS = { morning: "Morning", midday: "Mid-day", evening: "Evening" };

/** Loads one date's per-slot schedule + the catalog + masters needed to edit it, and exposes
 * actions that always auto-save immediately (add/remove/load-master/close) -- there is no
 * separate "save" step, so staff see the effect of every click right away. Applying a master
 * COPIES its item list into that slot's own editable list rather than linking to it live: the
 * slot and the master are never stuck in a one-to-one relationship, and editing afterward
 * (adding or removing a dish) never snaps back to the master's original set. */
function useDaySchedule(date, onChanged) {
  const [day, setDay] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    Promise.all([
      apiFetch(`/api/menu/day-schedule?date=${date}`),
      apiFetch("/api/menu/configurations"),
      apiFetch("/api/menu/items")
    ]).then(([d, c, i]) => { setDay(d); setConfigs(c); setItems(i); }).catch((e) => setErr(e.message));
  }, [date]);
  useEffect(() => { load(); }, [load]);

  // menu_items.id is a Postgres bigint, which node-pg always returns as a string -- normalize
  // to Number here so every add/remove comparison below is number-to-number, never "5" !== 5.
  function currentItemIds(slot) {
    return (day?.resolved?.[slot]?.items || []).map((i) => Number(i.id));
  }

  async function patchSlot(slot, body) {
    try {
      await apiFetch("/api/menu/day-schedule", { method: "PATCH", body: JSON.stringify({ date, slot, ...body }) });
      load();
      if (onChanged) onChanged();
    } catch (e) { alert(e.message); }
  }

  function addItem(slot, itemId) {
    const ids = Array.from(new Set([...currentItemIds(slot), Number(itemId)]));
    return patchSlot(slot, { action: "set_items", itemIds: ids, configurationId: null });
  }
  function removeItem(slot, itemId) {
    const ids = currentItemIds(slot).filter((id) => id !== Number(itemId));
    return patchSlot(slot, { action: "set_items", itemIds: ids, configurationId: null });
  }
  function loadMaster(slot, configId) {
    const config = configs.find((c) => String(c.id) === String(configId));
    if (!config) return;
    return patchSlot(slot, { action: "set_items", itemIds: config.item_ids.map(Number), configurationId: Number(configId) });
  }
  // A slot with no explicit schedule resolves to "every catalog item valid for this meal
  // period" (the fallback default) -- that is NOT the same as staff having added those items,
  // so it must never render as a removable list. These two give an explicit, deliberate way
  // to start customizing: blank (pick from scratch) or seeded from what the default currently is.
  function startBlank(slot) {
    return patchSlot(slot, { action: "set_items", itemIds: [], configurationId: null });
  }
  function startFromDefault(slot) {
    return patchSlot(slot, { action: "set_items", itemIds: currentItemIds(slot), configurationId: null });
  }
  function toggleClosed(slot, closed) {
    return patchSlot(slot, { action: "set_closed", closed });
  }
  async function toggleSoldOut(item) {
    try {
      await apiFetch(`/api/menu/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ soldOut: !item.sold_out }) });
      load();
    } catch (e) { alert(e.message); }
  }

  return { day, configs, items, err, addItem, removeItem, loadMaster, startBlank, startFromDefault, toggleClosed, toggleSoldOut };
}

/** One shift's editable menu: current items as removable chips, "+ Add item" and "Load a
 * master" pop-open pickers that save on click, and a Closed toggle. Used identically for
 * today (inline, three stacked) and for any Calendar date (inside a modal). */
function ShiftCard({ slot, label, timeRange, scheduleState, resolvedItems, configs, catalogItems, onToggleClosed, onLoadMaster, onAddItem, onRemoveItem, onToggleSoldOut, onStartBlank, onStartFromDefault }) {
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [showMasterPicker, setShowMasterPicker] = useState(false);
  const [search, setSearch] = useState("");

  const closed = scheduleState?.mode === "closed";
  const isDefault = scheduleState?.mode === "default";
  const badge = !scheduleState || closed
    ? { cls: "cancelled", label: "Closed" }
    : scheduleState.mode === "custom"
    ? (scheduleState.configurationName ? { cls: "active", label: `From ${scheduleState.configurationName} (edited)` } : { cls: "pending", label: "Custom items" })
    : scheduleState.mode === "configuration"
    ? { cls: "active", label: `Master: ${scheduleState.configurationName}` }
    : { cls: "completed", label: "Not chosen yet" };

  const existingIds = new Set(resolvedItems.map((i) => i.id));
  const addable = catalogItems.filter((i) => !existingIds.has(i.id) && i.name.toLowerCase().includes(search.toLowerCase()));

  const masterPicker = showMasterPicker && (
    <div style={{ marginTop: 10, border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: 10 }}>
      {configs.length === 0 ? (
        <span className="cardHint">No masters yet -- build one in the Masters tab.</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {configs.map((c) => (
            <button type="button" key={c.id} className="button ghost small" style={{ justifyContent: "space-between" }}
              onClick={() => { onLoadMaster(slot, c.id); setShowMasterPicker(false); }}>
              <span>{c.name}</span><span className="cardHint">{c.item_ids.length} item{c.item_ids.length === 1 ? "" : "s"}</span>
            </button>
          ))}
        </div>
      )}
      <p className="cardHint" style={{ marginTop: 6 }}>Replaces this shift&rsquo;s current items with the master&rsquo;s list -- you can still add or remove items afterward, and it won&rsquo;t snap back.</p>
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><strong style={{ fontSize: 14 }}>{label}</strong> {timeRange && <span className="cardHint">({timeRange})</span>}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`badge ${badge.cls}`}>{badge.label}</span>
          <button className={`button small ${closed ? "danger" : "secondary"}`} onClick={() => onToggleClosed(slot, !closed)}>{closed ? "Reopen" : "Close shift"}</button>
        </div>
      </div>

      {!closed && isDefault && (
        // Nothing has been explicitly chosen for this shift yet -- resolvedItems here is just
        // every catalog item that could apply by default, NOT something staff added, so it's
        // never shown as a removable list. Staff must explicitly choose how to start.
        <div style={{ marginTop: 12 }}>
          <p className="cardHint" style={{ marginBottom: 10 }}>
            Nothing chosen yet -- {resolvedItems.length} item{resolvedItems.length === 1 ? "" : "s"} would be available by default. Pick how to start this shift&rsquo;s menu:
          </p>
          <div className="pillRow">
            <button type="button" className="button secondary small" onClick={() => onStartBlank(slot)}><Plus size={13} />Select items</button>
            <button type="button" className="button ghost small" onClick={() => onStartFromDefault(slot)}>Edit the default list</button>
            <button type="button" className="button ghost small" onClick={() => setShowMasterPicker((v) => !v)}><Layers size={13} />Load a master</button>
          </div>
          {masterPicker}
        </div>
      )}

      {!closed && !isDefault && (
        <>
          <div className="shiftItemsGrid" style={{ marginTop: 12 }}>
            {resolvedItems.length === 0 && <span className="cardHint">No items yet -- add some below or load a master.</span>}
            {resolvedItems.map((item) => (
              <div key={item.id} className="shiftItemCard" style={{ opacity: item.sold_out ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 13.5 }}>{item.name}</strong>
                  <strong style={{ fontSize: 13, flexShrink: 0 }}>${(item.price_cents / 100).toFixed(2)}</strong>
                </div>
                {item.description && <p className="cardHint" style={{ margin: "6px 0 0", lineHeight: 1.45 }}>{item.description}</p>}
                {(item.dietary_tags?.length > 0 || item.complimentary) && (
                  <div className="pillRow" style={{ marginTop: 8 }}>
                    {item.dietary_tags?.map((t) => <span key={t} className="pill">{t}</span>)}
                    {item.complimentary && <span className="pill">complimentary</span>}
                  </div>
                )}
                {item.sold_out && <div className="cardHint" style={{ color: "var(--danger)", marginTop: 8 }}>Out of stock</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button type="button" className={`button small ${item.sold_out ? "secondary" : "danger"}`} onClick={() => onToggleSoldOut(item)}>
                    {item.sold_out ? "Back in stock" : "Out of stock"}
                  </button>
                  <button type="button" className="button ghost small" title="Remove from this shift" onClick={() => onRemoveItem(slot, item.id)}><X size={13} /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="pillRow" style={{ marginTop: 12 }}>
            <button type="button" className="button secondary small" onClick={() => { setShowAddPicker((v) => !v); setShowMasterPicker(false); }}><Plus size={13} />Add item</button>
            <button type="button" className="button ghost small" onClick={() => { setShowMasterPicker((v) => !v); setShowAddPicker(false); }}><Layers size={13} />Load a master</button>
          </div>

          {showAddPicker && (
            <div style={{ marginTop: 10, border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: 10 }}>
              <input className="textInput" placeholder="Search items to add..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {addable.length === 0 && <span className="cardHint">No matching items.</span>}
                {addable.map((item) => (
                  <button type="button" key={item.id} className="button ghost small" style={{ justifyContent: "space-between" }}
                    onClick={() => { onAddItem(slot, item.id); setSearch(""); }}>
                    <span>{item.name}</span><span className="cardHint">${(item.price_cents / 100).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {masterPicker}
        </>
      )}
    </div>
  );
}

/** Today's menu, grouped into its three shifts -- the fast path for "what's on right now",
 * with the same add/remove/close/load-a-master actions as the Calendar, just inline instead
 * of behind a modal. */
function TodaysItemsPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const [slots, setSlots] = useState([]);
  const { day, configs, items, err, addItem, removeItem, loadMaster, startBlank, startFromDefault, toggleClosed, toggleSoldOut } = useDaySchedule(today);

  useEffect(() => { apiFetch("/api/menu/daily-slots").then(setSlots).catch(() => {}); }, []);

  if (err) return <ErrorBlock message={err} />;
  if (!day) return <LoadingBlock />;

  const slotTimes = Object.fromEntries(slots.map((s) => [s.slot, `${s.start_time?.slice(0, 5)}-${s.end_time?.slice(0, 5)}`]));

  return (
    <div>
      <div className="cardHint" style={{ marginBottom: 14 }}>
        {new Date(`${today}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} &middot; changes here only affect today -- use the Calendar tab for other dates.
      </div>
      {["morning", "midday", "evening"].map((slot) => (
        <ShiftCard key={slot} slot={slot} label={SLOT_LABELS[slot]} timeRange={slotTimes[slot] || ""}
          scheduleState={day.schedule[slot]} resolvedItems={day.resolved[slot]?.items || []}
          configs={configs} catalogItems={items}
          onToggleClosed={toggleClosed} onLoadMaster={loadMaster} onAddItem={addItem} onRemoveItem={removeItem} onToggleSoldOut={toggleSoldOut}
          onStartBlank={startBlank} onStartFromDefault={startFromDefault}
        />
      ))}
    </div>
  );
}

function MenuCalendarPanel({ notify }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [schedule, setSchedule] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const todayIso = new Date().toISOString().slice(0, 10);

  const from = `${month}-01`;
  const to = new Date(new Date(`${from}T00:00:00Z`).getUTCFullYear(), new Date(`${from}T00:00:00Z`).getUTCMonth() + 1, 0).toISOString().slice(0, 10);

  const load = useCallback(() => {
    apiFetch(`/api/menu/schedule?from=${from}&to=${to}`).then(setSchedule).catch(() => setSchedule([]));
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
            const entry = scheduleByDate.get(iso);
            const classes = ["calDay"];
            if (entry?.has_special) classes.push("special");
            else if (entry?.has_closed) classes.push("closed");
            else if (entry?.configured_slots > 0) classes.push("scheduled");
            if (iso === todayIso) classes.push("today");
            if (iso < todayIso) classes.push("past");
            const title = entry?.headline_configuration
              ? `${entry.headline_configuration}${entry.has_special ? " (special day)" : ""}`
              : "No menu set up yet";
            return (
              <button key={iso} className={classes.join(" ")} title={title} onClick={() => setSelectedDate(iso)}>
                {entry?.has_special && <span className="calDayMark" aria-label="Special day">S</span>}
                {!entry?.has_special && entry?.has_closed && <span className="calDayMark">C</span>}
                {day}
              </button>
            );
          })}
        </div>

        <div className="calLegend">
          <span className="calLegendItem"><span className="calLegendSwatch" style={{ background: "var(--brand-soft)", borderColor: "var(--brand)" }} />Menu set</span>
          <span className="calLegendItem"><span className="calLegendSwatch" style={{ background: "var(--amber-soft)", borderColor: "#c98a16" }} />S &middot; Special day</span>
          <span className="calLegendItem"><span className="calLegendSwatch" style={{ background: "var(--danger-soft)", borderColor: "var(--danger)" }} />C &middot; Shift closed</span>
        </div>
      </div>

      <div className="cardHint">Click any date to see and edit Morning / Mid-day / Evening separately -- load a master in one click, add or remove dishes by hand, or close the shift.</div>

      {selectedDate && (
        <DayScheduleModal
          date={selectedDate} isPast={selectedDate < todayIso}
          onClose={() => setSelectedDate(null)}
          onChanged={load}
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

function DayScheduleModal({ date, isPast, onClose, onChanged }) {
  const [slots, setSlots] = useState([]);
  const { day, configs, items, err, addItem, removeItem, loadMaster, startBlank, startFromDefault, toggleClosed, toggleSoldOut } = useDaySchedule(date, onChanged);

  useEffect(() => { apiFetch("/api/menu/daily-slots").then(setSlots).catch(() => {}); }, []);

  const slotTimes = Object.fromEntries(slots.map((s) => [s.slot, `${s.start_time?.slice(0, 5)}-${s.end_time?.slice(0, 5)}`]));

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modalHeader">
          <h3>{new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h3>
          <button className="button ghost small" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modalBody">

        {isPast ? (
          <div className="cardHint" style={{ background: "var(--line-soft)", padding: 10, borderRadius: 10 }}>This date is in the past and cannot be edited.</div>
        ) : err ? <ErrorBlock message={err} /> : !day ? <LoadingBlock /> : (
          ["morning", "midday", "evening"].map((slot) => (
            <ShiftCard key={slot} slot={slot} label={SLOT_LABELS[slot]} timeRange={slotTimes[slot] || ""}
              scheduleState={day.schedule[slot]} resolvedItems={day.resolved[slot]?.items || []}
              configs={configs} catalogItems={items}
              onToggleClosed={toggleClosed} onLoadMaster={loadMaster} onAddItem={addItem} onRemoveItem={removeItem} onToggleSoldOut={toggleSoldOut}
              onStartBlank={startBlank} onStartFromDefault={startFromDefault}
            />
          ))
        )}
        </div>
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

function AddMenuItemModal({ categories, editingItem, onClose, onSaved }) {
  const [form, setForm] = useState(() => editingItem ? {
    name: editingItem.name || "", description: editingItem.description || "",
    priceDollars: editingItem.price_cents != null ? (editingItem.price_cents / 100).toFixed(2) : "",
    categoryId: editingItem.category_id || categories[0]?.id || "",
    dietaryTags: editingItem.dietary_tags || [], recommendTags: editingItem.recommend_tags || [],
    mealPeriods: editingItem.meal_periods || ["midday", "evening"], complimentary: editingItem.complimentary || false
  } : {
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
    const payload = {
      name: form.name,
      description: form.description,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      priceCents: Math.round(Number(form.priceDollars || 0) * 100),
      dietaryTags: form.dietaryTags,
      recommendTags: form.recommendTags,
      mealPeriods: form.mealPeriods,
      complimentary: form.complimentary
    };
    try {
      if (editingItem) {
        await apiFetch(`/api/menu/items/${editingItem.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/menu/items", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader"><h3>{editingItem ? "Edit menu item" : "Add menu item"}</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        <div className="modalBody">
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
          <button className="button primary" type="submit" disabled={saving} style={{ gridColumn: "1 / -1", justifyContent: "center" }}>{saving ? "Saving..." : editingItem ? "Save changes" : "Save item"}</button>
        </form>
        </div>
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
        <div className="modalBody">
        {error && <div className="loginError">{error}</div>}
        <form onSubmit={submit} className="formGrid one">
          <div className="field"><label>Topic / name</label><input className="textInput" required value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Birthday policy" /></div>
          <div className="field"><label>Detail (what the agent should say)</label><textarea className="textarea" rows={4} required value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="e.g. We bring out a complimentary dessert for birthdays -- just mention it when booking." /></div>
          <button className="button primary" type="submit" disabled={saving} style={{ justifyContent: "center" }}>{saving ? "Saving..." : "Save"}</button>
        </form>
        </div>
      </div>
    </div>
  );
}

const WEEKDAY_LABELS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];

const HOUR_SHIFTS = ["morning", "midday", "evening"];
const SHIFT_FALLBACK_TIMES = {
  morning: { open: "09:00", close: "12:00" },
  midday: { open: "13:00", close: "16:00" },
  evening: { open: "18:00", close: "22:00" }
};

function toMin(hhmm) { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; }
function toHhmm(total) { return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }

/**
 * Opening hours are edited as the same three shifts the rest of the app runs on. A day is
 * { closed, windows: [{slot, open, close}] } holding only the shifts that are actually open.
 * Hours saved before this (one flat {open,close}, or unlabelled windows) are mapped onto the
 * shifts by intersecting them with each shift's time range, so a legacy 11:00-22:30 day keeps
 * its real hours (morning becomes 11:00-12:00) instead of silently claiming a 09:00 open.
 */
function normalizeDayHours(day, slotTimes) {
  const defaults = (slot) => slotTimes?.[slot] || SHIFT_FALLBACK_TIMES[slot];
  const blank = () => HOUR_SHIFTS.map((slot) => ({ slot, ...defaults(slot), enabled: false }));

  if (!day) return { closed: false, shifts: HOUR_SHIFTS.map((slot) => ({ slot, ...defaults(slot), enabled: true })) };
  if (day.closed) return { closed: true, shifts: blank() };

  const windows = Array.isArray(day.windows) && day.windows.length
    ? day.windows
    : (day.open && day.close ? [{ open: day.open, close: day.close }] : []);

  // Already shift-labelled -- use as-is.
  if (windows.some((w) => w.slot)) {
    return {
      closed: false,
      shifts: HOUR_SHIFTS.map((slot) => {
        const match = windows.find((w) => w.slot === slot);
        return match ? { slot, open: match.open, close: match.close, enabled: true } : { slot, ...defaults(slot), enabled: false };
      })
    };
  }

  if (windows.length === 0) return { closed: false, shifts: blank() };

  return {
    closed: false,
    shifts: HOUR_SHIFTS.map((slot) => {
      const base = defaults(slot);
      const shiftStart = toMin(base.open);
      const shiftEnd = toMin(base.close);
      let open = null;
      let close = null;
      for (const w of windows) {
        const lo = Math.max(shiftStart, toMin(w.open));
        const hi = Math.min(shiftEnd, toMin(w.close));
        if (lo < hi) {
          open = open === null ? lo : Math.min(open, lo);
          close = close === null ? hi : Math.max(close, hi);
        }
      }
      return open === null
        ? { slot, ...base, enabled: false }
        : { slot, open: toHhmm(open), close: toHhmm(close), enabled: true };
    })
  };
}

/** Editor state -> what gets stored: only the open shifts, as labelled windows. */
function hoursForSave(hours) {
  const out = {};
  for (const [key] of WEEKDAY_LABELS) {
    const day = hours[key];
    const open = day.shifts.filter((s) => s.enabled);
    out[key] = day.closed || open.length === 0
      ? { closed: true, windows: [] }
      : { closed: false, windows: open.map((s) => ({ slot: s.slot, open: s.open, close: s.close })) };
  }
  return out;
}

function ProfileForm({ settings, onSave }) {
  const [form, setForm] = useState({ address: settings.address || "", phone: settings.phone || "", total_seating_capacity: settings.total_seating_capacity || 0, description: settings.description || "" });
  const [slotTimes, setSlotTimes] = useState(null);
  const [hours, setHours] = useState(null);

  // Each day's three shifts default to the restaurant's configured serving windows, so hours
  // and the menu/takeaway shifts line up instead of being maintained as two separate ideas.
  useEffect(() => {
    apiFetch("/api/menu/daily-slots").then((rows) => {
      const times = {};
      for (const r of rows) times[r.slot] = { open: String(r.start_time).slice(0, 5), close: String(r.end_time).slice(0, 5) };
      setSlotTimes(times);
    }).catch(() => setSlotTimes({}));
  }, []);

  useEffect(() => {
    if (!slotTimes) return;
    const normalized = {};
    for (const [key] of WEEKDAY_LABELS) normalized[key] = normalizeDayHours((settings.opening_hours || {})[key], slotTimes);
    setHours(normalized);
  }, [slotTimes, settings.opening_hours]);

  function setDay(key, patch) {
    setHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }
  function setShift(key, slot, patch) {
    setHours((prev) => ({
      ...prev,
      [key]: { ...prev[key], shifts: prev[key].shifts.map((s) => (s.slot === slot ? { ...s, ...patch } : s)) }
    }));
  }
  function copyToAllDays(key) {
    const source = hours[key];
    setHours((prev) => {
      const next = { ...prev };
      for (const [k] of WEEKDAY_LABELS) next[k] = { closed: source.closed, shifts: source.shifts.map((s) => ({ ...s })) };
      return next;
    });
  }

  return (
    <div className="card">
      <div className="formGrid" style={{ marginBottom: 20 }}>
        <div className="field"><label>Phone number</label><input className="textInput" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="field"><label>Total seating capacity</label><input className="textInput" type="number" value={form.total_seating_capacity} onChange={(e) => setForm({ ...form, total_seating_capacity: Number(e.target.value) })} /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}><label>Address</label><input className="textInput" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}><label>Description</label><textarea className="textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      </div>

      <div className="cardTitle" style={{ marginBottom: 4 }}>Opening hours</div>
      <p className="cardHint" style={{ marginBottom: 14 }}>
        Each day runs as three shifts -- Morning, Mid-day and Evening -- starting from your configured serving times.
        Untick a shift to close just that part of the day (e.g. open for lunch and dinner but not breakfast).
      </p>

      {!hours ? <LoadingBlock /> : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {WEEKDAY_LABELS.map(([key, label]) => {
              const day = hours[key];
              const openShifts = day.shifts.filter((s) => s.enabled).length;
              return (
                <div key={key} style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ width: 90, fontSize: 13, fontWeight: 700 }}>{label}</span>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
                      <input type="checkbox" checked={!day.closed} onChange={(e) => setDay(key, { closed: !e.target.checked })} />Open
                    </label>
                    {!day.closed && (
                      <>
                        <span className="cardHint">{openShifts} of 3 shifts open</span>
                        <button type="button" className="button ghost small" onClick={() => copyToAllDays(key)} title="Copy this day's hours to every other day">Copy to all days</button>
                      </>
                    )}
                  </div>

                  {!day.closed && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                      {day.shifts.map((s) => (
                        <div key={s.slot} style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 90, flexWrap: "wrap", opacity: s.enabled ? 1 : 0.55 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, width: 120, fontSize: 12.5 }}>
                            <input type="checkbox" checked={s.enabled} onChange={(e) => setShift(key, s.slot, { enabled: e.target.checked })} />
                            {SLOT_ICONS[s.slot]} {SLOT_LABELS[s.slot]}
                          </label>
                          <input className="textInput" type="time" disabled={!s.enabled} value={s.open} onChange={(e) => setShift(key, s.slot, { open: e.target.value })} style={{ width: 120 }} />
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>to</span>
                          <input className="textInput" type="time" disabled={!s.enabled} value={s.close} onChange={(e) => setShift(key, s.slot, { close: e.target.value })} style={{ width: 120 }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button className="button primary" onClick={() => onSave({ ...form, opening_hours: hoursForSave(hours) })}>Save profile &amp; hours</button>
        </>
      )}
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
              {order.requested_time && (
                <div className="cardHint" style={{ marginTop: 3 }}><Clock size={12} style={{ verticalAlign: "-2px" }} /> Pickup at {formatTime12h(String(order.requested_time).slice(0, 5))}</div>
              )}
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
  const today = new Date().toISOString().slice(0, 10);
  const [slot, setSlot] = useState("");             // chosen shift -- drives both menu and times
  const [day, setDay] = useState(null);             // today's per-shift menu (what's actually on)
  const [slotWindows, setSlotWindows] = useState([]); // daily_slots start/end per shift
  const [lines, setLines] = useState([]); // { menuItemId, quantity, variantLabel? }
  const [pendingItemId, setPendingItemId] = useState("");
  const [pendingVariant, setPendingVariant] = useState("");
  const [form, setForm] = useState({ customerName: "", phone: "", requestedTime: "", notes: "" });
  const [pickup, setPickup] = useState(null); // { options, intervalMinutes, prepBufferMinutes }
  const [stage, setStage] = useState("build"); // build -> review -> (create)
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/menu/day-schedule?date=${today}`).then(setDay).catch(() => {});
    apiFetch("/api/menu/daily-slots").then(setSlotWindows).catch(() => {});
    apiFetch("/api/takeaway/pickup-options").then(setPickup).catch(() => {});
  }, [today]);

  // Items are whatever today's menu actually has on for the chosen shift -- never the whole
  // catalog, so staff can't take an order for something that isn't being served that shift.
  const items = slot && day ? (day.resolved?.[slot]?.items || []) : [];
  const slotWindowBySlot = Object.fromEntries(slotWindows.map((s) => [s.slot, s]));

  // Pickup times = the valid takeaway slots (already prep-buffered and inside opening hours)
  // narrowed to one shift's own serving window. Computed per shift, not just the selected
  // one, so the picker can grey out shifts that have already run out of time today.
  function timesForShift(slotKey) {
    if (!pickup || !slotKey) return [];
    const window = slotWindowBySlot[slotKey];
    if (!window) return pickup.options;
    const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const start = toMin(window.start_time.slice(0, 5));
    const end = toMin(window.end_time.slice(0, 5));
    return pickup.options.filter((t) => toMin(t) >= start && toMin(t) <= end);
  }
  const timesForSlot = timesForShift(slot);

  function pickShift(nextSlot) {
    setSlot(nextSlot);
    setPendingItemId(""); setPendingVariant("");
    // Keep any lines whose item is also on the new shift's menu; drop the ones that aren't.
    const allowed = new Set((day?.resolved?.[nextSlot]?.items || []).map((i) => Number(i.id)));
    setLines((prev) => prev.filter((l) => allowed.has(Number(l.menuItemId))));
    setForm((f) => ({ ...f, requestedTime: "" }));
  }

  // Default the pickup time to the first valid one once a shift is chosen.
  useEffect(() => {
    if (slot && timesForSlot.length > 0 && !timesForSlot.includes(form.requestedTime)) {
      setForm((f) => ({ ...f, requestedTime: timesForSlot[0] }));
    }
  }, [slot, timesForSlot, form.requestedTime]);

  const pendingItem = items.find((i) => Number(i.id) === Number(pendingItemId));

  function lineKey(line) { return `${line.menuItemId}:${line.variantLabel || ""}`; }

  function addLine() {
    if (!pendingItemId) return;
    const menuItemId = Number(pendingItemId);
    const variantLabel = pendingVariant || null;
    setLines((prev) => {
      const existing = prev.find((l) => l.menuItemId === menuItemId && (l.variantLabel || null) === variantLabel);
      if (existing) return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { menuItemId, quantity: 1, variantLabel }];
    });
    setPendingItemId(""); setPendingVariant("");
  }
  function changeQuantity(line, delta) {
    setLines((prev) => prev
      .map((l) => (l === line ? { ...l, quantity: l.quantity + delta } : l))
      .filter((l) => l.quantity > 0));
  }
  function removeLine(line) {
    setLines((prev) => prev.filter((l) => l !== line));
  }

  async function getQuote() {
    setQuoting(true);
    setError("");
    try {
      const result = await apiFetch("/api/takeaway", { method: "POST", body: JSON.stringify({ quoteOnly: true, lines }) });
      setQuote(result);
      setStage("review");
    } catch (e) { setError(e.message); } finally { setQuoting(false); }
  }

  async function confirmCreate() {
    setSaving(true);
    setError("");
    try {
      const result = await apiFetch("/api/takeaway", { method: "POST", body: JSON.stringify({ ...form, requestedSlot: slot, lines }) });
      onSaved(result.order);
    } catch (err) {
      setError(err.message);
      setStage("build"); // price/availability may have shifted -- let staff re-check before retrying
    } finally { setSaving(false); }
  }

  function lineUnitPriceCents(line) {
    // menu_items.id is a bigint, which node-pg hands back as a string -- compare as numbers.
    const item = items.find((i) => Number(i.id) === Number(line.menuItemId));
    if (!item) return 0;
    if (line.variantLabel) {
      const variant = (item.size_options || []).find((o) => o.label === line.variantLabel);
      if (variant) return variant.price_cents;
    }
    return item.price_cents;
  }
  // Live estimate shown while building, before the authoritative server-side quote --
  // clearly labeled as an estimate since the real quote always re-prices from the DB.
  const runningSubtotalCents = lines.reduce((sum, l) => sum + lineUnitPriceCents(l) * l.quantity, 0);

  const available = items.filter((i) => i.available && !i.sold_out);

  if (stage === "review") {
    return (
      <div className="modalOverlay" onClick={onClose}>
        <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <div className="modalHeader"><h3>Confirm takeaway order</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
          <div className="modalBody">
          {error && <div className="loginError">{error}</div>}
          <p className="cardHint" style={{ marginBottom: 14 }}>Priced from the live menu. Creating an order always needs this explicit confirmation.</p>

          <div className="modalSection">
            <div className="modalSectionTitle">Items</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {quote.items.map((i, idx) => (
                <div key={idx} className="orderLine">
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 13.5 }}>{i.quantity}&times; {i.name}{i.variantLabel ? ` (${i.variantLabel})` : ""}</strong>
                    <div className="cardHint">${(i.unitPriceCents / 100).toFixed(2)} each</div>
                  </div>
                  <strong style={{ fontSize: 13.5 }}>${((i.unitPriceCents * i.quantity) / 100).toFixed(2)}</strong>
                </div>
              ))}
            </div>
            <div className="orderTotalRow">
              <span className="cardHint">
                Subtotal ${(quote.subtotalCents / 100).toFixed(2)} + {quote.serviceChargePct}% service (${(quote.serviceChargeCents / 100).toFixed(2)})
              </span>
              <strong style={{ fontSize: 15 }}>${(quote.totalCents / 100).toFixed(2)}</strong>
            </div>
          </div>

          <div className="modalSection">
            <div className="modalSectionTitle">Pickup</div>
            <div style={{ fontSize: 13.5 }}>
              <div><strong>{form.customerName}</strong> &middot; {form.phone}</div>
              <div className="cardHint" style={{ marginTop: 3 }}>
                {slot ? `${SLOT_LABELS[slot]} shift · ` : ""}pickup at {formatTime12h(form.requestedTime)} today &middot; pay at pickup
              </div>
              {form.notes && <div className="cardHint" style={{ marginTop: 3 }}>Notes: {form.notes}</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="button secondary" onClick={() => setStage("build")} style={{ flex: 1, justifyContent: "center" }}>Back &amp; edit</button>
            <button type="button" className="button primary" onClick={confirmCreate} disabled={saving} style={{ flex: 1, justifyContent: "center" }}>
              {saving ? "Creating..." : "Confirm & create order"}
            </button>
          </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modalHeader"><h3>New takeaway order</h3><button className="button ghost small" onClick={onClose}><X size={14} /></button></div>
        <div className="modalBody">
        {error && <div className="loginError">{error}</div>}

        <div className="modalSection">
          <div className="modalSectionTitle">1. Pickup shift</div>
          {!day ? <p className="cardHint">Loading today&rsquo;s menu...</p> : (
            <>
              <div className="pillRow">
                {["morning", "midday", "evening"].map((s) => {
                  const closed = day.schedule?.[s]?.mode === "closed";
                  const window = slotWindowBySlot[s];
                  // Once the last pickup slot in a shift's window is behind the prep buffer,
                  // that shift is over for today -- grey it out rather than letting staff
                  // select it and hit an empty time dropdown.
                  const passed = !closed && !!pickup && timesForShift(s).length === 0;
                  const disabled = closed || passed;
                  return (
                    <button type="button" key={s} disabled={disabled}
                      title={closed ? "This shift is closed today" : passed ? "No pickup times left in this shift today" : ""}
                      className={`button small ${slot === s ? "primary" : "secondary"}`}
                      onClick={() => pickShift(s)}>
                      {SLOT_ICONS[s]} {SLOT_LABELS[s]}
                      {window && <span style={{ opacity: 0.7, marginLeft: 4 }}>{window.start_time.slice(0, 5)}-{window.end_time.slice(0, 5)}</span>}
                      {closed ? " (closed)" : passed ? " (passed)" : ""}
                    </button>
                  );
                })}
              </div>
              <p className="cardHint" style={{ marginTop: 8 }}>
                Pickup is today only. The shift decides both what&rsquo;s on the menu and which pickup times are offered.
                {pickup && ["morning", "midday", "evening"].every((s) => day.schedule?.[s]?.mode === "closed" || timesForShift(s).length === 0)
                  && " No shifts are still open for pickup today."}
              </p>
            </>
          )}
        </div>

        {slot && (
          <div className="modalSection">
            <div className="modalSectionTitle">2. Add items <span className="cardHint">(on the {SLOT_LABELS[slot].toLowerCase()} menu today)</span></div>
            {available.length === 0 ? (
              <p className="cardHint" style={{ padding: "10px 0" }}>Nothing is on the menu for this shift today -- set it up in Menu &rsaquo; Today&rsquo;s Items.</p>
            ) : (
              <div className="formGrid">
                <div className="field" style={{ gridColumn: pendingItem?.size_options?.length > 0 ? "auto" : "1 / -1" }}>
                  <label>Menu item</label>
                  <select className="select" value={pendingItemId} onChange={(e) => { setPendingItemId(e.target.value); setPendingVariant(""); }}>
                    <option value="">Select a menu item...</option>
                    {available.map((i) => <option key={i.id} value={i.id}>{i.name} -- ${(i.price_cents / 100).toFixed(2)}</option>)}
                  </select>
                </div>
                {pendingItem?.size_options?.length > 0 && (
                  <div className="field"><label>Size</label>
                    <select className="select" value={pendingVariant} onChange={(e) => setPendingVariant(e.target.value)}>
                      <option value="">Regular -- ${(pendingItem.price_cents / 100).toFixed(2)}</option>
                      {pendingItem.size_options.map((o) => <option key={o.label} value={o.label}>{o.label} -- ${(o.price_cents / 100).toFixed(2)}</option>)}
                    </select>
                  </div>
                )}
                <button type="button" className="checkAvailabilityBtn" onClick={addLine} disabled={!pendingItemId} style={{ gridColumn: "1 / -1" }}>
                  <Plus size={15} />Add to order
                </button>
              </div>
            )}
          </div>
        )}

        <div className="modalSection">
          <div className="modalSectionTitle">
            3. Order {lines.length > 0 && <span className="cardHint">({lines.reduce((n, l) => n + l.quantity, 0)} item{lines.reduce((n, l) => n + l.quantity, 0) === 1 ? "" : "s"})</span>}
          </div>
          {lines.length === 0 ? (
            <p className="cardHint" style={{ padding: "10px 0" }}>{slot ? "No items added yet -- pick a menu item above and click Add to order." : "Pick a pickup shift first."}</p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {lines.map((line) => {
                  const item = items.find((i) => Number(i.id) === Number(line.menuItemId));
                  const unit = lineUnitPriceCents(line);
                  return (
                    <div key={lineKey(line)} className="orderLine">
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: 13.5 }}>{item?.name}{line.variantLabel ? ` (${line.variantLabel})` : ""}</strong>
                        <div className="cardHint">${(unit / 100).toFixed(2)} each</div>
                      </div>
                      <Stepper value={line.quantity} min={1} max={99} onChange={(next) => changeQuantity(line, next - line.quantity)} />
                      <strong style={{ fontSize: 13.5, minWidth: 58, textAlign: "right" }}>${((unit * line.quantity) / 100).toFixed(2)}</strong>
                      <button type="button" className="button ghost small" title="Remove" onClick={() => removeLine(line)}><X size={13} /></button>
                    </div>
                  );
                })}
              </div>
              <div className="orderTotalRow">
                <span className="cardHint">Estimated subtotal (5% service added at pricing)</span>
                <strong>${(runningSubtotalCents / 100).toFixed(2)}</strong>
              </div>
            </>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); getQuote(); }}>
          <div className="modalSection">
            <div className="modalSectionTitle">4. Customer &amp; pickup time</div>
            <div className="formGrid">
              <div className="field"><label>Customer name</label><input className="textInput" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input className="textInput" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Pickup time{slot ? ` (within ${SLOT_LABELS[slot]})` : ""}</label>
                {!slot ? (
                  <div className="cardHint">Pick a shift above first.</div>
                ) : !pickup ? (
                  <div className="cardHint">Loading available pickup times...</div>
                ) : timesForSlot.length === 0 ? (
                  <div className="cardHint" style={{ color: "var(--danger)" }}>
                    No pickup times left in the {SLOT_LABELS[slot].toLowerCase()} shift today -- the kitchen needs {pickup.prepBufferMinutes} minutes&rsquo; notice. Try a later shift.
                  </div>
                ) : (
                  <>
                    <select className="select" required value={form.requestedTime} onChange={(e) => setForm({ ...form, requestedTime: e.target.value })}>
                      {timesForSlot.map((t) => <option key={t} value={t}>{formatTime12h(t)}</option>)}
                    </select>
                    <div className="cardHint" style={{ marginTop: 6 }}>Fixed {pickup.intervalMinutes}-minute pickup slots, at least {pickup.prepBufferMinutes} minutes out for prep.</div>
                  </>
                )}
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
          </div>
          <button className="button primary" type="submit" disabled={quoting || !slot || lines.length === 0 || !form.requestedTime} style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
            {quoting ? "Pricing..." : !slot ? "Pick a pickup shift" : lines.length === 0 ? "Add at least one item" : !form.requestedTime ? "No pickup times available" : "Review & price order"}
          </button>
        </form>
        </div>
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
        <div className="modalBody">
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
