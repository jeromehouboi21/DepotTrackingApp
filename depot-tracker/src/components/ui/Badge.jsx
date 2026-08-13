const VARIANTS = {
  comdirect: "bg-[#e5f0f8] text-comdirect",
  scalable: "bg-[#e8e8ef] text-scalable",
  warn: "bg-[#f8ecd9] text-warn",
  gain: "bg-gain-bg text-gain",
  loss: "bg-loss-bg text-loss",
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-[#e3ecea] text-accent",
};

export function Badge({ variant = "neutral", children, className = "" }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${VARIANTS[variant] ?? VARIANTS.neutral} ${className}`}
    >
      {children}
    </span>
  );
}

export function SourceBadge({ source }) {
  return <Badge variant={source === "comdirect" ? "comdirect" : "scalable"}>{source}</Badge>;
}

// Kursquelle (price_quotes.source / price_overrides) - nicht zu verwechseln mit
// SourceBadge (Buchungsquelle der Transaktionen, transactions.source).
const PRICE_SOURCE_LABEL = {
  marketstack: "Auto (Xetra)",
  "marketstack+fx": "Auto · FX",
  "comdirect-import": "comdirect",
};

export function PriceSourceBadge({ source, isOverride }) {
  if (isOverride) return <Badge variant="accent">Manuell</Badge>;
  if (source === "comdirect-import") return <Badge variant="comdirect">comdirect</Badge>;
  return <Badge variant="neutral">{PRICE_SOURCE_LABEL[source] ?? "Auto"}</Badge>;
}
