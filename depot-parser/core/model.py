"""Transaction/Position-Datenklassen & comdirect-PDF -> Transaction-Mapping (§2.1, §4)."""

from dataclasses import dataclass, field, asdict


@dataclass
class Transaction:
    id: str
    source: str
    date: str
    type: str
    isin: str | None
    wkn: str | None
    name: str | None
    shares: float
    price: float
    gross: float
    fees: float
    tax: float
    net: float
    currency: str
    raw_ref: str
    reported_realized_pl: float | None = None
    cost_lots: list = field(default_factory=list)
    flags: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def build_comdirect_transaction(fname: dict, pdf: dict, raw_ref: str) -> Transaction:
    """Kombiniert Dateiname- (§4.1) und PDF-Text-Felder (§4.3) zu einer Transaction.

    Vorzeichen-Konvention (§2.1): BUY -> net negativ, SELL -> net positiv.
    """
    tx_type = fname["type"]
    net_magnitude = pdf["net_magnitude"] if pdf["net_magnitude"] is not None else 0.0
    net = -abs(net_magnitude) if tx_type == "BUY" else abs(net_magnitude)

    flags = list(dict.fromkeys(fname.get("flags", []) + pdf.get("flags", [])))

    shares = fname["shares"]
    price = pdf["price"] if pdf["price"] is not None else 0.0
    gross = pdf["gross"] if pdf["gross"] is not None else 0.0

    return Transaction(
        id=fname["id"],
        source="comdirect",
        date=fname["date"],
        type=tx_type,
        isin=pdf["isin"],
        wkn=fname["wkn"],
        name=fname["name"],
        shares=shares,
        price=price,
        gross=gross,
        fees=pdf["fees"],
        tax=pdf["tax"] if pdf["tax"] is not None else 0.0,
        net=net,
        currency="EUR",
        raw_ref=raw_ref,
        reported_realized_pl=pdf["reported_realized_pl"] if tx_type == "SELL" else None,
        cost_lots=pdf["cost_lots"] if tx_type == "SELL" else [],
        flags=flags,
    )
