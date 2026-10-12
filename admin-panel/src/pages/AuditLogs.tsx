import { useEffect, useState } from "react";
import { supabase, formatDate } from "../lib/supabase";

type Log = {
  id: number;
  created_at: string;
  action: string;
  actor_email: string | null;
  target_email: string | null;
  details: { reason?: string | null } | null;
  total_count: number;
};

const PAGE_SIZE = 25;
const ACTION_LABELS: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  suspend_user: "Suspended a user",
  reactivate_user: "Reactivated a user",
};

export default function AuditLogs() {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    supabase
      .rpc("admin_list_audit_logs", { p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE })
      .then(({ data, error: rpcError }) => {
        if (rpcError) setError("Could not load the audit log.");
        else setRows((data ?? []) as Log[]);
        setLoading(false);
      });
  }, [page]);

  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <h1>Audit log</h1>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>When</th><th>Administrator</th><th>Action</th><th>Affected user</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="muted">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="muted">No administrator actions recorded yet.</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.created_at)}</td>
                <td>{r.actor_email ?? "—"}</td>
                <td>{ACTION_LABELS[r.action] ?? r.action}</td>
                <td>{r.target_email ?? "—"}</td>
                <td>{r.details?.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="muted">Page {page + 1} of {pages}</span>
        <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </>
  );
}
