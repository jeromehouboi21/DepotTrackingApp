#!/usr/bin/env python
"""Depot-Parser CLI (§9). Liest comdirect-PDFs + Scalable-CSV + Depotübertrag-CSV,
führt sie über die ISIN zusammen und schreibt eine vereinheitlichte JSON (§2)."""

import argparse
import glob
import json
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from comdirect.filename import parse_filename
from comdirect.pdf import parse_pdf
from comdirect.transfer_csv import read_transfer_csv, to_transaction as transfer_to_tx
from scalable.csv_reader import read_scalable_csv, to_transaction as scalable_to_tx
from core.model import build_comdirect_transaction
from core.fifo import compute_portfolio
from core.transfers import match_transfers
from core.securities import build_securities
from core.state import load_state, empty_state, mark_processed, write_state
from core.delta import write_delta
from core.logs import setup_logging, RunLogger


def parse_args():
    p = argparse.ArgumentParser(description="Depot-Parser: comdirect-PDFs + Scalable-CSV -> JSON")
    p.add_argument("--config", default=None, help="Pfad zur Quellen-Config (JSON). Ersetzt --base-Discovery.")
    p.add_argument("--base", default=r"C:\ComdirectPDFs", help="Basispfad (nur ohne --config)")
    p.add_argument("--out", default=None, help="Ausgabeordner (überschreibt config.out; Default ./output)")
    p.add_argument("--full", action="store_true", help="State ignorieren, alles neu aufbauen")
    p.add_argument("--strict", action="store_true", help="Bei FIFO_MISMATCH/Parse-Fehler abbrechen")
    p.add_argument("--verbose", action="store_true", help="Zusätzliche Debug-Zeilen")
    p.add_argument("--quiet", action="store_true", help="Nur Warnungen/Fehler + Abschluss")
    p.add_argument("--dry-run", action="store_true", help="Nichts schreiben")
    return p.parse_args()


def discover(base_dir: str):
    abrechnungen_dir = os.path.join(base_dir, "Abrechnungen")
    all_pdfs = sorted(f for f in os.listdir(abrechnungen_dir)) if os.path.isdir(abrechnungen_dir) else []
    all_pdfs = [f for f in all_pdfs if f.lower().endswith(".pdf")]
    wp_pdfs = [f for f in all_pdfs if f.startswith("Wertpapierabrechnung_")]
    skipped_pdfs = [f for f in all_pdfs if f not in wp_pdfs]

    scalable_candidates = glob.glob(os.path.join(base_dir, "*ScalableCapital-Broker-Transactions.csv"))
    scalable_csv = max(scalable_candidates, key=os.path.getmtime) if scalable_candidates else None

    transfer_candidates = [
        f for f in glob.glob(os.path.join(base_dir, "*.csv"))
        if "wertpapiereingang" in os.path.basename(f).lower()
        and "depotuebertrag" in os.path.basename(f).lower()
    ]
    transfer_csv = transfer_candidates[0] if transfer_candidates else None

    return {
        "abrechnungen_dir": abrechnungen_dir,
        "all_pdfs": all_pdfs,
        "wp_pdfs": wp_pdfs,
        "skipped_pdfs": skipped_pdfs,
        "scalable_csv": scalable_csv,
        "transfer_csv": transfer_csv,
    }


def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def discover_from_config(cfg: dict) -> dict:
    """Deklarative Variante von discover(): liest exakt fest, welche Quellen es gibt
    und wo sie liegen (Config-Feature), statt sie über --base zu erraten. Liefert
    dasselbe Dict-Schema wie discover() - der nachgelagerte main()-Ablauf bleibt
    dadurch unverändert."""
    src = cfg.get("sources", {})

    def enabled(name):
        s = src.get(name) or {}
        return bool(s.get("enabled")), s

    # comdirect
    cd_on, cd = enabled("comdirect")
    abrechnungen_dir = cd.get("abrechnungen_dir") if cd_on else None
    if cd_on and (not abrechnungen_dir or not os.path.isdir(abrechnungen_dir)):
        raise SystemExit(
            f"Config-Fehler: comdirect aktiviert, aber abrechnungen_dir fehlt/existiert nicht: {abrechnungen_dir!r}"
        )
    all_pdfs = sorted(f for f in os.listdir(abrechnungen_dir) if f.lower().endswith(".pdf")) if cd_on else []
    wp_pdfs = [f for f in all_pdfs if f.startswith("Wertpapierabrechnung_")]
    skipped_pdfs = [f for f in all_pdfs if f not in wp_pdfs]

    # scalable
    sc_on, sc = enabled("scalable")
    scalable_csv = sc.get("csv") if sc_on else None
    if sc_on and (not scalable_csv or not os.path.isfile(scalable_csv)):
        raise SystemExit(f"Config-Fehler: scalable aktiviert, aber csv fehlt/existiert nicht: {scalable_csv!r}")

    # transfer
    tr_on, tr = enabled("transfer")
    transfer_csv = tr.get("csv") if tr_on else None
    if tr_on and (not transfer_csv or not os.path.isfile(transfer_csv)):
        raise SystemExit(f"Config-Fehler: transfer aktiviert, aber csv fehlt/existiert nicht: {transfer_csv!r}")

    return {
        "abrechnungen_dir": abrechnungen_dir or "",
        "all_pdfs": all_pdfs,
        "wp_pdfs": wp_pdfs,
        "skipped_pdfs": skipped_pdfs,
        "scalable_csv": scalable_csv,
        "transfer_csv": transfer_csv,
    }


