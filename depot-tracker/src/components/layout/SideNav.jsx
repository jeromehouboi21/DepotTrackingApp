import { NavLink } from "react-router-dom";

const ITEMS = [
  { to: "/", label: "Dashboard", exact: true },
  { to: "/positionen", label: "Positionen" },
  { to: "/sparplan", label: "Sparplan" },
  { to: "/realisiert", label: "Realisiert" },
  { to: "/warnungen", label: "Warnungen", badgeKey: "warnings" },
  { to: "/broker", label: "Broker" },
  { to: "/inhaber", label: "Inhaber" },
  { to: "/import", label: "Import" },
  { to: "/import/kurse", label: "Kurs-Batch" },
];

/** Inhaber-Umschalter (E9) - global sichtbar, damit jederzeit klar ist, wessen
 *  Depot man gerade sieht. Wechsel rechnet alle Screens auf den neuen Inhaber um. */
function OwnerSwitcher({ owners }) {
  if (owners.loading) return null;
  if (!owners.owners.length) {
    return (
      <NavLink to="/import" className="block px-2 py-1.5 text-xs text-warn hover:underline">
        Kein Inhaber angelegt – im Import anlegen
      </NavLink>
    );
  }
  return (
    <div className="px-2 mb-2">
      <label className="text-[10px] uppercase tracking-wide text-ink-3 block mb-0.5">Inhaber</label>
      <select
        value={owners.activeOwnerId ?? ""}
        onChange={(e) => owners.setActiveOwnerId(e.target.value)}
        className="w-full rounded border border-surface-2 bg-surface text-ink text-sm px-1.5 py-1"
      >
        {owners.activeOwners.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </div>
  );
}

export function SideNav({ openWarnings = 0, owners, onSignOut }) {
  return (
    <nav className="flex md:flex-col gap-1 md:w-48 shrink-0 md:min-h-screen bg-surface border-r border-surface-2 p-3 overflow-x-auto">
      <div className="hidden md:block mb-4 px-2">
        <div className="font-display text-xl text-accent">Depot-Tracker</div>
      </div>
      {owners && <OwnerSwitcher owners={owners} />}
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          className={({ isActive }) =>
            `flex items-center justify-between rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              isActive ? "bg-accent text-white font-medium" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`
          }
        >
          <span>{item.label}</span>
          {item.badgeKey === "warnings" && openWarnings > 0 && (
            <span className="ml-2 rounded-full bg-warn text-white text-[10px] px-1.5 py-0.5 tnum">
              {openWarnings}
            </span>
          )}
        </NavLink>
      ))}
      <div className="md:mt-auto md:pt-4">
        <button
          onClick={onSignOut}
          className="rounded-lg px-3 py-1.5 text-sm text-ink-3 hover:text-ink hover:bg-surface-2 w-full text-left whitespace-nowrap"
        >
          Abmelden
        </button>
      </div>
    </nav>
  );
}
