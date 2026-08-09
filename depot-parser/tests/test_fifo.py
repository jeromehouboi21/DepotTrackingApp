import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.fifo import compute_portfolio
from core.transfers import match_transfers


def _tx(**kw):
    base = {
        "id": None, "source": "comdirect", "date": None, "type": None, "isin": "TEST0000001",
        "wkn": "TST123", "name": "Test AG", "shares": 0.0, "price": 0.0, "gross": 0.0,
        "fees": 0.0, "tax": 0.0, "net": 0.0, "currency": "EUR", "raw_ref": "test",
        "reported_realized_pl": None, "cost_lots": [], "flags": [],
    }
    base.update(kw)
    return base


def test_bico_reference_case():
    """§10.1: eigene FIFO-Realisierung -707,58 EUR, Bestand danach 0."""
    txs = [
        _tx(id="B1", date="2021-11-22", type="BUY", shares=10.0, net=-337.90),
        _tx(id="B2", date="2022-11-10", type="BUY", shares=45.0, net=-330.21),
        _tx(id="B3", date="2025-11-04", type="BUY", shares=250.0, net=-582.32),
        _tx(id="C361EB", date="2026-05-07", type="SELL", shares=305.0, net=542.85,
            reported_realized_pl=-707.58,
            cost_lots=[
                {"date": "2021-11-22", "shares": 10.0, "cost": 337.90},
                {"date": "2022-11-10", "shares": 45.0, "cost": 330.21},
                {"date": "2025-11-04", "shares": 250.0, "cost": 582.32},
            ]),
    ]
    positions, issues = compute_portfolio(txs)
    assert len(positions) == 1
    pos = positions[0]
    assert abs(pos["realized_pl"] - (-707.58)) < 0.01
    assert pos["realized_pl_matches"] is True
    assert pos["shares_held"] == 0.0
    assert not [i for i in issues if i["code"] == "FIFO_MISMATCH"]


def test_fifo_mismatch_flagged_but_reported_wins():
    txs = [
        _tx(id="B1", date="2020-01-01", type="BUY", shares=10.0, net=-100.0),
        _tx(id="S1", date="2020-06-01", type="SELL", shares=10.0, net=150.0,
            reported_realized_pl=40.0),  # eigene Rechnung: 150-100=50, gemeldet 40 -> Abweichung
    ]
    positions, issues = compute_portfolio(txs)
    pos = positions[0]
    assert pos["realized_pl"] == 40.0  # gemeldeter Wert ist maßgeblich
    assert pos["realized_pl_matches"] is False
    assert any(i["code"] == "FIFO_MISMATCH" for i in issues)


def test_no_cost_basis_sell():
    txs = [
        _tx(id="S1", date="2020-06-01", type="SELL", shares=10.0, net=150.0),
    ]
    positions, issues = compute_portfolio(txs)
    pos = positions[0]
    assert pos["realized_pl"] == 0.0  # kein own_realized, kein reported -> nichts addiert
    assert any(i["code"] == "NO_COST_BASIS" for i in issues)


def test_internal_transfer_neutralized_and_matched():
    """§10.4/§10.5: Übertrag erzeugt keinen G/V, Lots bleiben für späteren Verkauf offen."""
    txs = [
        _tx(id="B1", source="scalable", date="2020-01-01", type="BUY", shares=100.0, net=-1000.0,
            isin="XX0000000001"),
        _tx(id="T_OUT", source="scalable", date="2026-07-22", type="TRANSFER_OUT", shares=100.0,
            net=0.0, flags=["INTERNAL_TRANSFER"], isin="XX0000000001"),
        _tx(id="T_IN", source="comdirect", date="2026-07-23", type="TRANSFER_IN", shares=100.0,
            net=0.0, flags=["INTERNAL_TRANSFER"], isin="XX0000000001"),
        _tx(id="S1", source="comdirect", date="2026-08-01", type="SELL", shares=100.0, net=1200.0,
            isin="XX0000000001"),
    ]
    positions, issues = compute_portfolio(txs)
    pos = positions[0]
    assert abs(pos["realized_pl"] - 200.0) < 0.01  # 1200 - 1000, Kostenbasis überlebt den Übertrag
    assert pos["shares_held"] == 0.0
    assert not [i for i in issues if i["code"] == "NO_COST_BASIS"]

    transfer_issues, matched, unmatched = match_transfers(txs)
    assert matched == 1
    assert unmatched == 0
    assert not transfer_issues


if __name__ == "__main__":
    test_bico_reference_case()
    test_fifo_mismatch_flagged_but_reported_wins()
    test_no_cost_basis_sell()
    test_internal_transfer_neutralized_and_matched()
    print("OK")
