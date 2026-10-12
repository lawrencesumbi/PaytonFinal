import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import AuditLogs from "./pages/AuditLogs";

export type AdminRole = "super_admin" | "support";
type Page = "dashboard" | "users" | "audit";

const NAV: { id: Page; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "users", label: "Users" },
  { id: "audit", label: "Audit log" },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState<Page>("dashboard");

  // Keep the session in sync.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Ask the database whether this user is an administrator.
  // (This only decides what the screen shows. The database functions enforce access themselves.)
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!userId) {
        setAdminRole(null);
        setChecking(false);
        return;
      }
      setChecking(true);
      const { data, error } = await supabase.rpc("admin_role");
      if (cancelled) return;
      if (error || !data) {
        setNotice("This account is not an administrator.");
        setAdminRole(null);
        await supabase.auth.signOut();
      } else {
        setNotice("");
        setAdminRole(data as AdminRole);
      }
      setChecking(false);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function logout() {
    await supabase.rpc("admin_log_event", { p_action: "logout" });
    await supabase.auth.signOut();
  }

  if (checking) return <div className="center">Checking access…</div>;
  if (!session || !adminRole) return <Login notice={notice} />;

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">Payton Admin</div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "navbtn active" : "navbtn"}
              onClick={() => setPage(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="who">
          <div className="who-email">{session.user.email}</div>
          <div className="who-role">{adminRole === "super_admin" ? "Super admin" : "Support (read-only)"}</div>
          <button className="linkbtn" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        {page === "dashboard" && <Dashboard />}
        {page === "users" && <Users adminRole={adminRole} />}
        {page === "audit" && <AuditLogs />}
      </main>
    </div>
  );
}
