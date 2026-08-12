// Zentraler Daten-Context: ein Load fuer alle Screens, refresh() nach Korrekturen.
// E9: der aktive Depotinhaber (useOwners) wird zuerst aufgeloest, dann filtern
// usePortfolio/useWarnings/useCustody strikt danach (owner ist Partitionsschluessel,
// nicht nur ein Anzeige-Filter wie der Broker-Standort E7).
import { createContext, useContext } from "react";
import { useOwners } from "./useOwners";
import { usePortfolio } from "./usePortfolio";
import { useWarnings } from "./useWarnings";
import { useCustody } from "./useCustody";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const owners = useOwners();
  const portfolio = usePortfolio(owners.activeOwnerId, owners.ready);
  const warnings = useWarnings(owners.activeOwnerId, owners.ready);
  const custody = useCustody(owners.activeOwnerId, owners.ready);

  const refreshAll = () => {
    portfolio.refresh();
    warnings.refresh();
    custody.refresh();
  };

  return (
    <DataContext.Provider value={{ owners, portfolio, warnings, custody, refreshAll }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData ausserhalb von DataProvider");
  return ctx;
}
