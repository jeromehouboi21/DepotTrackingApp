import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from comdirect.transfer_csv import read_transfer_csv, to_transaction as transfer_to_tx
from scalable.csv_reader import read_scalable_csv, to_transaction as scalable_to_tx

BASE = r"C:\ComdirectPDFs"


def test_transfer_csv_11_rows():
    """§10.6: 11 TRANSFER_IN-Transaktionen, net=0, fees=kosten_lagerstelle_eur."""
    candidates = [f for f in glob.glob(os.path.join(BASE, "*.csv"))
                  if "wertpapiereingang" in os.path.basename(f).lower()
                  and "depotuebertrag" in os.path.basename(f).lower()]
    assert candidates, "keine Depotübertrag-CSV gefunden"
    rows = read_transfer_csv(candidates[0])
    assert len(rows) == 11
    for row in rows:
        tx = transfer_to_tx(row)
        assert tx["type"] == "TRANSFER_IN"
        assert tx["net"] == 0.0
        assert tx["isin"] and tx["wkn"]
        assert tx["fees"] > 0
        assert "INTERNAL_TRANSFER" in tx["flags"]  # alle 11 kommen von Scalable


def test_scalable_csv_no_pending():
    """§10.3: kein Pending in der Ausgabe."""
    candidates = glob.glob(os.path.join(BASE, "*ScalableCapital-Broker-Transactions.csv"))
    assert candidates
    path = max(candidates, key=os.path.getmtime)
    rows = read_scalable_csv(path)
    assert all(r["status"] != "Pending" for r in rows)

    cash_types = set()
    for row in rows:
        tx = scalable_to_tx(row)
        if tx is None:
            continue
        if row["assetType"] == "Cash":
            cash_types.add(row["type"])
            assert tx["type"] == "CASH"
    assert cash_types  # es gibt tatsächlich Cash-Zeilen im Datensatz


def test_scalable_transfer_out_is_internal_and_net_zero():
    candidates = glob.glob(os.path.join(BASE, "*ScalableCapital-Broker-Transactions.csv"))
    path = max(candidates, key=os.path.getmtime)
    rows = read_scalable_csv(path)
    transfers = [scalable_to_tx(r) for r in rows if r["type"] == "Security transfer"]
    assert len(transfers) == 57
    assert all(t["type"] == "TRANSFER_OUT" for t in transfers)
    assert all(t["net"] == 0.0 for t in transfers)
    assert all("INTERNAL_TRANSFER" in t["flags"] for t in transfers)


if __name__ == "__main__":
    test_transfer_csv_11_rows()
    test_scalable_csv_no_pending()
    test_scalable_transfer_out_is_internal_and_net_zero()
    print("OK")
