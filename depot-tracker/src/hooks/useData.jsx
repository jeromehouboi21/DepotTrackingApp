// Zentraler Daten-Context: ein Load fuer alle Screens, refresh() nach Korrekturen.
import { createContext, useContext } from "react";
import { usePortfolio } from "./usePortfolio";
import { useWarnings } from "./useWarnings";
import { useCustody } from "./useCustody";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const portfolio = usePortfolio();
  const warnings = useWarnings();
  const custody = useCustody();

  const refreshAll = () => {
    portfolio.refresh();
    warnings.refresh();
    custody.refresh();
  };

  return (
    <DataContext.Provider value={{ portfolio, warnings, custody, refreshAll }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData ausserhalb von DataProvider");
  return ctx;
}
