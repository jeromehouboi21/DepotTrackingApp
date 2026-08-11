// ============================================================================
// Depot-Tracker Berechnungs-Engine (DESIGN §8)
// Reines TypeScript, deterministisch, kein Netz, keine DB.
// E1: Die App ist die Recheninstanz - transactions + Overrides -> FIFO ->
//     Positionen, realisierte/unrealisierte G/V, Per-Lot-Renditen.
// Die FIFO-Semantik entspricht dem Parser (depot-parser/core/fifo.py), damit
// der Parity-Test gegen portfolio_seed besteht: BUY-Kostenbasis = |net|,
// INTERNAL_TRANSFER wird neutralisiert, bei vorhandenem reported_realized_pl
// ist der gemeldete Bankwert massgeblich.
// ============================================================================

import { classifyObjectType, type ObjectType } from "./classify";

export interface Transaction {
  id: string;
  source: string;
  date: string;
  type: "BUY" | "SELL" | "TRANSFER_IN" | "TRANSFER_OUT" | "CASH";
  isin: string | null;
  wkn: string | null;
  name: string | null;
  shares: number;
  price: number;
  gross: number;
  fees: number;
  tax: number;
  net: number;
  currency: string;
  raw_ref: string;
  reported_realized_pl: number | null;
  cost_lots: Array<{ date: string; shares: number; cost: number }>;
  flags: string[];
}

export interface TransactionOverride {
  transaction_id: string;
  patch: Partial<Transaction>;
}

export interface ManualCostLot {
  id?: string;
  isin: string;
  date: string;
  shares: number;
  cost: number;
  note?: string | null;
}

export interface TransferLink {
  id?: string;
  out_transaction_id: string;
  in_transaction_id: string | null;
  carried_cost_basis: number | null;
}

export interface SecurityMeta {
  isin: string;
  is_savings_plan?: boolean | null;
  asset_class?: string | null;
  display_name?: string | null;
  name?: string | null;
  object_type?: string | null;
  figi_security_type?: string | null;
}

export interface PriceInfo {
  price: number;
  as_of: string | null;
  source?: string;
  isOverride?: boolean;
}

export interface Lot {
  date: string;
  shares: number;
  cost_per_share: number;
  tx_id: string;
  isManual: boolean;
}

export interface AllocatedLot {
  date: string;
  shares: number;
  cost: number;
  tx_id: string;
}

export interface SellRecord {
  tx_id: string;
  isin: string;
  name: string | null;
  date: string;
  year: string;
  shares: number;
  proceeds: number; // Netto-Erloes (net, vor Steuern)
  fees: number;
  tax: number;
  matchedCost: number | null; // null wenn keine Kostenbasis
  ownRealized: number | null;
  reported: number | null;
  realized: number | null; // massgeblich: reported ?? ownRealized
  mismatch: boolean;
  noCostBasis: boolean;
  allocatedLots: AllocatedLot[];
}

export interface OpenLotView extends Lot {
  costBasis: number;
  marketValue: number | null;
  unrealizedPl: number | null;
  unrealizedPct: number | null;
  holdingDays: number;
  annualizedPct: number | null;
}

export interface Position {
  isin: string;
  wkn: string | null;
  name: string | null;
  sources: string[];
  assetClass: "equity" | "fund_etf" | "bond" | "other";
  objectType: ObjectType;
  isSavingsPlan: boolean;
  flags: string[];
  sharesHeld: number;
  openLots: OpenLotView[];
  costBasisRemaining: number;
  avgCost: number;
  currentPrice: number | null;
  priceAsOf: string | null;
  priceIsOverride: boolean;
  marketValue: number | null;
  unrealizedPl: number | null;
  unrealizedPct: number | null;
  realizedPl: number;
  realizedPlReported: number | null;
  realizedMatches: boolean;
  hasUnknownCostBasis: boolean;
  sells: SellRecord[];
  totalBuyFees: number;
  totalSellFees: number;
  totalTransferFees: number;
  totalFees: number;
  totalTax: number;
  totalInvested: number;
  txIds: string[];
  txCount: number;
}

