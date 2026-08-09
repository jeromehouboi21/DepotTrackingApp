# Depot-Tracker – Technische Kurzdoku

Persönliche Web-App zur Auswertung des Depot-Parser-Outputs (comdirect + Scalable Capital).
Vollständige Bauvorlage: `DESIGN_Depot-Tracker.md` (Repo-Root / Nutzer-Dokument).

## Stack

React 18 + Vite · Tailwind v3 (Tokens in `src/styles/tokens.css`) · React Router v6 ·
Recharts · Supabase (Auth + Postgres + Edge Functions) · Vercel. Desktop-first (~1200 px).

## Kommandos

```bash
npm run dev        # Dev-Server
npm run build      # Produktions-Build
npm test           # Vitest - Engine-Paritaet gegen ../depot-parser/output/
supabase db push                          # Migrationen 001-005 einspielen
supabase functions deploy resolve-symbols fetch-prices import-parser-output
supabase secrets set MARKETSTACK_API_KEY=... OPENFIGI_API_KEY=...
```

`.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (siehe `.env.example`).
Single-User: Supabase-Signups deaktivieren, Nutzer manuell anlegen.

## Architektur-Kernentscheidungen (E1–E8, Details im Design-Dokument)

- **E1**: Die App rechnet selbst. `src/lib/portfolio.ts` = FIFO-Engine (deterministisch,
  unit-getestet). `portfolio.json` des Parsers wird nur als Seed/Gegenprobe importiert.
- **E2**: Korrekturen sind nicht-destruktiv: `transaction_overrides` (Feld-Patches),
  `manual_cost_lots` (fehlende Kostenbasis), `transfer_links` (Übertrags-Ketten).
  Rohdaten in `transactions` bleiben unverändert.
- **E4**: Sparplan = Heuristik (≥5 Bruchstück-Käufe) + manueller Override
  (`securities.is_savings_plan`).
- **E7**: Broker-Standort (`holding_custody`) ist ein editierbares Label ohne jeden
  Einfluss auf die G/V-Rechnung. `transactions.source` ≠ Standort.
- **E8/INTERNAL_TRANSFER**: Der Scalable↔comdirect-Übertrag ist neutralisiert - die
  ursprünglichen Kauf-Lots bleiben offen (identisch zur Parser-Semantik).

## Engine-Semantik (muss mit depot-parser/core/fifo.py paritätisch bleiben)

- Kauf-Kostenbasis = `abs(net)` (Gebühren enthalten).
- SELL: FIFO gegen offene Lots; wenn `reported_realized_pl` vorhanden, ist der
  **Bankwert maßgeblich** (eigene FIFO nur zur Gegenprobe, Toleranz 0,01 €).
- `INTERNAL_TRANSFER`-geflaggte TRANSFER_IN/OUT sind No-Ops.
- Verkäufe ohne Kostenbasis: `realized = null`, separat ausgewiesen, nicht in Summen.
- Parity-Test: `tests/portfolio.test.ts` liest `../depot-parser/output/` direkt.

## Daten-Fluss

Import (`/import`, Client-Upsert in Batches) → Supabase-Tabellen → `usePortfolio`
lädt alles + ruft Engine → Screens. Nach jeder Korrektur `refreshAll()` (Context
`useData`). Kurse: `resolve-symbols` (einmalig, OpenFIGI→marketstack) →
`fetch-prices` (EOD-Batch + FX) → `price_quotes`; `price_overrides` gewinnt immer.

## Wichtige Pfade

- Engine: `src/lib/portfolio.ts` · Tests: `tests/portfolio.test.ts`
- Screens: `src/screens/*` (Dashboard, Positionen, Wertpapier-Detail, Sparplan,
  Realisiert, Warnungen, Broker, Import)
- Korrektur-Formulare: `src/components/warnings/*`
- Migrationen: `supabase/migrations/001–005`
- Edge Functions: `supabase/functions/{resolve-symbols,fetch-prices,import-parser-output}`

## Erwartungswerte (Ist-Stand 2026-08-09, Anhang A des Designs)

907 Transaktionen · 151 Securities · 86 Warnungen · 41 gehaltene Positionen ·
Σ realisiert ≈ 3.050,52 € · Σ Kostenbasis (gehalten) ≈ 88.138,30 € · Σ Gebühren ≈ 4.091,03 €.

## Konventionen

- Alle Beträge intern `number` (Punkt-Dezimal), Anzeige de-DE via `src/lib/format.ts`.
- Zahlen in Tabellen immer mit Klasse `tnum` (tabular-nums).
- Gewinn/Verlust-Farben: `text-gain` / `text-loss` (Tokens).
- Ohne Kurs: "Kurs fehlt" anzeigen, nie 0 annehmen.
