import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";

const DEFAULT_BROKERS = [
  { id: "comdirect", name: "comdirect", color: "#005EA8", sort_order: 1 },
  { id: "scalable", name: "Scalable Capital", color: "#1A1A2E", sort_order: 2 },
];

export function useCustody() {
  const [brokers, setBrokers] = useState([]);
  const [custody, setCustody] = useState([]); // holding_custody rows
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: b, error: be }, { data: c, error: ce }] = await Promise.all([
        supabase.from("brokers").select("*").order("sort_order"),
        supabase.from("holding_custody").select("*"),
      ]);
      if (be) logger.error("brokers load failed", { message: be.message });
      if (ce) logger.error("custody load failed", { message: ce.message });
      if (!cancelled) {
        setBrokers(b ?? []);
        setCustody(c ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const ensureDefaultBrokers = useCallback(async (userId) => {
    const { data } = await supabase.from("brokers").select("id");
    if (data && data.length > 0) return;
    await supabase
      .from("brokers")
      .upsert(DEFAULT_BROKERS.map((b) => ({ ...b, user_id: userId, active: true })));
  }, []);

  // Standort setzen: eine Zeile je ISIN (UI-Default Einzelauswahl, E7/§13)
  const setBrokerFor = useCallback(
    async (userId, isin, brokerId, extra = {}) => {
      const { error: delErr } = await supabase.from("holding_custody").delete().eq("isin", isin);
      if (delErr) logger.error("custody delete failed", { message: delErr.message });
      const { error } = await supabase.from("holding_custody").insert({
        user_id: userId,
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