export interface YearAggregate {
  year: string;
  realizedPl: number;
  proceeds: number;
  cost: number;
  fees: number;
  tax: number;
  count: number;
  sells: SellRecord[];
  excludedNoCostBasis: number; // Anzahl Verkaeufe ohne Kostenbasis (nicht in Summe)
}

export interface CashRecord {
  tx_id: string;
  date: string;
  name: string | null;
  isin: string | null;
  net: number;
  kind: "distribution" | "interest" | "other";
}

export interface PortfolioResult {
  positions: Position[];
  byYear: Record<string, YearAggregate>;
  sellYears: string[];
  cash: CashRecord[];
  income: number; // Distribution + Interest
  totals: {
    marketValue: number;
    costBasis: number;
    unrealizedPl: number;
    realizedPl: number;
    feesAllTime: number;
    taxAllTime: number;
    heldCount: number;
    pricedCount: number;
    priceCoverage: number;
  };
  fifoMismatches: Array<{ isin: string; tx_id: string; own: number; reported: number }>;
  noCostBasisSells: SellRecord[];
}

const TOL = 0.01;
const EPS = 1e-9;

// ---------------------------------------------------------------------------

export function applyOverrides(
  transactions: Transaction[],
  overrides: TransactionOverride[],
): Transaction[] {
  if (!overrides?.length) return transactions;
  const byId = new Map(overrides.map((o) => [o.transaction_id, o.patch]));
  return transactions.map((t) => {
    const patch = byId.get(t.id);
    return patch ? { ...t, ...patch } : t;
  });
}

export function detectAssetClass(tx: { flags?: string[]; name?: string | null }): Position["assetClass"] {
  if (tx.flags?.includes("BOND_NOMINAL")) return "bond";
  const n = (tx.name ?? "").toUpperCase();
  if (/ETF|UCITS|XTRACKERS|XTR\.|ISHARES|ISHS|AMUNDI|LYX|SPDR|VANGUARD|FONDS|FD[-\s]|INH\.ANT|DWS |MSCI/.test(n)) {
    return "fund_etf";
  }
  return "equity";
}

// E4: Sparplan-Heuristik - >=5 Kaeufe mit Bruchstuecken deuten auf Sparplan.
// Manueller Override (securities.is_savings_plan) gewinnt immer.
export function detectSavingsPlan(buys: Transaction[]): boolean {
  const fractional = buys.filter((b) => Math.abs(b.shares % 1) > EPS);
  return fractional.length >= 5;
}

function classifyCash(t: Transaction): CashRecord["kind"] {
  if (t.isin) return "distribution";
  const n = (t.name ?? "").toLowerCase();
  if (/zins|interest/.test(n)) return "interest";
  return "other";
}

function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso + "T00:00:00");
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
}

// ---------------------------------------------------------------------------

