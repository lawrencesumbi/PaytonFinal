import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Stats = {
  total_users: number;
  verified_users: number;
  suspended_users: number;
  active_last_30d: number;
  new_last_7d: number;
  by_role: Record<string, number>;
  signups_14d: { day: string; n: number }[];
  records: Record<string, number>;
};

const RECORD_LABELS: Record<string, string> = {
  expenses: "Expenses",
  income: "Income entries",
  allowances: "Allowances",
  reminders: "Reminders",
  split_expenses: "Split expenses",
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    const started = performance.now();
    supabase.rpc("admin_dashboard_stats").then(({ data, error: rpcError }) => {
      if (rpcError) {
        setError("Could not load statistics. The database may be paused or unreachable.");
        return;
      }
      setLatency(Math.round(performance.now() - started));
      setStats(data as Stats);
    });
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!stats) return <p className="muted">Loading…</p>;

  const roleTotal = Object.values(stats.by_role).reduce((a, b) => a + b, 0) || 1;
  const maxSignup = Math.max(1, ...stats.signups_14d.map((d) => d.n));

  return (
    <>
      <h1>Dashboard</h1>

      <section className="panel strip">
        <Stat label="Registered users" value={stats.total_users} />
        <Stat label="Email verified" value={stats.verified_users} />
        <Stat label="Signed in (30 days)" value={stats.active_last_30d} />
        <Stat label="New (7 days)" value={stats.new_last_7d} />
        <Stat label="Suspended" value={stats.suspended_users} />
      </section>

      <div className="grid2">
        <section className="panel">
          <h2>Users by role</h2>
          <div className="stack" role="img" aria-label="Users by role">
            {Object.entries(stats.by_role).map(([role, n], i) => (
              <div key={role} className={`seg seg${i % 4}`} style={{ flexGrow: n }} title={`${role}: ${n}`} />
            ))}
          </div>
          <ul className="legend">
            {Object.entries(stats.by_role).map(([role, n], i) => (
              <li key={role}>
                <span className={`dot seg${i % 4}`} /> {role}
                <strong>{n}</strong>
                <span className="muted">{Math.round((n / roleTotal) * 100)}%</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Sign-ups, last 14 days</h2>
          {stats.signups_14d.length === 0 ? (
            <p className="muted">No new accounts in this period.</p>
          ) : (
            <div className="bars">
              {stats.signups_14d.map((d) => (
                <div key={d.day} className="barcol" title={`${d.day}: ${d.n}`}>
                  <div className="bar" style={{ height: `${(d.n / maxSignup) * 100}%` }} />
                  <span>{d.day.slice(8)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Activity in the app</h2>
          <p className="muted small">Record counts only. Amounts and descriptions are never shown here.</p>
          <ul className="legend">
            {Object.entries(stats.records).map(([key, n]) => (
              <li key={key}>{RECORD_LABELS[key] ?? key}<strong>{n}</strong></li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Service status</h2>
          <ul className="legend">
            <li>Database and API<strong className="ok">Reachable{latency !== null ? ` (${latency} ms)` : ""}</strong></li>
          </ul>
          <p className="muted small">
            Edge Function logs and AI service usage are not shown yet. Check them in the Supabase dashboard.
          </p>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-n">{value.toLocaleString()}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}
