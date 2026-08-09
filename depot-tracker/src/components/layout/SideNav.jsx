import { NavLink } from "react-router-dom";

const ITEMS = [
  { to: "/", label: "Dashboard", exact: true },
  { to: "/positionen", label: "Positionen" },
  { to: "/sparplan", label: "Sparplan" },
  { to: "/realisiert", label: "Realisiert" },
  { to: "/warnungen", label: "Warnungen", badgeKey: "warnings" },
  { to: "/broker", label: "Broker" },
  { to: "/import", label: "Import" },
];

export function SideNav({ openWarnings = 0, onSignOut }) {
  return (
    <nav className="flex md:flex-col gap-1 md:w-48 shrink-0 md:min-h-screen bg-surface border-r border-surface-2 p-3 overflow-x-auto">
      <div className="hidden md:block mb-4 px-2">
        <div className="font-display text-xl text-accent">Depot-Tracker</div>
      </div>
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