def load_json(path: str, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def atomic_write_json(path: str, data) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)


def fmt_amount(x: float) -> str:
    return f"{x:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def fmt_shares(x: float) -> str:
    return f"{x:g}".replace(".", ",")


def main() -> int:
    args = parse_args()
    t_start = time.time()
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_at = datetime.now().isoformat(timespec="seconds")

    logger = setup_logging(args.verbose, args.quiet)
    rl = RunLogger(logger, run_id)

    cfg = load_config(args.config) if args.config else None
    out_dir = args.out or (cfg.get("out") if cfg else None) or "./output"
    state_path = os.path.join(out_dir, "state", "processed_index.json")
    transactions_path = os.path.join(out_dir, "transactions.json")
    portfolio_path = os.path.join(out_dir, "portfolio.json")
    securities_path = os.path.join(out_dir, "securities.json")
    warnings_path = os.path.join(out_dir, "warnings.json")

    # --- 1. State laden (§12.1) ---
    state = empty_state() if args.full else load_state(state_path)
    rl.phase(f"State geladen: {len(state['processed'])} Dokumente bereits verarbeitet"
              if not args.full else "State ignoriert (--full)")

    # --- 2. Discover ---
    disc = discover_from_config(cfg) if cfg else discover(args.base)
    scalable_rows_all = read_scalable_csv(disc["scalable_csv"]) if disc["scalable_csv"] else []
    scalable_rows_raw_count = 0
    if disc["scalable_csv"]:
        with open(disc["scalable_csv"], encoding="utf-8-sig") as f:
            scalable_rows_raw_count = max(0, sum(1 for _ in f) - 1)
    scalable_pending_filtered = scalable_rows_raw_count - len(scalable_rows_all)

    transfer_rows = read_transfer_csv(disc["transfer_csv"]) if disc["transfer_csv"] else []

    rl.phase("Quellen gefunden:")
    rl.line(f"comdirect-Abrechnungen (Abrechnungen\\*.pdf) ... {len(disc['wp_pdfs'])} PDF "
            f"(davon {len(disc['skipped_pdfs'])} Nicht-Abrechnung übersprungen)")
    rl.line(f"Depotübertrag-CSV ... {len(transfer_rows)} Zeilen"
            + (f" ({os.path.basename(disc['transfer_csv'])})" if disc["transfer_csv"] else " (keine Datei gefunden)"))
    rl.line(f"Scalable-CSV ... {len(scalable_rows_all)} Zeilen "
            f"(davon {scalable_pending_filtered} Pending übersprungen)"
            + (f" ({os.path.basename(disc['scalable_csv'])})" if disc["scalable_csv"] else " (keine Datei gefunden)"))

    # --- 3. Neu ermitteln (§12.1) ---
    new_pdfs = []
    old_pdfs = 0
    for fn in disc["wp_pdfs"]:
        fname = parse_filename(fn)
        if fname is None:
            rl.warn(f"Dateiname passt nicht ins Schema, übersprungen: {fn}")
            continue
        if fname["id"] in state["processed"]:
            old_pdfs += 1
        else:
            new_pdfs.append((fn, fname))

    new_transfer_rows = []
    old_transfer_rows = 0
    for row in transfer_rows:
        tx_id = row.get("interne_referenz") or row.get("rechnungsnummer")
        if tx_id in state["processed"]:
            old_transfer_rows += 1
        else:
            new_transfer_rows.append(row)

    new_scalable_rows = []
    old_scalable_rows = 0
    for row in scalable_rows_all:
        if row["reference"] in state["processed"]:
            old_scalable_rows += 1
        else:
            new_scalable_rows.append(row)

    rl.phase("Neu-Abgleich gegen State:")
    rl.line(f"comdirect ............ {len(new_pdfs)} neu, {old_pdfs} bereits verarbeitet")
    rl.line(f"Übertrag-CSV ......... {len(new_transfer_rows)} neu, {old_transfer_rows} bereits verarbeitet")
    rl.line(f"Scalable .............. {len(new_scalable_rows)} neu, {old_scalable_rows} bereits verarbeitet")

    # --- 4./5./6. Neue Einträge parsen & vereinheitlichen (§4, §5, §6) ---
    total_new = len(new_pdfs) + len(new_transfer_rows) + len(new_scalable_rows)
    rl.phase(f"Verarbeite {total_new} neue Einträge …")

    new_transactions = []
    pdf_parse_errors = 0
    securities_entries = []
    idx = 0

    for fn, fname in new_pdfs:
        idx += 1
        path = os.path.join(disc["abrechnungen_dir"], fn)
        try:
            pdf_fields = parse_pdf(path, fname["shares"])
        except Exception as e:
            pdf_parse_errors += 1
            rl.error(f"[{idx}/{total_new}] Parse-Fehler bei {fn}: {e}")
            if args.strict:
                return 1
            continue
        tx = build_comdirect_transaction(fname, pdf_fields, fn).to_dict()
        new_transactions.append(tx)
        securities_entries.append({"isin": tx["isin"], "wkn": tx["wkn"], "name": tx["name"],
                                    "verwahrart": pdf_fields.get("verwahrart"), "currency": tx["currency"]})

        richtung = "KAUF " if tx["type"] == "BUY" else "VERK."
        gegenprobe = ""
        if tx["type"] == "SELL" and tx.get("reported_realized_pl") is not None:
            gegenprobe = f"  → gemeldet {fmt_amount(tx['reported_realized_pl'])} €"
        rl.line(f"[{idx}/{total_new}] {richtung}  {tx['wkn']}  {tx['isin']}  {fmt_shares(tx['shares'])} St.  "
                f"EUR {fmt_amount(tx['net'])}   ({fn}){gegenprobe}")

    for row in new_transfer_rows:
        idx += 1
        tx = transfer_to_tx(row)
        new_transactions.append(tx)
        securities_entries.append({"isin": tx["isin"], "wkn": tx["wkn"], "name": tx["name"],
                                    "verwahrart": row.get("verwahrungsart"), "currency": tx["currency"]})
        rl.line(f"[{idx}/{total_new}] ÜBERTRAG  {tx['wkn']}  {tx['isin']}  {fmt_shares(tx['shares'])} St.  "
                f"(Depotübertrag, comdirect)")

    for row in new_scalable_rows:
        idx += 1
        tx = scalable_to_tx(row)
        if tx is None:
            rl.warn(f"Unbekannter Scalable-Typ übersprungen: {row.get('assetType')}|{row.get('type')} "
                     f"({row.get('reference')})")
            continue
        new_transactions.append(tx)
        if tx["isin"]:
            securities_entries.append({"isin": tx["isin"], "wkn": tx["wkn"], "name": tx["name"],
                                        "verwahrart": None, "currency": tx["currency"]})
        label = {"BUY": "KAUF ", "SELL": "VERK.", "TRANSFER_OUT": "ÜBTRG", "CASH": "CASH "}[tx["type"]]
        rl.line(f"[{idx}/{total_new}] {label}  {tx['isin'] or '-':13}  {fmt_shares(tx['shares'])} St.  "
                f"EUR {fmt_amount(tx['net'])}   (Scalable)")

    # --- 7. Mit kumuliertem Bestand zusammenführen ---
    existing_transactions = [] if args.full else load_json(transactions_path, [])
    base_count_before = len(existing_transactions)

    merged_by_id = {tx["id"]: tx for tx in existing_transactions}
    for tx in new_transactions:
        merged_by_id[tx["id"]] = tx
    all_transactions = list(merged_by_id.values())

    # --- 8. Interne Überträge matchen (§7.3) ---
    transfer_issues, transfer_matched, transfer_unmatched = match_transfers(all_transactions)

    # --- 10. FIFO & Aggregation auf dem Gesamtbestand (§7) ---
    rl.phase(f"FIFO über Gesamtbestand ({len({t['isin'] for t in all_transactions if t.get('isin')})} ISINs) "
              "neu berechnet")
    positions, fifo_issues = compute_portfolio(all_transactions)

    all_issues = transfer_issues + fifo_issues
    mismatch_issues = [i for i in all_issues if i["code"] == "FIFO_MISMATCH"]
    if args.strict and mismatch_issues:
        rl.error(f"{len(mismatch_issues)} FIFO_MISMATCH-Warnung(en) - Abbruch wegen --strict")
        return 1

    # securities.json ist kumulativ (§2.3): bereits bekannte Stammdaten laden (verwahrart lebt
    # nur dort, nicht in transactions.json), mit den heute neu gewonnenen Daten ergänzen, und mit
    # einem Fallback aus dem Gesamtbestand absichern (deckt auch reine Scalable-ISINs ab).
    existing_securities = [] if args.full else load_json(securities_path, [])
    fallback_entries = [{"isin": tx.get("isin"), "wkn": tx.get("wkn"), "name": tx.get("name"),
                          "verwahrart": None, "currency": tx.get("currency")} for tx in all_transactions]
    securities = build_securities(existing_securities + securities_entries + fallback_entries)

    # Zähl-Zusammenfassung für warnings.json (§2.4) - bezieht sich auf DIESEN Lauf
    by_type = {"BUY": 0, "SELL": 0, "TRANSFER_IN": 0, "TRANSFER_OUT": 0, "CASH": 0}
    for tx in new_transactions:
        by_type[tx["type"]] = by_type.get(tx["type"], 0) + 1

    summary = {
        "pdfs_seen": len(disc["all_pdfs"]),
        "pdfs_parsed": len(new_pdfs) - pdf_parse_errors,
        "pdfs_skipped": len(disc["skipped_pdfs"]),
        "scalable_csv_rows": scalable_rows_raw_count,
        "scalable_pending_filtered": scalable_pending_filtered,
        "transfer_in_csv_rows": len(transfer_rows),
        "transfer_pairs_matched": transfer_matched,
        "transfer_pairs_unmatched": transfer_unmatched,
        "transactions_total": len(new_transactions),
        "buys": by_type["BUY"],
        "sells": by_type["SELL"],
        "transfers": by_type["TRANSFER_IN"] + by_type["TRANSFER_OUT"],
        "cash": by_type["CASH"],
    }
    warnings_doc = {"summary": summary, "issues": all_issues}
    portfolio_doc = {
        "generated_at": run_at,
        "positions": sorted(positions, key=lambda p: p["isin"]),
    }

    code_counts = {}
    for i in all_issues:
        code_counts[i["code"]] = code_counts.get(i["code"], 0) + 1
    warn_summary = ", ".join(f"{n}× {c}" for c, n in sorted(code_counts.items()))
    rl.phase(f"Warnungen: {len(all_issues)}" + (f"  ({warn_summary})" if warn_summary else "")
              + " - siehe warnings.json")

    # --- 11. Schreiben (§2, §12.2, §12.4) ---
    written_lines = []
    if args.dry_run:
        rl.phase("Dry-Run: nichts geschrieben")
    else:
        atomic_write_json(transactions_path, all_transactions)
        atomic_write_json(portfolio_path, portfolio_doc)
        atomic_write_json(securities_path, securities)
        atomic_write_json(warnings_path, warnings_doc)

        delta_path = write_delta(out_dir, run_id, run_at, base_count_before, new_transactions)

        for tx in new_transactions:
            source = "comdirect_transfer" if (tx["source"] == "comdirect" and tx["type"] == "TRANSFER_IN") else tx["source"]
            mark_processed(state, tx["id"], source, tx["raw_ref"], run_id)
        write_state(state_path, state, run_id, run_at, len(new_transactions))

        rl.phase("Geschrieben:")
        written_lines = [
            f"{transactions_path} .......... {len(all_transactions)} Transaktionen (+{len(new_transactions)})",
            f"{portfolio_path} ............. {len(positions)} Positionen",
            f"{delta_path} .... {len(new_transactions)} neue",
            f"{state_path} . fortgeschrieben ({len(state['processed'])} Dokumente)",
        ]
        for l in written_lines:
            rl.line(l)

    elapsed = time.time() - t_start

    # Schluss-Zusammenfassung (§13) - erscheint immer, auch bei --quiet.
    rl.final("")
    rl.final(f"Depot-Parser · Lauf {run_id} abgeschlossen in {elapsed:.1f} s")
    rl.final(f"  Neue Transaktionen: {len(new_transactions)}  |  Gesamt: {len(all_transactions)}  |  "
             f"Positionen: {len(positions)}  |  Warnungen: {len(all_issues)}"
             + (f"  ({warn_summary})" if warn_summary else ""))
    if args.dry_run:
        rl.final("  Dry-Run: nichts geschrieben")
    else:
        for l in written_lines:
            rl.final(f"  {l}")
    if cfg and cfg.get("owner_label"):
        rl.final(f"  Depot/Inhaber: {cfg['owner_label']}  (im Import-Screen entsprechend zuordnen)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
