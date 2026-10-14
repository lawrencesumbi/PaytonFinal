import { useCallback, useEffect, useState } from "react";
import { supabase, formatDate } from "../lib/supabase";
import { formatBytes, isMissingFunction, rpcErrorMessage } from "../lib/adminUtils";
import { ACTION_LABELS } from "../lib/auditLabels";
import "../modules.css";

type Check = { state: "loading" | "ok" | "fail"; ms?: number; detail: string };
type Snapshot = {
  server_time: string;
  database_size_bytes: number;
  signed_in_24h: number;
  new_users_24h: number;
  suspended_users: number;
  admin_count: number;
  admin_actions_24h: number;
  last_admin_action_at: string | null;
};
type EventRow = {
  id: number;
  created_at: string;
  action: string;
  actor_email: string | null;
  target_email: string | null;
  details: { reason?: string | null } | null;
};

const LOADING: Check = { state: "loading", detail: "Checking…" };

const NOT_MEASURED: { title: string; reason: string }[] = [
  { title: "Uptime history", reason: "No uptime records are stored. The checks above are single measurements taken when this page loads." },
  { title: "AI service (Gemini) availability and usage", reason: "The mobile app calls the AI service directly and does not log it, so there is nothing for the admin panel to read." },
  { title: "Reminder email function (send-reminders)", reason: "It is not called from the admin panel, so its status is not checked here." },
  { title: "Mobile app errors and crashes", reason: "The app does not report errors to any table the admin panel can read." },
];

