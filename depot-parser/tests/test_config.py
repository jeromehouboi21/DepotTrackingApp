import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from parse import discover_from_config


def _touch(path):
    with open(path, "w", encoding="utf-8") as f:
        f.write("")


def test_alle_quellen_aktiv():
    with tempfile.TemporaryDirectory() as tmp:
        abr = os.path.join(tmp, "Abrechnungen")
        os.makedirs(abr)
        _touch(os.path.join(abr, "Wertpapierabrechnung_Kauf_1_St._A1B2C3_(TEST)_vom_01.01.2025_ABCDEF.pdf"))
        _touch(os.path.join(abr, "Nichtausführungsanzeige_Verkauf_1_St._A1B2C3_(TEST)_vom_01.01.2025_ABCDEF.pdf"))
        scalable_csv = os.path.join(tmp, "scalable.csv")
        transfer_csv = os.path.join(tmp, "transfer.csv")
        _touch(scalable_csv)
        _touch(transfer_csv)

        cfg = {
            "out": "./output",
            "sources": {
                "comdirect": {"enabled": True, "abrechnungen_dir": abr},
                "scalable": {"enabled": True, "csv": scalable_csv},
                "transfer": {"enabled": True, "csv": transfer_csv},
            },
        }
        disc = discover_from_config(cfg)
        assert disc["abrechnungen_dir"] == abr
        assert len(disc["all_pdfs"]) == 2
        assert len(disc["wp_pdfs"]) == 1
        assert len(disc["skipped_pdfs"]) == 1
        assert disc["scalable_csv"] == scalable_csv
        assert disc["transfer_csv"] == transfer_csv
        # Schluessel-Schema identisch zu discover()
        assert set(disc.keys()) == {
            "abrechnungen_dir", "all_pdfs", "wp_pdfs", "skipped_pdfs", "scalable_csv", "transfer_csv",
        }


def test_nur_comdirect_deterministisch_ohne_scalable():
    with tempfile.TemporaryDirectory() as tmp:
        abr = os.path.join(tmp, "Abrechnungen")
        os.makedirs(abr)
        _touch(os.path.join(abr, "Wertpapierabrechnung_Kauf_1_St._A1B2C3_(TEST)_vom_01.01.2025_ABCDEF.pdf"))
        # absichtlich eine Scalable-CSV danebenlegen, die NICHT aufgegriffen werden darf,
        # weil scalable.enabled fehlt/false ist - genau das Foot-Gun aus §1.
        _touch(os.path.join(tmp, "2026-01-01_ScalableCapital-Broker-Transactions.csv"))

        cfg = {
            "sources": {
                "comdirect": {"enabled": True, "abrechnungen_dir": abr},
                "scalable": {"enabled": False},
                "transfer": {"enabled": False},
            },
        }
        disc = discover_from_config(cfg)
        assert len(disc["wp_pdfs"]) == 1
        assert disc["scalable_csv"] is None
        assert disc["transfer_csv"] is None


def test_aktiviert_aber_pfad_fehlt_bricht_ab():
    cfg = {
        "sources": {
            "comdirect": {"enabled": False},
            "scalable": {"enabled": True, "csv": r"C:\nicht\vorhanden.csv"},
            "transfer": {"enabled": False},
        },
    }
    try:
        discover_from_config(cfg)
        assert False, "SystemExit erwartet"
    except SystemExit as e:
        assert "scalable" in str(e)


def test_comdirect_aktiviert_ohne_verzeichnis_bricht_ab():
    cfg = {
        "sources": {
            "comdirect": {"enabled": True, "abrechnungen_dir": r"C:\nicht\vorhanden"},
        },
    }
    try:
        discover_from_config(cfg)
        assert False, "SystemExit erwartet"
    except SystemExit as e:
        assert "comdirect" in str(e)


if __name__ == "__main__":
    test_alle_quellen_aktiv()
    test_nur_comdirect_deterministisch_ohne_scalable()
    test_aktiviert_aber_pfad_fehlt_bricht_ab()
    test_comdirect_aktiviert_ohne_verzeichnis_bricht_ab()
    print("OK")
