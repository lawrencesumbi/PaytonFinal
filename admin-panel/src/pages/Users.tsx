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

const PAGE_SIZE = 25;

export default function Users({ adminRole }: { adminRole: AdminRole }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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

  return (
    <>
      <h1>Users</h1>
      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setSearch(input.trim());
        }}
      >
        <input placeholder="Search by name or email" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="primary">Search</button>
      </form>

      {error && <div className="alert" role="alert">{error}</div>}

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Verified</th><th>Status</th><th>Joined</th><th>Last sign-in</th>
              {adminRole === "super_admin" && <th />}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="muted">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="muted">No users match this search.</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id}>
                <td>{r.full_name || "—"}</td>
                <td>{r.email}</td>
                <td>{r.role ?? <span className="muted">Not chosen yet</span>}</td>
                <td>{r.email_verified ? "Yes" : "No"}</td>
                <td><span className={r.account_status === "active" ? "pill ok" : "pill bad"}>{r.account_status === "active" ? "Active" : "Suspended"}</span></td>
                <td>{formatDate(r.created_at)}</td>
                <td>{formatDate(r.last_sign_in_at)}</td>
                {adminRole === "super_admin" && (
                  <td>
                    <button className="linkbtn" disabled={busyId === r.id} onClick={() => changeStatus(r)}>
                      {r.account_status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="muted">Page {page + 1} of {pages} · {total} users</span>
        <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </>
  );
}
