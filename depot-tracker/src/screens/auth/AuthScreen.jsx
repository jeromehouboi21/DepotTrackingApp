import { useState } from "react";
import { Button } from "../../components/ui/Button";

export function AuthScreen({ onSignIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await onSignIn(email, password);
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="bg-surface rounded-xl border border-surface-2 p-8 w-full max-w-sm">
        <h1 className="text-2xl mb-1 text-accent">Depot-Tracker</h1>
        <p className="text-sm text-ink-2 mb-6">Private Finanz-App – bitte anmelden.</p>
        <label className="block text-sm text-ink-2 mb-1">E-Mail</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-surface-2 px-3 py-2 text-sm mb-3 bg-bg"
        />
        <label className="block text-sm text-ink-2 mb-1">Passwort</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-surface-2 px-3 py-2 text-sm mb-4 bg-bg"
        />
        {error && <div className="text-sm text-loss mb-3">{error}</div>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Anmelden…" : "Anmelden"}
        </Button>
      </form>
    </div>
  );
}
