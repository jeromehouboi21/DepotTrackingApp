import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from comdirect.filename import parse_filename


def test_new_format():
    r = parse_filename(
        "Wertpapierabrechnung_Verkauf_305_St._A2PX00_(BICO_GROUP_AK_B_O.N.)_vom_07.05.2026_C361EB.pdf"
    )
    assert r["type"] == "SELL"
    assert r["shares"] == 305.0
    assert r["wkn"] == "A2PX00"
    assert r["date"] == "2026-05-07"
    assert r["id"] == "C361EB"


def test_old_format_wkn_prefix():
    r = parse_filename(
        "Wertpapierabrechnung_Kauf_0,443_St._WKN_A0B94X_(FORTIS_L-OBAM_EQ.W._INH.C)_vom_03.11.2008_5962F7.pdf"
    )
    assert r["type"] == "BUY"
    assert r["shares"] == 0.443
    assert r["wkn"] == "A0B94X"
    assert r["date"] == "2008-11-03"


def test_bond_nominal():
    r = parse_filename(
        "Wertpapierabrechnung_Kauf_1.000_EUR_A285PC_(NESTLE_F.I._20_40_MTN)_vom_16.09.2025_40C550.pdf"
    )
    assert r["type"] == "BUY"
    assert r["shares"] == 1000.0
    assert "BOND_NOMINAL" in r["flags"]


def test_non_abrechnung_skipped():
    assert parse_filename(
        "Nichtausführungsanzeige_Verkauf_13_St._A14Y6F_(Alphabet)_vom_14.07.2025_4144B8.pdf"
    ) is None


if __name__ == "__main__":
    test_new_format()
    test_old_format_wkn_prefix()
    test_bond_nominal()
    test_non_abrechnung_skipped()
    print("OK")