export function computePortfolio(input: {
  transactions: Transaction[];
  overrides?: TransactionOverride[];
  manualCostLots?: ManualCostLot[];
  transferLinks?: TransferLink[];
  prices?: Record<string, PriceInfo>;
  securityMeta?: Record<string, SecurityMeta>;
  today?: Date;
}): PortfolioResult {
  const {
    overrides = [],
    manualCostLots = [],
    transferLinks = [],
    prices = {},
    securityMeta = {},
    today = new Date(),
  } = input;

  // S0: Overrides anwenden
  const txs = applyOverrides(input.transactions, overrides);

  const linksByOut = new Map(transferLinks.map((l) => [l.out_transaction_id, l]));
  const linksByIn = new Map(
    transferLinks.filter((l) => l.in_transaction_id).map((l) => [l.in_transaction_id as string, l]),
  );

  // S1: Gruppieren je ISIN
  const byIsin = new Map<string, Transaction[]>();
  const cash: CashRecord[] = [];
  for (const t of txs) {
    if (t.type === "CASH" || !t.isin) {
      if (t.type === "CASH") {
        cash.push({ tx_id: t.id, date: t.date, name: t.name, isin: t.isin, net: t.net, kind: classifyCash(t) });
      }
      continue;
    }
    let arr = byIsin.get(t.isin);
    if (!arr) byIsin.set(t.isin, (arr = []));
    arr.push(t);
  }

  const manualByIsin = new Map<string, ManualCostLot[]>();
  for (const m of manualCostLots) {
    let arr = manualByIsin.get(m.isin);
    if (!arr) manualByIsin.set(m.isin, (arr = []));
    arr.push(m);
  }

  const positions: Position[] = [];
  const allSells: SellRecord[] = [];
  const fifoMismatches: PortfolioResult["fifoMismatches"] = [];

  const typeOrder = (t: Transaction) =>
    t.type === "BUY" || t.type === "TRANSFER_IN" ? 0 : t.type === "SELL" ? 1 : 2;

  for (const [isin, list] of [...byIsin.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // Chronologisch; bei Datumsgleichstand BUY vor SELL (S1)
    const sorted = [...list].sort(
      (a, b) => a.date.localeCompare(b.date) || typeOrder(a) - typeOrder(b) || a.id.localeCompare(b.id),
    );

    // Manuelle Lots als pseudo-Kaeufe einsortieren
    type Event = { kind: "tx"; tx: Transaction } | { kind: "manual"; lot: ManualCostLot };
    const events: Event[] = sorted.map((tx) => ({ kind: "tx", tx }));
    for (const m of manualByIsin.get(isin) ?? []) {
      events.push({ kind: "manual", lot: m });
    }
    events.sort((a, b) => {
      const da = a.kind === "tx" ? a.tx.date : a.lot.date;
      const db = b.kind === "tx" ? b.tx.date : b.lot.date;
      if (da !== db) return da.localeCompare(db);
      const oa = a.kind === "manual" ? -1 : typeOrder(a.tx);
      const ob = b.kind === "manual" ? -1 : typeOrder(b.tx);
      return oa - ob;
    });

    const lots: Lot[] = [];
    const sells: SellRecord[] = [];
    let realizedTotal = 0;
    let reportedTotal = 0;
    let hasReported = false;
    let allMatch = true;
    let hasUnknownCostBasis = false;
    let totalBuyFees = 0;
    let totalSellFees = 0;
    let totalTransferFees = 0;
    let totalTax = 0;
    let totalInvested = 0;
    let name: string | null = null;
    let wkn: string | null = null;
    const sources = new Set<string>();
    const flags = new Set<string>();
    const txIds: string[] = [];
    const buys: Transaction[] = [];

    for (const ev of events) {
      if (ev.kind === "manual") {
        const m = ev.lot;
        if (m.shares > EPS) {
          lots.push({
            date: m.date,
            shares: m.shares,
            cost_per_share: m.cost / m.shares,
            tx_id: m.id ?? "manual",
            isManual: true,
          });
          totalInvested += m.cost;
        }
        continue;
      }

      const t = ev.tx;
      txIds.push(t.id);
      sources.add(t.source);
      for (const f of t.flags ?? []) flags.add(f);
      if (t.name) name = t.name;
      if (t.wkn) wkn = t.wkn;
      totalTax += t.tax || 0;

      switch (t.type) {
        case "BUY": {
          buys.push(t);
          totalBuyFees += t.fees || 0;
          if (t.shares > EPS) {
            const cost = Math.abs(t.net);
            lots.push({
              date: t.date,
              shares: t.shares,
              cost_per_share: cost / t.shares,
              tx_id: t.id,
              isManual: false,
            });
            totalInvested += cost;
          }
          break;
        }

        case "TRANSFER_IN": {
          totalTransferFees += t.fees || 0;
          // INTERNAL_TRANSFER: neutral - die urspruenglichen Kauf-Lots bleiben offen (E8).
          if (t.flags?.includes("INTERNAL_TRANSFER")) break;
          const link = linksByIn.get(t.id);
          if (link?.carried_cost_basis != null && t.shares > EPS) {
            lots.push({
              date: t.date,
              shares: t.shares,
              cost_per_share: link.carried_cost_basis / t.shares,
              tx_id: t.id,
              isManual: false,
            });
            totalInvested += link.carried_cost_basis;
          } else {
            // ohne Link/Basis: Bestand entsteht, Kostenbasis unbekannt
            hasUnknownCostBasis = true;
            if (t.shares > EPS) {
              lots.push({ date: t.date, shares: t.shares, cost_per_share: 0, tx_id: t.id, isManual: false });
            }
          }
          break;
        }

        case "TRANSFER_OUT": {
          totalTransferFees += t.fees || 0;
          // INTERNAL_TRANSFER: neutral (Gegenseite comdirect-Eingang, Lots bleiben).
          if (t.flags?.includes("INTERNAL_TRANSFER")) {
            const link = linksByOut.get(t.id);
            if (!link) break; // Default: neutralisiert wie im Parser
            // Verlinkt mit externem Ziel ("kein Ziel"): Lots abbauen ohne G/V
            if (link.in_transaction_id === null) {
              consumeLots(lots, t.shares);
            }
            break;
          }
          // Externer Uebertrag: Lots abbauen ohne G/V
          consumeLots(lots, t.shares);
          break;
        }

        case "SELL": {
          totalSellFees += t.fees || 0;
          const available = lots.reduce((s, l) => s + l.shares, 0);
          let matchedCost: number | null = null;
          let ownRealized: number | null = null;
          let noCostBasis = false;
          const allocated: AllocatedLot[] = [];

          if (available <= EPS) {
            noCostBasis = true;
            hasUnknownCostBasis = true;
          } else {
            if (available + EPS < t.shares) hasUnknownCostBasis = true;
            let remaining = t.shares;
            let cost = 0;
            while (remaining > EPS && lots.length) {
              const lot = lots[0];
              const take = Math.min(lot.shares, remaining);
              cost += take * lot.cost_per_share;
              allocated.push({ date: lot.date, shares: take, cost: take * lot.cost_per_share, tx_id: lot.tx_id });
              lot.shares -= take;
              remaining -= take;
              if (lot.shares <= EPS) lots.shift();
            }
            matchedCost = cost;
            ownRealized = t.net - cost;
          }

          const reported = t.reported_realized_pl;
          let mismatch = false;
          if (reported != null) {
            hasReported = true;
            reportedTotal += reported;
            if (ownRealized != null && Math.abs(ownRealized - reported) > TOL) {
              mismatch = true;
              allMatch = false;
              fifoMismatches.push({ isin, tx_id: t.id, own: ownRealized, reported });
            }
          }
          const realized = reported ?? ownRealized;
          if (realized != null) realizedTotal += realized;

          const rec: SellRecord = {
            tx_id: t.id,
            isin,
            name: t.name,
            date: t.date,
            year: t.date.slice(0, 4),
            shares: t.shares,
            proceeds: t.net,
            fees: t.fees || 0,
            tax: t.tax || 0,
            matchedCost,
            ownRealized,
            reported,
            realized,
            mismatch,
            noCostBasis,
            allocatedLots: allocated,
          };
          sells.push(rec);
          allSells.push(rec);
          break;
        }
      }
    }

    const meta = securityMeta[isin];
    const openLotsRaw = lots.filter((l) => l.shares > EPS);
    const sharesHeld = openLotsRaw.reduce((s, l) => s + l.shares, 0);
    const costBasisRemaining = openLotsRaw.reduce((s, l) => s + l.shares * l.cost_per_share, 0);
    const avgCost = sharesHeld > EPS ? costBasisRemaining / sharesHeld : 0;

    const priceInfo = prices[isin];
    const currentPrice = priceInfo?.price ?? null;
    const marketValue = currentPrice != null && sharesHeld > EPS ? sharesHeld * currentPrice : null;
    const unrealizedPl =
      marketValue != null && !hasUnknownCostBasis ? marketValue - costBasisRemaining : marketValue != null ? null : null;

    const openLots: OpenLotView[] = openLotsRaw.map((l) => {
      const costBasis = l.shares * l.cost_per_share;
      const mv = currentPrice != null ? l.shares * currentPrice : null;
      const pl = mv != null ? mv - costBasis : null;
      const pct = pl != null && costBasis > EPS ? pl / costBasis : null;
      const holdingDays = daysBetween(l.date, today);
      const annualizedPct =
        pct != null && holdingDays >= 30 ? Math.pow(1 + pct, 365 / holdingDays) - 1 : null;
      return { ...l, costBasis, marketValue: mv, unrealizedPl: pl, unrealizedPct: pct, holdingDays, annualizedPct };
    });

    const isSavingsPlan =
      meta?.is_savings_plan != null ? meta.is_savings_plan : detectSavingsPlan(buys);
    const resolvedName = meta?.display_name ?? meta?.name ?? name;
    const assetClass =
      (meta?.asset_class as Position["assetClass"]) ??
      detectAssetClass({ flags: [...flags], name: resolvedName });
    const objectType = classifyObjectType({
      object_type: meta?.object_type,
      figi_security_type: meta?.figi_security_type,
      name: resolvedName ?? isin,
    });

    positions.push({
      isin,
      wkn,
      name: resolvedName,
      sources: [...sources].sort(),
      assetClass,
      objectType,
      isSavingsPlan,
      flags: [...flags].sort(),
      sharesHeld,
      openLots,
      costBasisRemaining,
      avgCost,
      currentPrice,
      priceAsOf: priceInfo?.as_of ?? null,
      priceIsOverride: priceInfo?.isOverride ?? false,
      marketValue,
      unrealizedPl: marketValue != null ? marketValue - costBasisRemaining : null,
      unrealizedPct:
        marketValue != null && costBasisRemaining > EPS
          ? (marketValue - costBasisRemaining) / costBasisRemaining
          : null,
      realizedPl: realizedTotal,
      realizedPlReported: hasReported ? reportedTotal : null,
      realizedMatches: allMatch,
      hasUnknownCostBasis,
      sells,
      totalBuyFees,
      totalSellFees,
      totalTransferFees,
      totalFees: totalBuyFees + totalSellFees + totalTransferFees,
      totalTax,
      totalInvested,
      txIds,
      txCount: txIds.length,
    });
  }

  // S6: Realisiert nach Jahr - nur Verkaeufe MIT Kostenbasis in den Summen;
  // NO_COST_BASIS-Verkaeufe separat ausweisen (DESIGN §18.1)
  const byYear: Record<string, YearAggregate> = {};
  for (const s of allSells) {
    const agg = (byYear[s.year] ??= {
      year: s.year,
      realizedPl: 0,
      proceeds: 0,
      cost: 0,
      fees: 0,
      tax: 0,
      count: 0,
      sells: [],
      excludedNoCostBasis: 0,
    });
    agg.sells.push(s);
    agg.count++;
    if (s.realized != null) {
      agg.realizedPl += s.realized;
      agg.proceeds += s.proceeds;
      agg.cost += s.matchedCost ?? 0;
      agg.fees += s.fees;
      agg.tax += s.tax;
    } else {
      agg.excludedNoCostBasis++;
    }
  }

  const held = positions.filter((p) => p.sharesHeld > EPS);
  const priced = held.filter((p) => p.currentPrice != null);
  const totals = {
    marketValue: priced.reduce((s, p) => s + (p.marketValue ?? 0), 0),
    costBasis: held.reduce((s, p) => s + p.costBasisRemaining, 0),
    unrealizedPl: priced.reduce((s, p) => s + (p.unrealizedPl ?? 0), 0),
    realizedPl: positions.reduce((s, p) => s + p.realizedPl, 0),
    feesAllTime: positions.reduce((s, p) => s + p.totalFees, 0),
    taxAllTime: positions.reduce((s, p) => s + p.totalTax, 0),
    heldCount: held.length,
    pricedCount: priced.length,
    priceCoverage: held.length ? priced.length / held.length : 0,
  };

  const income = cash
    .filter((c) => c.kind === "distribution" || c.kind === "interest")
    .reduce((s, c) => s + c.net, 0);

  return {
    positions,
    byYear,
    sellYears: Object.keys(byYear).sort(),
    cash,
    income,
    totals,
    fifoMismatches,
    noCostBasisSells: allSells.filter((s) => s.noCostBasis),
  };
}

function consumeLots(lots: Lot[], shares: number): void {
  let remaining = shares;
  while (remaining > EPS && lots.length) {
    const lot = lots[0];
    const take = Math.min(lot.shares, remaining);
    lot.shares -= take;
    remaining -= take;
    if (lot.shares <= EPS) lots.shift();
  }
}
