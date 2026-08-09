"""comdirect-Wertpapiereingänge aus Depotübertrag-CSV (§4.6)."""

import csv
import os
from datetime import datetime

from core.numbers import parse_de_number


def _iso_date(de_date: str) -> str:
    return datetime.strptime(de_date.strip(), "%d.%m.%Y").date().isoformat()


def read_transfer_csv(path: str) -> list[dict]:
    """Liest die Depotübertrag-Eingangs-CSV vollständig ein."""
    rows = []
    source_file = os.path.basename(path)
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for i, row in enumerate(reader, start=2):
            row = {k.strip(): (v.strip() if v is not None else v) for k, v in row.items()}
            row["_source_file"] = source_file
            row["_source_line"] = i
            rows.append(row)
    return rows


def to_transaction(row: dict) -> dict:
    """Mappt eine CSV-Zeile ins Transaction-Schema (§2.1 / §4.6)."""
    tx_id = row.get("interne_referenz") or row.get("rechnungsnummer")
    flags = []
    if (row.get("abgebende_stelle") or "").strip().lower() == "scalable":
        flags.append("INTERNAL_TRANSFER")

    return {
        "id": tx_id,
        "source": "comdirect",
        "date": _iso_date(row["erstellungsdatum"]),
        "type": "TRANSFER_IN",
        "isin": row.get("isin"),
        "wkn": row.get("wkn") or None,
        "name": row.get("bezeichnung"),
        "shares": parse_de_number(row["stueck"]),
        "price": 0.0,
        "gross": 0.0,
        "fees": parse_de_number(row["kosten_lagerstelle_eur"]) if row.get("kosten_lagerstelle_eur") else 0.0,
        "tax": 0.0,
        "net": 0.0,
        "currency": row.get("waehrung") or "EUR",
        "raw_ref": f"{row.get('_source_file', 'comdirect_wertpapiereingang_depotuebertrag.csv')}#L{row.get('_source_line', '?')}",
        "reported_realized_pl": None,
        "cost_lots": [],
        "flags": flags,
    }
