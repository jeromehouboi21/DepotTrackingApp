import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";

/** Warnungen des aktiven Depotinhabers (E9 - rechnungsrelevant, partitioniert). */
export function useWarnings(ownerId, ownersReady) {
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!ownersReady) return;
    if (!ownerId) {
      setWarnings([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("warnings")
        .select("*")
        .eq("owner_id", ownerId)
        .order("code")
        .order("isin");
      if (error) logger.error("useWarnings load failed", { message: error.message });
      if (!cancelled) {
        setWarnings(data ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version, ownerId, ownersReady]);

  const setStatus = useCallback(
    async (id, status, note) => {
      const { error } = await supabase
        .from("warnings")
        .update({
          status,
          resolution_note: note ?? null,
          resolved_at: status === "open" ? null : new Date().toISOString(),
        })
        .eq("id", id);
      if (error) logger.error("warning status update failed", { message: error.message });
      refresh();
    },
    [refresh],
  );

  const openCount = warnings.filter((w) => w.status === "open").length;

  return { warnings, openCount, loading, refresh, setStatus };
}
