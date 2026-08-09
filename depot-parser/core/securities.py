"""WKN<->ISIN-Mapping & Stammdaten (§2.3, §6)."""


def build_securities(entries: list[dict]) -> list[dict]:
    """entries: [{isin, wkn, name, verwahrart, currency}, ...] -> dedupliziert je ISIN."""
    by_isin: dict[str, dict] = {}
    for e in entries:
        isin = e.get("isin")
        if not isin:
            continue
        rec = by_isin.setdefault(isin, {"isin": isin, "wkn": None, "name": None,
                                         "verwahrart": None, "currency": None})
        for field in ("wkn", "name", "verwahrart", "currency"):
            if not rec.get(field) and e.get(field):
                rec[field] = e[field]

    return [by_isin[isin] for isin in sorted(by_isin)]
