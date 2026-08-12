import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";

const DEFAULT_BROKERS = [
  { id: "comdirect", name: "comdirect", color: "#005EA8", sort_order: 1 },
  { id: "scalable", name: "Scalable Capital", color: "#1A1A2E", sort_order: 2 },
];

/**
 * brokers sind globale Stammdaten (E9: kein owner_id, gemeinsam fuer alle
 * Depotinhaber). holding_custody ("Was liegt wo?") ist je Inhaber verschieden
 * (E7 bleibt gueltig, aber E9-partitioniert) und wird nach ownerId gefiltert.
 */
export function useCustody(ownerId, ownersReady) {
  const [brokers, setBrokers] = useState([]);
  const [custody, setCustody] = useState([]); // holding_custody rows des aktiven Inhabers
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const brokersPromise = supabase.from("brokers").select("*").order("sort_order");
      const custodyPromise =
        ownersReady && ownerId
          ? supabase.from("holding_custody").select("*").eq("owner_id", ownerId)
          : Promise.resolve({ data: [], error: null });
      const [{ data: b, error: be }, { data: c, error: ce }] = await Promise.all([brokersPromise, custodyPromise]);
      if (be) logger.error("brokers load failed", { message: be.message });
      if (ce) logger.error("custody load failed", { message: ce.message });
      if (!cancelled) {
        setBrokers(b ?? []);
        setCustody(c ?? []); // [] solange ownersReady=false (custodyPromise s.o.)
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version, ownerId, ownersReady]);

  const ensureDefaultBrokers = useCallback(async (userId) => {
    const { data } = await supabase.from("brokers").select("id");
    if (data && data.length > 0) return;
    await supabase
      .from("brokers")
      .upsert(DEFAULT_BROKERS.map((b) => ({ ...b, user_id: userId, active: true })));
  }, []);

  // Standort setzen: eine Zeile je ISIN JE INHABER (UI-Default Einzelauswahl, E7/§13;
  // owner_id-Scoping ist Pflicht seit E9, sonst wuerden Custody-Zeilen anderer
  // Inhaber fuer dieselbe ISIN geloescht/kollidieren).
  const setBrokerFor = useCallback(
    async (userId, ownerIdForRow, isin, brokerId, extra = {}) => {
      const { error: delErr } = await supabase
        .from("holding_custody")
        .delete()
        .eq("isin", isin)
        .eq("owner_id", ownerIdForRow);
      if (delErr) logger.error("custody delete failed", { message: delErr.message });
      const { error } = await supabase.from("holding_custody").insert({
        user_id: userId,
        owner_id: ownerIdForRow,
        isin,
        broker_id: brokerId,
        status: extra.status ?? "settled",
        target_broker_id: extra.target_broker_id ?? null,
        note: extra.note ?? null,
      });
      if (error) logger.error("custody insert failed", { message: error.message });
      refresh();
    },
    [refresh],
  );

  const custodyByIsin = {};
  for (const row of custody) {
    (custodyByIsin[row.isin] ??= []).push(row);
  }

  return { brokers, custody, custodyByIsin, loading, refresh, setBrokerFor, ensureDefaultBrokers };
}
