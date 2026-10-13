import { useCallback, useEffect, useState } from "react";
import { supabase, formatDate } from "../lib/supabase";
import type { AdminRole } from "../App";

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  account_status: "active" | "suspended";
  email_verified: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  total_count: number;
};

const PAGE_SIZE = 10;

export default function Users({ adminRole }: { adminRole: AdminRole }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("admin_list_users", {
      p_search: search,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (rpcError) setError("Could not load users.");
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [search, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(row: Row) {
    const suspending = row.account_status === "active";
    const label = row.email ?? row.id;
    if (!window.confirm(`${suspending ? "Suspend" : "Reactivate"} ${label}?`)) return;
    const reason = suspending ? window.prompt("Reason (saved in the audit log):") ?? "" : "";
    setBusyId(row.id);
    const { error: fnError } = await supabase.functions.invoke("admin-set-status", {
      body: { userId: row.id, status: suspending ? "suspended" : "active", reason },
    });
    setBusyId(null);
    if (fnError) {
      let message = "The action failed.";
      try {
        const body = await (fnError as any).context.json();
        if (body?.error) message = body.error;
      } catch {
        /* keep the generic message */
      }
      setError(message);
      return;
    }
    load();
  }

  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const activeCount = rows.filter((r) => r.account_status === "active").length;
  const suspendedCount = rows.filter((r) => r.account_status === "suspended").length;

  const filteredRows = rows.filter((r) => {
    if (statusFilter === "active") return r.account_status === "active";
    if (statusFilter === "suspended") return r.account_status === "suspended";
    return true;
  }).sort((a, b) => {
    if (sortBy === "name") {
      const nameA = a.full_name || "";
      const nameB = b.full_name || "";
      return nameA.localeCompare(nameB);
    } else if (sortBy === "joined") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    return 0;
  });

  return (
    <div className="ref-dashboard-container">
      <div className="ref-top-header">
        <div>
          <h1 className="ref-page-title">User Management</h1>
          <div className="ref-breadcrumbs">Dashboard / <span className="current">Users</span></div>
        </div>
      </div>

      <div className="ref-metrics-grid">
        <div className="ref-stat-card">
          <div className="ref-stat-icon emerald">👥</div>
          <div>
            <div className="ref-stat-value">{total}</div>
            <div className="ref-stat-label">Total Users</div>
          </div>
        </div>
        <div className="ref-stat-card">
          <div className="ref-stat-icon teal">🟢</div>
          <div>
            <div className="ref-stat-value">{activeCount}</div>
            <div className="ref-stat-label">Active</div>
          </div>
        </div>
        <div className="ref-stat-card">
          <div className="ref-stat-icon dark">🔴</div>
          <div>
            <div className="ref-stat-value">{suspendedCount}</div>
            <div className="ref-stat-label">Suspended</div>
          </div>
        </div>
      </div>

      {error && <div className="ref-alert-box" role="alert">{error}</div>}

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">System Users</h3>
            <p className="ref-panel-sub">Monitor and manage user accounts, verification, and permissions.</p>
          </div>

          <div className="ref-controls-group">
            <form
              className="ref-search-form"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(0);
                setSearch(input.trim());
              }}
            >
              <input 
                className="ref-search-input"
                placeholder="Search user..." 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
              />
              <button className="ref-search-btn" type="submit">Search</button>
            </form>

            <div className="ref-dropdown-wrapper">
              <select 
                className="ref-select-control"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Filter: All Status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            <div className="ref-dropdown-wrapper">
              <select 
                className="ref-select-control"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="name">Sort by: Name</option>
                <option value="joined">Sort by: Joined Date</option>
              </select>
            </div>
          </div>
        </div>

        <div className="tablewrap">
          <table className="ref-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Verified</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Last sign-in</th>
                {adminRole === "super_admin" && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="ref-state-cell">Loading users…</td>
                </tr>
              )}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="ref-state-cell">No users match this search or filter.</td>
                </tr>
              )}
              {!loading && filteredRows.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.full_name || "—"}</td>
                  <td>{r.email}</td>
                  <td>{r.role ?? <span className="ref-muted">Not chosen yet</span>}</td>
                  <td>
                    <span className={r.email_verified ? "ref-badge-yes" : "ref-muted"}>
                      {r.email_verified ? "Yes" : "No"}
                    </span>
                  </td>
                  <td>
                    <span className={r.account_status === "active" ? "ref-pill-active" : "ref-pill-suspended"}>
                      {r.account_status === "active" ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td>{formatDate(r.created_at)}</td>
                  <td>{formatDate(r.last_sign_in_at)}</td>
                  {adminRole === "super_admin" && (
                    <td className="text-right">
                      <button 
                        className={`ref-action-btn ${r.account_status === "active" ? "ref-btn-suspend" : "ref-btn-reactivate"}`}
                        disabled={busyId === r.id} 
                        onClick={() => changeStatus(r)}
                      >
                        {r.account_status === "active" ? "Suspend" : "Reactivate"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ref-table-footer">
          <div className="ref-show-info">
            Show <span className="font-semibold">{filteredRows.length}</span> of <span className="font-semibold">{total}</span> results
          </div>
          <div className="ref-pager">
            <button 
              className="ref-page-btn" 
              disabled={page === 0} 
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span className="ref-page-indicator">Page {page + 1} of {pages}</span>
            <button 
              className="ref-page-btn" 
              disabled={page + 1 >= pages} 
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}