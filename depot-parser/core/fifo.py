"""FIFO & Aggregation je ISIN (§7)."""

TOLERANCE = 0.02


def compute_portfolio(transactions: list[dict]) -> tuple[list[dict], list[dict]]:
    """Berechnet für jede ISIN Restbestand, Ø-Kosten und realisierten G/V per FIFO.

    Läuft immer über den GESAMTbestand (§3 Schritt 10). Gibt (positions, issues) zurück.
    """
    by_isin: dict[str, list[dict]] = {}
    for tx in transactions:
        if not tx.get("isin"):
            continue
        by_isin.setdefault(tx["isin"], []).append(tx)

    positions = []
    issues = []

    for isin, txs in sorted(by_isin.items()):
        txs_sorted = sorted(txs, key=lambda t: (t["date"], t["id"]))
        pos, pos_issues = _compute_position(isin, txs_sorted)
        positions.append(pos)
        issues.extend(pos_issues)

    return positions, issues


def _compute_position(isin: str, txs: list[dict]) -> tuple[dict, list[dict]]:
    lots: list[dict] = []  # {date, shares, cost_per_share, tx_id}
    realized_pl_own_total = 0.0
    realized_pl_authoritative_total = 0.0
    realized_pl_reported_total = 0.0
    has_reported = False
    all_matched = True
    total_fees = 0.0
    total_invested = 0.0
    sources = set()
    tx_ids = []
    issues = []
    name = None
    wkn = None

    for tx in txs:
        sources.add(tx["source"])
        tx_ids.append(tx["id"])
        total_fees += tx.get("fees") or 0.0
        if tx.get("name"):
            name = tx["name"]
        if tx.get("wkn"):
            wkn = tx["wkn"]

        if tx["type"] in ("TRANSFER_IN", "TRANSFER_OUT", "CASH"):
            # §7.3: interne Überträge neutralisieren - Lots bleiben unangetastet.
            continue

        if tx["type"] == "BUY":
            shares = tx["shares"]
            if shares <= 0:
                continue
            cost = abs(tx["net"])
            lots.append({
                "date": tx["date"],
                "shares": shares,
                "cost_per_share": cost / shares,
                "tx_id": tx["id"],
            })
            total_invested += cost

        elif tx["type"] == "SELL":
            shares_to_sell = tx["shares"]
            available = sum(l["shares"] for l in lots)

            if available <= 1e-9:
                issues.append({
                    "level": "warn",
                    "code": "NO_COST_BASIS",
                    "isin": isin,
                    "ref": tx["raw_ref"],
                    "message": f"Verkauf ohne zuordenbaren Kauf und ohne Kostenlots "
                               f"({shares_to_sell:g} St. {isin})",
                })
                own_realized = None
            else:
                if available + 1e-9 < shares_to_sell:
                    issues.append({
                        "level": "warn",
                        "code": "NO_COST_BASIS",
                        "isin": isin,
                        "ref": tx["raw_ref"],
                        "message": f"Verkauf ({shares_to_sell:g} St.) übersteigt bekannten Bestand "
                                   f"({available:g} St.) - Restbestand ohne Kostenbasis",
                    })
                matched_cost = 0.0
                remaining = shares_to_sell
                while remaining > 1e-9 and lots:
                    lot = lots[0]
                    take = min(lot["shares"], remaining)
                    matched_cost += take * lot["cost_per_share"]
                    lot["shares"] -= take
                    remaining -= take
                    if lot["shares"] <= 1e-9:
                        lots.pop(0)
                own_realized = tx["net"] - matched_cost

            reported = tx.get("reported_realized_pl")
            if reported is not None:
                has_reported = True
                realized_pl_reported_total += reported
                authoritative = reported
                if own_realized is not None and abs(own_realized - reported) > TOLERANCE:
                    all_matched = False
                    issues.append({
                        "level": "warn",
                        "code": "FIFO_MISMATCH",
                        "isin": isin,
                        "ref": tx["raw_ref"],
                        "message": f"Eigene FIFO {own_realized:.2f} vs. gemeldet {reported:.2f}",
                    })
            else:
                authoritative = own_realized

            if own_realized is not None:
                realized_pl_own_total += own_realized
            if authoritative is not None:
                realized_pl_authoritative_total += authoritative

    open_lots = [
        {"date": l["date"], "shares": round(l["shares"], 10), "cost_per_share": l["cost_per_share"]}
        for l in lots if l["shares"] > 1e-9
    ]
    shares_held = sum(l["shares"] for l in open_lots)
    cost_basis_remaining = sum(l["shares"] * l["cost_per_share"] for l in open_lots)
    avg_cost = cost_basis_remaining / shares_held if shares_held > 1e-9 else 0.0

    position = {
        "isin": isin,
        "wkn": wkn,
        "name": name,
        "sources": sorted(sources),
        "shares_held": shares_held,
        "avg_cost": avg_cost,
        "cost_basis_remaining": cost_basis_remaining,
        "realized_pl": realized_pl_authoritative_total,
        "realized_pl_reported": realized_pl_reported_total if has_reported else None,
        "realized_pl_matches": all_matched,
        "total_fees": total_fees,
        "total_invested": total_invested,
        "open_lots": open_lots,
        "tx_ids": tx_ids,
    }
    return position, issues
