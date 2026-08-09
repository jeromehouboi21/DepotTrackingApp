"""Interner Depotübertrag Scalable -> comdirect: Matching & Neutralisierung (§7.3)."""

from datetime import date, timedelta

WINDOW_DAYS = 3
SHARE_TOLERANCE = 1.0  # Bruchstück-Rest


def match_transfers(transactions: list[dict]) -> list[dict]:
    """Matcht Scalable-TRANSFER_OUT gegen comdirect-TRANSFER_IN je ISIN (aggregiert).

    Beide Seiten sind bereits als INTERNAL_TRANSFER geflaggt und net=0 (§7.3).
    Diese Funktion erzeugt nur die warnings.json-Issues (TRANSFER_UNMATCHED /
    TRANSFER_SHARES_MISMATCH); sie ändert keine Transaction-Felder. Gibt eine
    Liste von Issue-Dicts zurück.
    """
    out_by_isin: dict[str, list[dict]] = {}
    in_by_isin: dict[str, list[dict]] = {}

    for tx in transactions:
        if tx["type"] == "TRANSFER_OUT" and tx["source"] == "scalable":
            out_by_isin.setdefault(tx["isin"], []).append(tx)
        elif tx["type"] == "TRANSFER_IN" and tx["source"] == "comdirect" and "INTERNAL_TRANSFER" in tx.get("flags", []):
            in_by_isin.setdefault(tx["isin"], []).append(tx)

    issues = []
    all_isins = set(out_by_isin) | set(in_by_isin)
    matched = 0
    unmatched = 0

    for isin in sorted(all_isins):
        outs = out_by_isin.get(isin, [])
        ins = in_by_isin.get(isin, [])
        out_shares = sum(t["shares"] for t in outs)
        in_shares = sum(t["shares"] for t in ins)

        if outs and ins:
            if not _dates_within_window(outs, ins, WINDOW_DAYS):
                issues.append({
                    "level": "warn",
                    "code": "TRANSFER_UNMATCHED",
                    "isin": isin,
                    "ref": ",".join(t["id"] for t in outs + ins),
                    "message": f"Scalable-Abgang und comdirect-Eingang für {isin} liegen außerhalb "
                               f"des {WINDOW_DAYS}-Tage-Fensters",
                })
                unmatched += 1
                continue

            diff = out_shares - in_shares
            if abs(diff) > SHARE_TOLERANCE:
                issues.append({
                    "level": "warn",
                    "code": "TRANSFER_SHARES_MISMATCH",
                    "isin": isin,
                    "ref": ",".join(t["id"] for t in outs + ins),
                    "message": f"Scalable-Abgang {out_shares:g} St. vs. comdirect-Eingang {in_shares:g} St. "
                               f"(Differenz {diff:g})",
                })
            elif abs(diff) > 1e-9:
                issues.append({
                    "level": "warn",
                    "code": "TRANSFER_SHARES_MISMATCH",
                    "isin": isin,
                    "ref": ",".join(t["id"] for t in outs + ins),
                    "message": f"Scalable-Abgang {out_shares:g} St. vs. comdirect-Eingang {in_shares:g} St. "
                               f"(Bruchstück-Rest {diff:g})",
                })
            matched += 1
        else:
            unmatched += 1
            side = "comdirect-Eingang" if ins else "Scalable-Abgang"
            other = "Scalable-Abgang" if ins else "comdirect-Eingang"
            issues.append({
                "level": "warn",
                "code": "TRANSFER_UNMATCHED",
                "isin": isin,
                "ref": ",".join(t["id"] for t in (outs + ins)),
                "message": f"{side} für {isin} ohne passenden {other}",
            })

    return issues, matched, unmatched


def _dates_within_window(outs: list[dict], ins: list[dict], window_days: int) -> bool:
    out_dates = [date.fromisoformat(t["date"]) for t in outs]
    in_dates = [date.fromisoformat(t["date"]) for t in ins]
    for od in out_dates:
        for idt in in_dates:
            if abs((od - idt).days) <= window_days:
                return True
    return False
