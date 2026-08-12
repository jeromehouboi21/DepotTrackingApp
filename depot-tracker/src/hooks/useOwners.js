import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";

// E9: welcher Depotinhaber gerade aktiv ist, ist reine UI-Vorliebe -
// localStorage, gleiches Muster wie die groupBy-/Jahres-Persistenz.
const OWNER_KEY = "depot-tracker:activeOwnerId";

function loadStoredOwnerId() {
  try {
    return localStorage.getItem(OWNER_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Laedt depot_owners und haelt den aktiven Inhaber (E9). Der Inhaber ist ein
 * harter Partitionsschluessel (nicht nur ein Etikett wie der Broker-Standort,
 * E7): FIFO/Kostenbasis/G-V laufen je Inhaber getrennt (usePortfolio etc.
 * filtern nach activeOwnerId, bevor die Engine aufgerufen wird).
 */
export function useOwners() {
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [selectedOwnerId, setSelectedOwnerId] = useState(loadStoredOwnerId);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("depot_owners")
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) logger.error("depot_owners load failed", { message: error.message });
      if (!cancelled) {
        setOwners(data ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  // Gespeicherte/gewaehlte owner_id gegen die tatsaechlich geladenen (aktiven)
  // Inhaber pruefen; ungueltig/leer -> erster aktiver Inhaber. Rein abgeleitet
  // (kein Render-Flash), analog zum activeYears-Muster in RealizedScreen.
  const activeOwners = owners.filter((o) => o.active !== false);
  const valid = selectedOwnerId && activeOwners.some((o) => o.id === selectedOwnerId);
  const activeOwnerId = valid ? selectedOwnerId : (activeOwners[0]?.id ?? null);
  const activeOwner = owners.find((o) => o.id === activeOwnerId) ?? null;

  useEffect(() => {
    if (loading || !activeOwnerId) return; // vor dem Laden/ohne Inhaber nichts schreiben
    try {
      localStorage.setItem(OWNER_KEY, activeOwnerId);
    } catch {
      /* Persistenz optional - Fehler bewusst schlucken */
    }
  }, [activeOwnerId, loading]);

  const setActiveOwnerId = useCallback((id) => setSelectedOwnerId(id), []);

  const createOwner = useCallback(
    async (userId, slug, name) => {
      const { error } = await supabase.from("depot_owners").insert({
        user_id: userId, id: slug, name, active: true, sort_order: (owners.length + 1) * 10,
      });
      if (error) logger.error("depot_owners create failed", { message: error.message });
      refresh();
      return slug;
    },
    [owners.length, refresh],
  );

  const renameOwner = useCallback(
    async (id, name) => {
      const { error } = await supabase.from("depot_owners").update({ name }).eq("id", id);
      if (error) logger.error("depot_owners rename failed", { message: error.message });
      refresh();
    },
    [refresh],
  );

  const toggleActiveOwner = useCallback(
    async (owner) => {
      const { error } = await supabase
        .from("depot_owners")
        .update({ active: !(owner.active !== false) })
        .eq("id", owner.id);
      if (error) logger.error("depot_owners toggle failed", { message: error.message });
      refresh();
    },
    [refresh],
  );

  return {
    owners,
    activeOwners,
    activeOwnerId,
    activeOwner,
    // true, sobald der erste depot_owners-Ladevorgang abgeschlossen ist (auch bei 0 Inhabern) -
    // Signal fuer usePortfolio/useWarnings/useCustody, dass "kein Inhaber" ein echter Zustand ist.
    ready: !loading,
    loading,
    setActiveOwnerId,
    createOwner,
    renameOwner,
    toggleActiveOwner,
    refresh,
  };
}
