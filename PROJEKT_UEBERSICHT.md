# DepotTrackingApp – Projektübersicht

> Überblick über alle Dateien im Repository. Stand: 09.08.2026.
>
> Das Repository enthält **zwei Teilprojekte**, die über ein JSON-Schnittstellenformat
> zusammenarbeiten:
>
> 1. **`depot-parser/`** – lokales Python-CLI, das comdirect-PDF-Abrechnungen und
>    Scalable-Capital-CSVs einliest, per FIFO Gewinn/Verlust berechnet und vier
>    JSON-Dateien erzeugt (Bauvorlage: `Design_Depot-Parser.md`).
> 2. **`depot-tracker/`** – React-Web-App (Supabase + Vercel), die diese JSON-Dateien
>    importiert, selbst nachrechnet und grafisch auswertet (Bauvorlage:
>    `DESIGN_Depot-Tracker.md`).
>
> **Datenfluss:** `C:\ComdirectPDFs` (Rohbelege) → `depot-parser/parse.py` →
> `depot-parser/output/*.json` → Import-Screen der App → Supabase → FIFO-Engine im
> Browser → Dashboards.

---

## Inhaltsverzeichnis

- [1. Repository-Wurzel](#1-repository-wurzel)
- [2. depot-parser (Python-CLI)](#2-depot-parser-python-cli)
  - [2.1 Einstieg & Konfiguration](#21-einstieg--konfiguration)
  - [2.2 comdirect/ – PDF- & CSV-Parsing](#22-comdirect--pdf---csv-parsing)
  - [2.3 scalable/ – Scalable-Capital-CSV](#23-scalable--scalable-capital-csv)
  - [2.4 core/ – Datenmodell, FIFO, Zustand](#24-core--datenmodell-fifo-zustand)
  - [2.5 output/ – erzeugte Daten](#25-output--erzeugte-daten)
  - [2.6 tests/ – Abnahmetests](#26-tests--abnahmetests)
- [3. depot-tracker (Web-App)](#3-depot-tracker-web-app)
  - [3.1 Projekt-Konfiguration](#31-projekt-konfiguration)
  - [3.2 src/ – Einstieg & Routing](#32-src--einstieg--routing)
  - [3.3 src/lib/ – Kernlogik](#33-srclib--kernlogik)
  - [3.4 src/hooks/ – Daten-Hooks](#34-srchooks--daten-hooks)
  - [3.5 src/screens/ – die 9 Screens](#35-srcscreens--die-9-screens)
  - [3.6 src/components/ – Komponenten](#36-srccomponents--komponenten)
  - [3.7 src/styles/ – Design-Tokens](#37-srcstyles--design-tokens)
  - [3.8 supabase/ – Migrationen & Edge Functions](#38-supabase--migrationen--edge-functions)
  - [3.9 tests/ – Engine-Paritätstests](#39-tests--engine-paritätstests)

---

## 1. Repository-Wurzel

| Datei/Ordner | Beschreibung |
|---|---|
| `PROJEKT_UEBERSICHT.md` | Dieses Dokument. |
| `depot-parser/` | Teilprojekt 1: Python-Parser (Schritt 1). |
| `depot-tracker/` | Teilprojekt 2: React-Web-App (Schritt 2). |
| `supabase/.temp/` | Vom Supabase-CLI erzeugte Verknüpfungs-/Versionsdateien (automatisch, nicht editieren). |
| `.claude/` | Lokale Claude-Code-Einstellungen. |

Die beiden Design-Dokumente (`Design_Depot-Parser.md`, `DESIGN_Depot-Tracker.md`) liegen
außerhalb des Repos beim Nutzer; die Referenz-Rohdaten in `C:\ComdirectPDFs`.

---

## 2. depot-parser (Python-CLI)

**Zweck:** Alle Käufe/Verkäufe/Überträge aus comdirect (615 PDFs) und Scalable Capital
(CSV) normalisieren, je ISIN realisierten G/V per FIFO berechnen und als JSON ausgeben.
Läuft **inkrementell**: Folgeläufe verarbeiten nur neue Dateien und schreiben eine
Delta-Datei. Python 3.11+, einzige Abhängigkeit `pdfplumber`.

**Aufruf:**
```bash
python parse.py --base "C:\ComdirectPDFs" --out ./output [--full] [--strict] [--verbose] [--quiet] [--dry-run]
```

### 2.1 Einstieg & Konfiguration

| Datei | Beschreibung |
|---|---|
| `parse.py` | CLI-Einstieg und Orchestrierung der Pipeline (§3 des Designs): State laden → Quellen entdecken → Neues ermitteln → parsen → vereinheitlichen → Überträge matchen → FIFO über den Gesamtbestand → atomar schreiben (kumulative Dateien, Delta, State). Enthält auch das Konsolen-Reporting je Phase. |
| `requirements.txt` | Python-Abhängigkeiten (`pdfplumber`). |

### 2.2 comdirect/ – PDF- & CSV-Parsing

| Datei | Beschreibung |
|---|---|
| `comdirect/filename.py` | Regex-Parsing der PDF-Dateinamen (`Wertpapierabrechnung_Kauf/Verkauf_…`). Liefert Richtung, Stückzahl, WKN, Datum und die 6-stellige Dokument-ID (`doc_hash`). Behandelt beide Namensschemata (alt 2008–2017 mit `WKN_`-Präfix, neu ab 2018) sowie Anleihen (`1.000_EUR_…` → Flag `BOND_NOMINAL`). Validiert gegen alle 574 realen Dateinamen. |
| `comdirect/pdf.py` | Text-Extraktion (pdfplumber) und Feld-Anker: ISIN, Kurs, Kurswert, Entgelte, Netto, Steuern, gemeldeter G/V, Seite-3-Kostenlots. Kernstücke: inhaltsbasierte Seiten-Klassifikation (Geschäftsabrechnung/Steuermitteilung/Kostenlots – nötig bei mehrseitigen Teilausführungen), `_compact()`-Fallback für gesperrt gedruckte Steuermitteilungen ("S t e u e r …"), Devisenkurs-Zeile für Fremdwährungstitel, Festpreisgeschäfte, altes 1-Seiten-Format (`OLD_FORMAT`). |
| `comdirect/transfer_csv.py` | Liest die manuell digitalisierte Depotübertrag-CSV (`comdirect_wertpapiereingang_depotuebertrag.csv`, 11 Zeilen) und mappt sie zu `TRANSFER_IN`-Transaktionen: `net = 0`, `fees = kosten_lagerstelle_eur`, Flag `INTERNAL_TRANSFER` bei `abgebende_stelle = Scalable`. Liefert **keine** Kostenbasis (die bleibt bei den Scalable-Kauf-Lots). |

### 2.3 scalable/ – Scalable-Capital-CSV

| Datei | Beschreibung |
|---|---|
| `scalable/csv_reader.py` | Liest die Broker-Transactions-CSV (Semikolon, deutsche Zahlen), filtert `Pending`-Zeilen und mappt `assetType|type` auf den einheitlichen Transaktionstyp (Savings plan/Buy → BUY, Sell → SELL, Security transfer → TRANSFER_OUT mit `INTERNAL_TRANSFER`, Cash-Typen → CASH). |

### 2.4 core/ – Datenmodell, FIFO, Zustand

| Datei | Beschreibung |
|---|---|
| `core/model.py` | `Transaction`-Datenklasse (kanonisches Schema §2.1) und `build_comdirect_transaction()` – kombiniert Dateiname- und PDF-Felder, setzt die Vorzeichen-Konvention (BUY negativ, SELL positiv). |
| `core/numbers.py` | Deutsches Zahlenformat: `parse_de_number` ("1.250,43" → 1250.43) und `parse_signed_amount` (nachgestelltes Minus "15,30-"). |
| `core/fifo.py` | FIFO-Engine (§7): je ISIN chronologisch, Kauf-Lots als Queue (Kostenbasis = \|net\|), Verkäufe konsumieren vorderste Lots. Bei vorhandenem `reported_realized_pl` ist der **Bankwert maßgeblich** (eigene FIFO nur Gegenprobe, Toleranz 0,02 €, sonst `FIFO_MISMATCH`). `INTERNAL_TRANSFER` wird neutralisiert – Lots bleiben offen (§7.3). Liefert Positionen mit `open_lots`, `avg_cost`, `realized_pl` + Issue-Liste (`NO_COST_BASIS` …). |
| `core/transfers.py` | Matching des Depotübertrags Scalable→comdirect: je ISIN aggregiert, Datumsfenster ±3 Tage, Bruchstück-Toleranz 1 Stück. Erzeugt `TRANSFER_UNMATCHED` / `TRANSFER_SHARES_MISMATCH`-Warnungen. |
| `core/securities.py` | Baut `securities.json` – WKN↔ISIN-Stammdaten, dedupliziert je ISIN, Felder werden quellenübergreifend aufgefüllt. |
| `core/state.py` | Inkrement-Zustand `state/processed_index.json` (§12.1): welche Dokument-IDs wurden wann verarbeitet. Atomares Schreiben (tmp + rename). |
| `core/delta.py` | Schreibt die Delta-Datei je Lauf (`delta/transactions_delta_<RUN_ID>.json`) – nur die neuen Transaktionen dieses Laufs, plus Kopf mit Zählwerten (§12.2). |
| `core/logs.py` | Konsolen-Logging (§13): Phasen-Layout mit Box-Zeichen, UTF-8-Erzwingung für Windows-Konsolen, Schluss-Zusammenfassung erscheint auch bei `--quiet`. |

### 2.5 output/ – erzeugte Daten

**A) Kumulativ** (bei jedem Lauf vollständig neu geschrieben – Master-Quelle):

| Datei | Beschreibung |
|---|---|
| `output/transactions.json` | Alle 907 Transaktionen im kanonischen Schema. **Import-Datei 1** für die App. |
| `output/portfolio.json` | 151 Positionen mit FIFO-Ergebnis (`shares_held`, `avg_cost`, `open_lots`, `realized_pl`, Validierung gegen Bankwerte). **Import-Datei 2** (dient der App als Seed/Gegenprobe). |
| `output/securities.json` | 151 Wertpapier-Stammdaten (ISIN, WKN, Name, Verwahrart). **Import-Datei 3**. |
| `output/warnings.json` | Lauf-Report (`summary`) + 86 Issues (52× FIFO_MISMATCH, 23× TRANSFER_UNMATCHED, 6× NO_COST_BASIS, 5× TRANSFER_SHARES_MISMATCH). **Import-Datei 4**. |

**B) Pro Lauf / Zustand:**

| Datei | Beschreibung |
|---|---|
| `output/delta/transactions_delta_*.json` | Eine Datei je Parser-Lauf mit ausschließlich den neu verarbeiteten Transaktionen (auch leer, für lückenlose Nachvollziehbarkeit). |
| `output/state/processed_index.json` | Merkliste aller verarbeiteten Dokument-IDs – **nicht löschen**, sonst verarbeitet der nächste Lauf alles neu. |

### 2.6 tests/ – Abnahmetests

Ausführung: `python tests/test_<name>.py` (jeweils eigenständig lauffähig, Ausgabe `OK`).

| Datei | Beschreibung |
|---|---|
| `tests/test_numbers.py` | Deutsches Zahlenformat inkl. nachgestelltem Minus. |
| `tests/test_filename.py` | Beide Dateinamens-Schemata, Anleihen-Sonderfall, Nicht-Abrechnungs-Filter. |
| `tests/test_fifo.py` | BICO-Referenzfall (−707,58 €, §10.1), FIFO-Mismatch-Verhalten (Bankwert gewinnt), `NO_COST_BASIS`, Übertrags-Neutralisierung + Matching. |
| `tests/test_csv_sources.py` | Läuft gegen die **realen** CSVs: 11 Depotübertrag-Zeilen, kein `Pending`, 57 Security transfer → TRANSFER_OUT mit `net = 0`. |
| `tests/test_pdf.py` | Läuft gegen die **realen** PDFs: BICO-Verkauf feldgenau (Kostenlots, Steuern, gemeldeter G/V), altes Format mit `OLD_FORMAT`-Flag. |

---

## 3. depot-tracker (Web-App)

**Zweck:** Persönliche Single-User-Web-App, die den Parser-Output importiert, **selbst
per FIFO nachrechnet** (E1) und auswertet: Live-Depotwert, Kauf↔Verkauf-Verknüpfung mit
allen Kosten, Per-Lot-Sparplanrendite, Jahresfilter für realisierte G/V,
Warnungs-Korrektur-Workflow und Broker-Standort-Verwaltung.

**Stack:** React 18 + Vite · Tailwind v3 · React Router v6 · Recharts · Supabase
(Auth/Postgres/Edge Functions) · Vercel. Desktop-first, deutsche Anzeige.

**Kommandos:** `npm run dev` · `npm run build` · `npm test`

### 3.1 Projekt-Konfiguration

| Datei | Beschreibung |
|---|---|
| `package.json` / `package-lock.json` | Abhängigkeiten und Skripte (dev/build/test). |
| `vite.config.js` | Vite + React-Plugin; enthält auch die Vitest-Konfiguration. |
| `tailwind.config.js` | Bindet die CSS-Design-Tokens als Tailwind-Farben (`bg-surface`, `text-gain`, `text-loss` …), Fonts, `max-w-app` (1280 px). |
| `postcss.config.js` | Tailwind + Autoprefixer. |
| `index.html` | HTML-Einstieg, lädt die Fonts DM Sans / DM Serif Display. |
| `.env.example` | Vorlage für `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) und die Edge-Function-Secrets. |
| `.gitignore` | node_modules, dist, .env.local. |
| `CLAUDE.md` | Technische Kurzdoku für Claude Code: Architektur-Entscheidungen E1–E8, Engine-Semantik, Erwartungswerte, Konventionen. |
| `supabase/.temp/` | Supabase-CLI-Verknüpfungsdaten (automatisch). |

### 3.2 src/ – Einstieg & Routing

| Datei | Beschreibung |
|---|---|
| `src/main.jsx` | ReactDOM-Bootstrap + BrowserRouter. |
| `src/App.jsx` | Routen-Definition hinter Login-Schutz: `/` Dashboard, `/positionen`, `/wertpapier/:isin`, `/sparplan`, `/realisiert`, `/warnungen`, `/broker`, `/import`, `/auth`. Zeigt Konfigurations-Hinweis, wenn `.env.local` fehlt. |

### 3.3 src/lib/ – Kernlogik

| Datei | Beschreibung |
|---|---|
| `src/lib/portfolio.ts` | ⭐ **Herzstück** – die FIFO-Berechnungs-Engine (§8 des Designs). Reines TypeScript, deterministisch, kein Netz. Verarbeitet Transaktionen + Overrides + manuelle Kostenlots + Transfer-Links + Kurse zu Positionen (`openLots`, `avgCost`, unrealisiert), `SellRecord`s mit zugeordneten Kauf-Lots, Per-Lot-Renditen (inkl. annualisiert), Jahres-Aggregation, Portfolio-Totale, Cash/Erträge-Trennung. **Semantik paritätisch zum Parser** (Kostenbasis = \|net\|, Bankwert maßgeblich, `INTERNAL_TRANSFER` neutral) – abgesichert durch den Paritätstest. |
| `src/lib/format.ts` | Deutsche Formatierung (Intl de-DE): Euro, Stückzahlen, Prozent, Datum. |
| `src/lib/supabase.js` | Supabase-Client aus Umgebungsvariablen; exportiert `supabaseConfigured`. |
| `src/lib/logger.ts` | Frontend-Logger: Console + best-effort `app_logs`-Tabelle. |

### 3.4 src/hooks/ – Daten-Hooks

| Datei | Beschreibung |
|---|---|
| `src/hooks/useData.jsx` | Zentraler Daten-Context (`DataProvider`/`useData`): bündelt die drei Hooks unten, ein `refreshAll()` nach jeder Korrektur (Recompute-Fluss §12). |
| `src/hooks/usePortfolio.js` | Lädt transactions/overrides/manual_cost_lots/transfer_links/securities/price_quotes/price_overrides aus Supabase (paginiert), normalisiert numerics und ruft die Engine memoized auf. |
| `src/hooks/useAuth.js` | Supabase-Session (Login/Logout, Auth-State-Listener). |
| `src/hooks/useWarnings.js` | Warnungen laden + Status setzen (open/resolved/ignored mit Notiz und Zeitstempel). |
| `src/hooks/useCustody.js` | Broker-Stammdaten + `holding_custody` (Standort je ISIN); `setBrokerFor()` ersetzt die Zuordnung einer Position. |

### 3.5 src/screens/ – die 9 Screens

| Datei | Anforderung | Beschreibung |
|---|---|---|
| `screens/auth/AuthScreen.jsx` | – | E-Mail/Passwort-Login (Supabase Auth). |
| `screens/dashboard/DashboardScreen.jsx` | 1, 6 | Kennzahlen-Karten (Marktwert, unrealisiert, realisiert, Gebühren, Erträge, Kursabdeckung), Allokations-Donut, Gewinner/Verlierer-Chart, "Investiertes Kapital über Zeit", Warnungs-Banner, "Kurse aktualisieren"-Button (ruft `fetch-prices`). |
| `screens/positions/PositionsScreen.jsx` | 1, 7 | Sortierbare Positionstabelle mit Live-Wert und Summenzeile; **Broker-Standort inline editierbar** (Dropdown, ohne G/V-Einfluss); Filter (Bestand/alle/Kurs fehlt, Broker), Gruppierung nach Broker; Klick → Detail. |
| `screens/positions/SecurityDetailScreen.jsx` | 2, 7 | Herzstück je Wertpapier: Kauf↔Verkauf-FIFO-Zuordnung (`BuySellTimeline`), volle Kostenaufschlüsselung, Brutto/Netto-Umschalter, offene Lots, zugehörige Warnungen, **freie Transaktions-Korrektur** (Override je Zeile), manueller Kurs-Override, Broker-Dropdown. |
| `screens/savingsplan/SavingsPlanScreen.jsx` | 3 | Sparplan-Positionen (E4-Heuristik, Override-Knopf): je Position `LotReturnBars`-Chart (bei >40 Lots nach Jahr gruppiert) + aufklappbare `LotTable` mit **Wertzuwachs jedes einzelnen Kaufs**. |
| `screens/realized/RealizedScreen.jsx` | 5 | Jahres-Chips (2008–2026 + Alle), Kennzahlen des Jahres, `RealizedByYearBar`, Gewinner/Verlierer-Tabellen, Brutto/Netto-Umschalter; Verkäufe ohne Kostenbasis separat ausgewiesen. |
| `screens/warnings/WarningsScreen.jsx` | 4 | Warnungs-Inbox (Filter nach Status/Code) mit kontextabhängigem `CorrectionDrawer` je Code, Erledigt/Ignorieren mit Notiz, Wieder-öffnen. |
| `screens/brokers/BrokersScreen.jsx` | 7 | Broker-Verwaltung (anlegen/umbenennen/deaktivieren, Farbe), "Was liegt wo?"-Übersicht mit Summen je Broker, **Bulk-Zuordnung** mehrerer Positionen. |
| `screens/import/ImportScreen.jsx` | – | 4-Datei-Upload (Drag/Click) mit Validierung, Client-Upsert in 500er-Batches, Custody-Default-Herleitung aus der Übertrags-Kette (§13), Warnungs-Status-Erhalt bei Re-Import, Import-Historie, **Kurs-Mapping-Prüftabelle** mit "Symbole auflösen"-Button (ruft `resolve-symbols`). |

### 3.6 src/components/ – Komponenten

**ui/ – Basisbausteine**

| Datei | Beschreibung |
|---|---|
| `ui/Money.jsx` | Euro-Betrag, tabular-nums, optional Vorzeichen + Gewinn/Verlust-Farbe. |
| `ui/PctChange.jsx` | Prozent mit ▲/▼-Pfeil und Farbe. |
| `ui/Stat.jsx` | Kennzahl-Karte (Label, Wert, Sub-Zeile). |
| `ui/Table.jsx` | Generische sortierbare Tabelle mit Summen-Fußzeile und Row-Click. |
| `ui/Tabs.jsx` | Segmented Control (z. B. Brutto/Netto). |
| `ui/Badge.jsx` | Farbige Labels inkl. `SourceBadge` (comdirect/scalable). |
| `ui/Button.jsx` | Button-Varianten (primary/secondary/danger/ghost). |
| `ui/Card.jsx` | Karten-Container mit Titel + Aktions-Slot. |
| `ui/EmptyState.jsx` | Leerzustand ("Noch keine Daten importiert"). |

**layout/**

| Datei | Beschreibung |
|---|---|
| `layout/AppShell.jsx` | Sidebar + `<Outlet>`-Hauptbereich (responsive: Sidebar → Top-Leiste). |
| `layout/SideNav.jsx` | Navigation mit Warnungs-Badge (Anzahl offener Warnungen) und Abmelden. |

**charts/ – Recharts-Diagramme (Anforderung 6)**

| Datei | Beschreibung |
|---|---|
| `charts/AllocationDonut.jsx` | Depot-Allokation nach Marktwert (Top 9 + "Übrige"). |
| `charts/WinnersLosersBar.jsx` | Divergierendes Balkendiagramm "womit Gewinn / womit Verlust". |
| `charts/InvestedOverTimeArea.jsx` | Kumuliertes eingezahltes Kapital (bewusst kein Marktwert-Verlauf – historische Kurse fehlen). |
| `charts/RealizedByYearBar.jsx` | Realisierter G/V pro Jahr, klickbar als Jahresfilter. |
| `charts/LotReturnBars.jsx` | Jeder Sparplan-Kauf als grün/roter Balken, optional nach Jahr gruppiert. |

**position/ – Wertpapier-Detail-Bausteine**

| Datei | Beschreibung |
|---|---|
| `position/BuySellTimeline.jsx` | Jeder Verkauf mit seinen FIFO-zugeordneten Kauf-Lots + Bank-Gegenprobe (✓ / Abweichungs-Badge). |
| `position/CostBreakdownTable.jsx` | Kostenelemente einzeln: Kauf-/Verkaufs-/Übertragsgebühren, Steuern, Summe. |
| `position/LotTable.jsx` | Offene Lots mit Einstand, Wert heute, Zuwachs €/%, Haltedauer, p.a. |

**warnings/ – Korrektur-Workflow (Anforderung 4, E2: nicht-destruktiv)**

| Datei | Beschreibung |
|---|---|
| `warnings/CorrectionDrawer.jsx` | Wählt das passende Formular je Warnungs-Code; enthält den FIFO_MISMATCH-Drawer ("Transaktion korrigieren" oder "gemeldeten Bankwert übernehmen"). |
| `warnings/ManualCostBasisForm.jsx` | `NO_COST_BASIS`: fehlendes Kauf-Lot erfassen → `manual_cost_lots`. |
| `warnings/TransferLinkForm.jsx` | `TRANSFER_UNMATCHED`/`TRANSFER_SHARES_MISMATCH`: Abgang↔Eingang verknüpfen oder "extern, kein Ziel" → `transfer_links`. |
| `warnings/OverrideFieldForm.jsx` | Feld-Patches je Transaktion (Gebühren, Steuern, net, Stück, gemeldeter G/V) → `transaction_overrides`; "Original wiederherstellen" löscht den Patch. |

**broker/ – Standort-Verwaltung (Anforderung 7, E7)**

| Datei | Beschreibung |
|---|---|
| `broker/BrokerSelect.jsx` | Standort-Dropdown inkl. "+ Neuer Broker…"-Inline-Anlage. |
| `broker/CustodyStatusBadge.jsx` | Status-Chip bei laufendem Übertrag (`pending_transfer` → Ziel, `in_transit`). |

### 3.7 src/styles/ – Design-Tokens

| Datei | Beschreibung |
|---|---|
| `styles/tokens.css` | CSS Custom Properties: neutrale Basis + Finance-Semantik (`--color-gain` grün, `--color-loss` rot, Quellenfarben comdirect/Scalable). |
| `styles/globals.css` | Tailwind-Einbindung, Fonts, `.tnum`-Klasse (tabular-nums – Pflicht in allen Zahlentabellen). |

### 3.8 supabase/ – Migrationen & Edge Functions

**Migrationen** (idempotent, alle Tabellen mit RLS `auth.uid() = user_id`; einspielen mit `supabase db push`):

| Datei | Beschreibung |
|---|---|
| `migrations/001_initial.sql` | Import-Tabellen: `securities` (inkl. App-Feldern `is_savings_plan`, `asset_class`), `transactions` (roh, immutable), `portfolio_seed`, `warnings` (mit App-Status; Unique-Constraint macht Re-Importe idempotent). |
| `migrations/002_corrections.sql` | Korrektur-Tabellen: `transaction_overrides`, `manual_cost_lots`, `transfer_links`. |
| `migrations/003_prices.sql` | Kurs-Schicht (aus Anhang B des Designs): Mapping-Spalten auf `securities`, `price_quotes`, `price_overrides`, `fx_rates`. |
| `migrations/004_logs_imports.sql` | Betrieb: `app_logs`, `import_runs`. |
| `migrations/005_brokers_custody.sql` | `brokers` (erweiterbare Stammdaten) + `holding_custody` (Standort-Etikett je ISIN, Status settled/pending_transfer/in_transit). |

**Edge Functions** (deployen mit `supabase functions deploy <name>`; Secrets: `MARKETSTACK_API_KEY`, optional `OPENFIGI_API_KEY`):

| Datei | Beschreibung |
|---|---|
| `functions/_shared/logger.ts` | Strukturierter JSON-Logger für alle Functions. |
| `functions/resolve-symbols/index.ts` | Einmalige ISIN/WKN→Ticker-Auflösung (aus Anhang C des Designs): OpenFIGI-Mapping auf deutsche Börsenplätze → marketstack-EUR-Verifikation → ISIN-Kreuzprüfung → Confidence/Status in `securities`. |
| `functions/fetch-prices/index.ts` | Täglicher/manueller EOD-Kursabruf: Batch je Börse (MIC), FX-Fallback über exchangerate.host (gecacht in `fx_rates`), Upsert `price_quotes` in EUR. |
| `functions/import-parser-output/index.ts` | Optionale Service-Role-Import-Variante (Zwei-Client-Muster). Der Import-Screen nutzt standardmäßig den einfacheren Client-Upsert. |

### 3.9 tests/ – Engine-Paritätstests

| Datei | Beschreibung |
|---|---|
| `tests/portfolio.test.ts` | Vitest-Suite (10 Tests): ⭐ **Paritätstest** – die App-Engine muss den realen Parser-Output (`../depot-parser/output/`) auf ±0,01 € reproduzieren (Positionen, Kostenbasis, realisierter G/V, Jahres-Verteilung der Verkäufe, Sparplan-Erkennung). Dazu Unit-Tests für Overrides, manuelle Kostenlots und die Sparplan-Heuristik. Überspringt die Seed-Tests automatisch, wenn kein Parser-Output vorliegt. |

---

## Typischer Arbeitsablauf

```
1. Neue Abrechnungen in C:\ComdirectPDFs\Abrechnungen\ ablegen
2. cd depot-parser && python parse.py            → inkrementeller Lauf, Delta + kumulierte JSONs
3. App öffnen → /import → die 4 output/*.json hochladen
4. /warnungen: neue Parser-Warnungen prüfen/korrigieren
5. Dashboard: "Kurse aktualisieren" → aktuelle Bewertung
```
