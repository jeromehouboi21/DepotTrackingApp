"""Scalable-Capital-Broker-Transactions-CSV-Parsing (§5)."""

import csv

from core.numbers import parse_de_number

TYPE_MAP = {
    ("Security", "Savings plan"): "BUY",
    ("Security", "Buy"): "BUY",
    ("Security", "Sell"): "SELL",
    ("Security", "Security transfer"): "TRANSFER_OUT",
    ("Cash", "Deposit"): "CASH",
    ("Cash", "Withdrawal"): "CASH",
    ("Cash", "Interest"): "CASH",
    ("Cash", "Fee"): "CASH",
    ("Cash", "Taxes"): "CASH",
    ("Cash", "Distribution"): "CASH",
    ("Cash", "Cash Transfer Out"): "CASH",
}


def read_scalable_csv(path: str) -> list[dict]:
    """Liest die Scalable-CSV ein, filtert 'Pending' Zeilen aus."""
    rows = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";", quotechar='"')
        for row in reader:
            row = {k.strip(): (v.strip() if v is not None else v) for k, v in row.items()}
            if row.get("status") == "Pending":
                continue
            rows.append(row)
    return rows


def _num(s: str | None) -> float:
    if s is None or s == "":
        return 0.0
    return parse_de_number(s)


def to_transaction(row: dict) -> dict | None:
    """Mappt eine Scalable-CSV-Zeile ins Transaction-Schema (§2.1 / §5). None bei unbekanntem Typ."""
    key = (row.get("assetType"), row.get("type"))
    tx_type = TYPE_MAP.get(key)
    if tx_type is None:
        return None

    shares = abs(_num(row.get("shares")))
    price = _num(row.get("price"))
    amount = _num(row.get("amount"))
    fee = abs(_num(row.get("fee")))
    tax = abs(_num(row.get("tax")))
    gross = round(shares * price, 10) if shares and price else abs(amount)

    flags = ["INTERNAL_TRANSFER"] if tx_type == "TRANSFER_OUT" else []

    return {
        "id": row["reference"],
        "source": "scalable",
        "date": row["date"],
        "type": tx_type,
        "isin": row.get("isin") or None,
        "wkn": None,
        "name": row.get("description"),
        "shares": shares,
        "price": price,
        "gross": gross,
        "fees": fee,
        "tax": tax,
        "net": 0.0 if tx_type == "TRANSFER_OUT" else amount,
        "currency": row.get("currency") or "EUR",
        "raw_ref": row["reference"],
        "reported_realized_pl": None,
        "cost_lots": [],
        "flags": flags,
    }
