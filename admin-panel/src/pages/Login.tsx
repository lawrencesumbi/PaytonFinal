import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login({ notice }: { notice: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setError("Email or password is incorrect.");
    } else {
      // Recorded only if this account is an administrator (the database rejects anyone else).
      await supabase.rpc("admin_log_event", { p_action: "login" });
    }
    setBusy(false);
  }

  return (
    <div className="center">
      <form className="login" onSubmit={onSubmit}>
        <h1>Payton Admin</h1>
        <p className="muted">Sign in with your administrator account.</p>
        {(error || notice) && <div className="alert" role="alert">{error || notice}</div>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
