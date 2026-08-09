"""Dateiname-Parsing für comdirect-Wertpapierabrechnungen (§4.1)."""

import re
from datetime import datetime

from core.numbers import parse_de_number

FILENAME_RE = re.compile(
    r"Wertpapierabrechnung_(?P<richtung>Kauf|Verkauf)_"
    r"(?P<stueck>[\d.,]+)_(?:St\.|(?P<nomcur>EUR|USD|GBP|CHF))_"
    r"(?:WKN_)?(?P<wkn>[A-Z0-9]{6})_?"
    r"\((?P<name>.+?)\)_vom_"
    r"(?P<datum>\d{2}\.\d{2}\.\d{4})_"
    r"(?P<hash>[A-F0-9]{6})\.pdf$",
    re.IGNORECASE,
)


def parse_filename(filename: str) -> dict | None:
    """Extrahiert die Kernfelder aus dem Dateinamen. None, wenn kein Treffer.

    Sonderfall: Anleihen (MTN) werden mit Nominalbetrag + Währung statt
    "St." benannt (z.B. "..._1.000_EUR_..."); erhalten das Flag BOND_NOMINAL.
    """
    m = FILENAME_RE.match(filename)
    if not m:
        return None
    richtung = m.group("richtung").lower()
    shares = parse_de_number(m.group("stueck"))
    wkn = m.group("wkn").upper()
    name = m.group("name").replace("_", " ").strip()
    date = datetime.strptime(m.group("datum"), "%d.%m.%Y").date().isoformat()
    doc_hash = m.group("hash").upper()
    flags = ["BOND_NOMINAL"] if m.group("nomcur") else []
    return {
        "type": "BUY" if richtung == "kauf" else "SELL",
        "shares": shares,
        "wkn": wkn,
        "name": name,
        "date": date,
        "id": doc_hash,
        "flags": flags,
    }
