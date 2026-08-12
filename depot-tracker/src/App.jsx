import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { DataProvider, useData } from "./hooks/useData";
import { AppShell } from "./components/layout/AppShell";
import { AuthScreen } from "./screens/auth/AuthScreen";
import { DashboardScreen } from "./screens/dashboard/DashboardScreen";
import { PositionsScreen } from "./screens/positions/PositionsScreen";
import { SecurityDetailScreen } from "./screens/positions/SecurityDetailScreen";
import { SavingsPlanScreen } from "./screens/savingsplan/SavingsPlanScreen";
import { RealizedScreen } from "./screens/realized/RealizedScreen";
import { WarningsScreen } from "./screens/warnings/WarningsScreen";
import { BrokersScreen } from "./screens/brokers/BrokersScreen";
import { OwnersScreen } from "./screens/owners/OwnersScreen";
import { ImportScreen } from "./screens/import/ImportScreen";

function Shell({ onSignOut }) {
  const { warnings, owners } = useData();
  return <AppShell openWarnings={warnings.openCount} owners={owners} onSignOut={onSignOut} />;
}

export default function App() {
  const auth = useAuth();

  if (!auth.configured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-surface rounded-xl border border-surface-2 p-8 max-w-md text-center">
          <h1 className="text-xl mb-2">Depot-Tracker</h1>
          <p className="text-sm text-ink-2">
            Supabase ist nicht konfiguriert. Bitte <code>.env.local</code> mit{" "}
            <code>VITE_SUPABASE_URL</code> und <code>VITE_SUPABASE_ANON_KEY</code> anlegen
            (siehe <code>.env.example</code>) und neu starten.
          </p>
        </div>
      </div>
    );
  }

  if (auth.loading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-3">Lade…</div>;
  }

  if (!auth.user) {
    return <AuthScreen onSignIn={auth.signIn} />;
  }

  return (
    <DataProvider>
      <Routes>
        <Route element={<Shell onSignOut={auth.signOut} />}>
          <Route path="/" element={<DashboardScreen />} />
          <Route path="/positionen" element={<PositionsScreen />} />
          <Route path="/wertpapier/:isin" element={<SecurityDetailScreen user={auth.user} />} />
          <Route path="/sparplan" element={<SavingsPlanScreen user={auth.user} />} />
          <Route path="/realisiert" element={<RealizedScreen />} />
          <Route path="/warnungen" element={<WarningsScreen user={auth.user} />} />
          <Route path="/broker" element={<BrokersScreen user={auth.user} />} />
          <Route path="/inhaber" element={<OwnersScreen user={auth.user} />} />
          <Route path="/import" element={<ImportScreen user={auth.user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}