export default function Monitoring() {
  const [auth, setAuth] = useState<Check>(LOADING);
  const [db, setDb] = useState<Check>(LOADING);
  const [fn, setFn] = useState<Check>(LOADING);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsError, setEventsError] = useState("");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setAuth(LOADING);
    setDb(LOADING);
    setFn(LOADING);
    setEventsError("");

    const checkAuth = async () => {
      const t = performance.now();
      const { data, error } = await supabase.auth.getUser();
      const ms = Math.round(performance.now() - t);
      if (error || !data.user) setAuth({ state: "fail", ms, detail: "The sign-in service did not confirm this session." });
      else setAuth({ state: "ok", ms, detail: "The sign-in service confirmed this session." });
    };

    const checkDb = async () => {
      const t = performance.now();
      const { data, error } = await supabase.rpc("admin_system_status");
      const ms = Math.round(performance.now() - t);
      if (error) {
        setDb({ state: "fail", ms, detail: rpcErrorMessage(error, "The database did not answer.") });
        setSnapshot(null);
        return;
      }
      setDb({ state: "ok", ms, detail: "The database answered an administrator query." });
      setSnapshot(data as Snapshot);
    };

    const checkFn = async () => {
      const t = performance.now();
      // A deliberately invalid request: the function answers with a rejection and changes nothing.
      const { error } = await supabase.functions.invoke("admin-set-status", { body: { userId: "", status: "ping" } });
      const ms = Math.round(performance.now() - t);
      const status = (error as { context?: { status?: number } } | null)?.context?.status;
      if (!error) setFn({ state: "ok", ms, detail: "The function responded." });
      else if (status === 404) setFn({ state: "fail", ms, detail: "The function is not deployed (HTTP 404)." });
      else if (status !== undefined && status < 500)
        setFn({ state: "ok", ms, detail: `The function responded (HTTP ${status}). The test request was rejected on purpose and nothing was changed.` });
      else if (status !== undefined) setFn({ state: "fail", ms, detail: `The function returned an error (HTTP ${status}).` });
      else setFn({ state: "fail", ms, detail: "The function could not be reached." });
    };

    const loadEvents = async () => {
      const { data, error } = await supabase.rpc("admin_list_audit_logs", { p_limit: 5, p_offset: 0 });
      if (error) {
        setEventsError(isMissingFunction(error) ? "Audit log function is missing." : "Could not load recent events.");
        setEvents([]);
      } else setEvents((data ?? []) as EventRow[]);
    };

    await Promise.all([checkAuth(), checkDb(), checkFn(), loadEvents()]);
    setCheckedAt(new Date());
    setRunning(false);
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const checks: { name: string; check: Check; what: string }[] = [
    { name: "Sign-in service (Supabase Auth)", check: auth, what: "Session check" },
    { name: "Database", check: db, what: "Administrator query" },
    { name: "Edge Function: admin-set-status", check: fn, what: "Reachability test" },
  ];

  return (
    <div className="ref-dashboard-container">
      <div className="ref-top-header">
        <div>
          <h1 className="ref-page-title">System Monitoring</h1>
          <div className="ref-breadcrumbs">Dashboard / <span className="current">System monitoring</span></div>
        </div>
        <button className="mod-btn-ghost" onClick={run} disabled={running}>{running ? "Checking…" : "Run checks again"}</button>
      </div>

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">Verified now</h3>
            <p className="ref-panel-sub">
              Measured from your browser{checkedAt ? ` at ${checkedAt.toLocaleTimeString("en-PH")}` : ""}. Response times are single measurements, not averages.
            </p>
          </div>
        </div>
        <div className="mod-grid">
          {checks.map(({ name, check }) => (
            <div className="mod-check" key={name}>
              <div className="mod-check-head">
                <span>{name}</span>
                {check.state === "loading" ? <span className="mod-pill-muted">Checking…</span>
                  : check.state === "ok" ? <span className="mod-ok">Reachable</span>
                  : <span className="mod-fail">Problem</span>}
              </div>
              {check.ms !== undefined && <div className="mod-check-detail">Response time: {check.ms} ms</div>}
              <div className="mod-check-detail">{check.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">Database snapshot</h3>
            <p className="ref-panel-sub">Counts and size only. No personal data is shown.</p>
          </div>
        </div>
        {db.state === "loading" && <div className="ref-state-cell">Loading snapshot…</div>}
        {db.state === "fail" && <div className="alert alert-error" role="alert">Snapshot unavailable. {db.detail}</div>}
        {snapshot && (
          <div className="mod-grid">
            <Metric label="Database size" value={formatBytes(snapshot.database_size_bytes)} />
            <Metric label="Users signed in (last 24 hours)" value={snapshot.signed_in_24h} />
            <Metric label="New accounts (last 24 hours)" value={snapshot.new_users_24h} />
            <Metric label="Suspended accounts" value={snapshot.suspended_users} />
            <Metric label="Administrators" value={snapshot.admin_count} />
            <Metric label="Admin actions (last 24 hours, excluding sign-in)" value={snapshot.admin_actions_24h} />
            <Metric label="Last administrator action" value={snapshot.last_admin_action_at ? formatDate(snapshot.last_admin_action_at) : "None yet"} />
          </div>
        )}
      </div>

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">Recent events</h3>
            <p className="ref-panel-sub">The latest administrator actions. Application errors are not recorded anywhere yet.</p>
          </div>
        </div>
        {eventsError && <div className="alert alert-error" role="alert">{eventsError}</div>}
        <div className="ref-table-container mod-scroll">
          <table className="ref-table">
            <thead>
              <tr>
                <th style={{ width: "22%" }}>When</th>
                <th style={{ width: "26%" }}>Administrator</th>
                <th style={{ width: "26%" }}>Action</th>
                <th style={{ width: "26%" }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {running && events.length === 0 && <tr><td colSpan={4} className="ref-state-cell">Loading events…</td></tr>}
              {!running && !eventsError && events.length === 0 && (
                <tr><td colSpan={4} className="ref-state-cell">No administrator events recorded yet.</td></tr>
              )}
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="text-truncate">{formatDate(e.created_at)}</td>
                  <td className="text-truncate" title={e.actor_email ?? ""}>{e.actor_email ?? "—"}</td>
                  <td className="text-truncate">{ACTION_LABELS[e.action] ?? e.action}</td>
                  <td className="text-truncate" title={e.details?.reason ?? ""}>{e.target_email ?? e.details?.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">Cannot be measured yet</h3>
            <p className="ref-panel-sub">Shown so nothing here is mistaken for a verified status.</p>
          </div>
        </div>
        <ul className="mod-list">
          {NOT_MEASURED.map((n) => (
            <li key={n.title}><strong>{n.title}.</strong> {n.reason}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mod-metric">
      <div className="mod-metric-value">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="mod-metric-label">{label}</div>
    </div>
  );
}
