import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from comdirect.filename import parse_filename
from comdirect.pdf import parse_pdf
from core.model import build_comdirect_transaction

BASE = r"C:\ComdirectPDFs\Abrechnungen"


def test_bico_reference_pdf():
    """§10.1: BICO-Verkauf vom 07.05.2026, -707,58 EUR, realized_pl_matches=True."""
    candidates = glob.glob(os.path.join(BASE, "Wertpapierabrechnung_Verkauf_305_St._A2PX00*"))
    assert candidates, "BICO-Referenz-PDF nicht gefunden"
    fn = os.path.basename(candidates[0])
    fname = parse_filename(fn)
    pdf_fields = parse_pdf(candidates[0], fname["shares"])
    tx = build_comdirect_transaction(fname, pdf_fields, fn).to_dict()

    assert tx["isin"] == "SE0013647385"
    assert tx["wkn"] == "A2PX00"
    assert tx["type"] == "SELL"
    assert tx["shares"] == 305.0
    assert abs(tx["net"] - 542.85) < 0.001
    assert abs(tx["fees"] - 15.30) < 0.001
    assert abs(tx["tax"] - 0.0) < 0.001
    assert abs(tx["reported_realized_pl"] - (-707.58)) < 0.001
    assert len(tx["cost_lots"]) == 3
    total_cost = sum(l["cost"] for l in tx["cost_lots"])
    assert abs(total_cost - 1250.43) < 0.01
    own_realized = tx["net"] - total_cost
    assert abs(own_realized - (-707.58)) < 0.01


def test_old_format_flag():
    candidates = glob.glob(os.path.join(
        BASE, "Wertpapierabrechnung_Kauf_0,443_St._WKN_A0B94X*"))
    assert candidates
    fn = os.path.basename(candidates[0])
    fname = parse_filename(fn)
    pdf_fields = parse_pdf(candidates[0], fname["shares"])
    tx = build_comdirect_transaction(fname, pdf_fields, fn).to_dict()
    assert "OLD_FORMAT" in tx["flags"]
    assert pdf_fields["format"] == "old"
    assert tx["net"] < 0  # BUY -> negativ


if __name__ == "__main__":
    test_bico_reference_pdf()
    test_old_format_flag()
    print("OK")
