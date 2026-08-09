"""PDF-Text-Extraktion & Feld-Anker für comdirect-Wertpapierabrechnungen (§4.2-4.3)."""

import re

import pdfplumber

from core.numbers import parse_de_number, parse_signed_amount

ISIN_RE = re.compile(r"\b([A-Z]{2}[A-Z0-9]{9}\d)\b")
AMOUNT_TOKEN = r"-?[\d.]+,\d+-?"
AMOUNT_RE = re.compile(AMOUNT_TOKEN)

NEW_FORMAT_RE = re.compile(r"GESCH.FTSABRECHNUNG\s*VOM")
OLD_FORMAT_RE = re.compile(r"\bABRECHNUNG\s*VOM\b")

FEE_LABEL_RE = re.compile(
    r"^(.+?)\s*:\s*EUR\s*(" + AMOUNT_TOKEN + r")\s*$",
    re.IGNORECASE,
)

COST_LOT_RE = re.compile(
    r"Anschaffung\s*vom\s*(\d{2}\.\d{2}\.\d{4})\s*([\d.,]+)\s*St.ck\s*EUR\s*(" + AMOUNT_TOKEN + r")",
    re.IGNORECASE,
)


def _iso_date(de_date: str) -> str:
    d, m, y = de_date.split(".")
    return f"{y}-{m}-{d}"


def _normalize(text: str | None) -> str:
    """Entfernt Unterstrich-Artefakte (unterstrichene Beträge) aus pdfplumber-Text."""
    if not text:
        return ""
    return text.replace("_", "")


def _compact(text: str) -> str:
    """Fallback für Fonds-Steuermitteilungen (Investmentfonds-Verkäufe): dort rendert
    pdfplumber gelegentlich jedes einzelne Zeichen mit Leerzeichen umgeben
    ("S t e u e r b e m e s s u n g s ..."), sodass Wort-Anker nicht mehr greifen.
    Da alle Anker-Regexe ohnehin \\s* zwischen den Tokens verwenden, macht das
    komplette Entfernen aller Leerzeichen sie wieder treffsicher."""
    return re.sub(r"\s+", "", text or "")


def extract_pages(path: str) -> list[str]:
    with pdfplumber.open(path) as pdf:
        return [_normalize(page.extract_text(x_tolerance=1.5)) for page in pdf.pages]


def detect_format(pages: list[str]) -> str:
    full = "\n".join(pages)
    if NEW_FORMAT_RE.search(full):
        return "new"
    if OLD_FORMAT_RE.search(full):
        return "old"
    return "unknown"


def extract_isin(page1: str) -> str | None:
    anchor = re.search(r"WPKNR\s*/\s*ISIN", page1, re.IGNORECASE)
    search_from = anchor.end() if anchor else 0
    window = page1[search_from:search_from + 400]
    m = ISIN_RE.search(window)
    if m:
        return m.group(1)
    # Fallback: irgendwo auf Seite 1 suchen
    m = ISIN_RE.search(page1)
    return m.group(1) if m else None


def extract_price_and_gross(page1: str, shares: float) -> tuple[float | None, float | None]:
    """Kurs & Kurswert in EUR.

    Bei Fremdwährungstiteln (US/HK/UK...) mit Teilausführungen liegt der
    Kurswert nur in Fremdwährung vor; maßgeblich ist dann die Umrechnungszeile
    "Umrechn. zum Dev. kurs ... : EUR <betrag>" (§8 Fremdwährungstitel - die in
    EUR abgerechneten Beträge werden übernommen). `price` wird in diesem Fall
    als EUR-Kurs je Stück aus dem EUR-Kurswert abgeleitet.
    """
    price = None
    m = re.search(r"St\.\s*[\d.,]+\s*EUR\s*(" + AMOUNT_TOKEN + r")", page1)
    if m:
        price = parse_signed_amount(m.group(1))

    gross = None
    m = re.search(r"Kurswert\s*:?\s*EUR\s*(" + AMOUNT_TOKEN + r")", page1)
    if m:
        gross = parse_signed_amount(m.group(1))

    if gross is None:
        m = re.search(r"Umrechnung?\.?\s*zum\s*Dev(?:\.|isen)?\s*kurs.*?EUR\s*(" + AMOUNT_TOKEN + r")",
                       page1, re.IGNORECASE)
        if m:
            gross = parse_signed_amount(m.group(1))

    if gross is None:
        m = re.search(
            r"Summe\s*St\.\s*[\d.,]+\s*(?:EUR|USD|GBP|CHF)\s*" + AMOUNT_TOKEN +
            r"\s*EUR\s*(" + AMOUNT_TOKEN + r")", page1, re.IGNORECASE)
        if m:
            gross = parse_signed_amount(m.group(1))

    if gross is None and price is not None and shares:
        # Festpreisgeschäft (Fonds): nur "St. <n> EUR <Festpreis>", keine eigene Kurswert-Zeile.
        gross = price * shares

    if price is None and gross is not None and shares:
        price = gross / shares

    return price, gross


def extract_fees(page1: str) -> float:
    """Summiert die Entgelte-Positionen (§4.3).

    Das PDF druckt ein nachgestelltes "-" für jeden Betrag, der vom Kurswert
    ABGEZOGEN wird (bei Käufen wie Verkäufen) - das ist eine reine Layout-
    Konvention und sagt nichts über die wirtschaftliche Bedeutung aus. Für das
    `fees`-Feld gilt stattdessen die fachliche Bedeutung des Labels: normale
    Entgelte (Provision, Clearstream, Börsenplatz, Abwicklungsentgelt) zählen
    positiv, eine Bonifikation (Rabatt) zählt negativ (§4.3 Entgelt-Logik).
    """
    m = re.search(r"Eigene\s*Entgelte(.*?)(?:-{5,}|IBAN|Verrechnung\s*.ber\s*Konto|Zu\s*Ihren)",
                   page1, re.IGNORECASE | re.DOTALL)
    if not m:
        return 0.0
    block = m.group(1)
    lines = [l.strip() for l in block.splitlines() if l.strip()]

    summe_line = None
    item_lines = []
    for line in lines:
        fm = FEE_LABEL_RE.match(line)
        if not fm:
            continue
        label, val = fm.group(1), fm.group(2)
        magnitude = abs(parse_signed_amount(val))
        if label.lower().startswith("summe"):
            summe_line = magnitude
        elif label.lower().startswith("bonifikation"):
            item_lines.append(-magnitude)
        else:
            item_lines.append(magnitude)

    if summe_line is not None:
        return summe_line
    return sum(item_lines)


def extract_net(page1: str) -> tuple[float | None, str | None]:
    """Liefert (netto_betrag_magnitude, richtung) mit richtung in {"lasten","gunsten"}."""
    m = re.search(r"Zu\s*Ihren\s*(Lasten|Gunsten)(?:\s*vor\s*Steuern)?", page1, re.IGNORECASE)
    if not m:
        return None, None
    richtung = m.group(1).lower()
    window = page1[m.end(): m.end() + 400]
    end_marker = re.search(r"Verwahrungs-?Art", window, re.IGNORECASE)
    if end_marker:
        window = window[:end_marker.start()]
    matches = AMOUNT_RE.findall(window)
    if not matches:
        return None, richtung
    return parse_signed_amount(matches[-1]), richtung


def extract_tax(page2: str) -> float | None:
    m = re.search(r"abgef.hrte\s*Steuern\s*EUR\s*(" + AMOUNT_TOKEN + r")", page2, re.IGNORECASE)
    if not m:
        return None
    return parse_signed_amount(m.group(1))


def extract_reported_realized_pl(text: str) -> float | None:
    m = re.search(
        r"Steuerbemessungsgrundlage\s*vor\s*Verlustverrechnung\s*(?:\(1\))?\s*EUR\s*(" + AMOUNT_TOKEN + r")",
        text, re.IGNORECASE,
    )
    if not m:
        return None
    return parse_signed_amount(m.group(1))


def extract_verwahrart(page1: str) -> str | None:
    m = re.search(r"Verwahrungs-?Art\s*:?\s*([^\n]+)", page1, re.IGNORECASE)
    if not m:
        return None
    return m.group(1).strip()


def extract_cost_lots(page3: str) -> list[dict]:
    lots = []
    for date_str, shares_str, cost_str in COST_LOT_RE.findall(page3):
        lots.append({
            "date": _iso_date(date_str),
            "shares": parse_de_number(shares_str),
            "cost": abs(parse_signed_amount(cost_str)),
        })
    return lots


LOTS_PAGE_RE = re.compile(r"Hinweise\s*zur\s*Ermittlung", re.IGNORECASE)
TAX_PAGE_RE = re.compile(r"Steuerliche\s*Behandlung", re.IGNORECASE)


def _is_lots_page(p: str, cp: str) -> bool:
    # Die Steuermitteilungs-Seite VERWEIST per Fußnote auf "Hinweise zur
    # Ermittlung ... auf der Folgeseite" - das ist noch keine Kostenlot-Seite,
    # erkennbar am "Folgeseite" kurz danach. Manche Verkäufe (keine eigenen
    # Kauf-Lots zuordenbar) liefern auf der echten Seite trotzdem keine
    # "Anschaffung vom ..."-Zeilen, nur die aggregierte Steuerbemessungs-
    # grundlage - daher NICHT zusätzlich auf "Anschaffung" prüfen.
    for text in (p, cp):
        m = LOTS_PAGE_RE.search(text)
        if not m:
            continue
        window = text[m.end(): m.end() + 60]
        if "folgeseite" in window.lower():
            continue
        return True
    return False


def classify_pages(pages: list[str]) -> tuple[str, str, str]:
    """Ordnet Seiten nach Inhalt statt nach fester Position zu (§4.2).

    Bei umfangreichen Teilausführungen setzt sich die Geschäftsabrechnung
    über mehrere Blätter fort ("Fortsetzung auf Blatt 2"), wodurch sich Steuer-
    und Kostenlot-Seite nach hinten verschieben. Seite 1 (fixer Index) reicht
    dann nicht mehr; stattdessen wird jede Seite anhand ihrer Überschrift der
    Geschäftsabrechnung, der Steuermitteilung oder den Anschaffungskosten-
    Hinweisen zugeordnet.

    Gibt (geschaeft_text, tax_text, lots_text) zurück - geschaeft_text ist die
    Verkettung aller Geschäftsabrechnungs-/Fortsetzungsseiten.
    """
    geschaeft_parts = []
    tax_text = ""
    lots_text = ""
    for p in pages:
        cp = _compact(p)
        if not lots_text and _is_lots_page(p, cp):
            lots_text = p
        elif not tax_text and (TAX_PAGE_RE.search(p) or TAX_PAGE_RE.search(cp)):
            tax_text = p
        else:
            geschaeft_parts.append(p)
    return "\n".join(geschaeft_parts), tax_text, lots_text


def parse_pdf(path: str, shares: float = 0.0) -> dict:
    """Extrahiert alle PDF-Textfelder. Kombiniert mit Dateiname-Daten in core/model.py.

    `shares` (aus dem Dateinamen, §4.1) wird als Fallback zur Kurs-Ableitung
    bei Fremdwährungstiteln benötigt (§8 Fremdwährungstitel).
    """
    pages = extract_pages(path)
    fmt = detect_format(pages)
    geschaeft_text, tax_text, lots_text = classify_pages(pages)

    isin = extract_isin(geschaeft_text)
    price, gross = extract_price_and_gross(geschaeft_text, shares)
    fees = extract_fees(geschaeft_text)
    net_magnitude, richtung = extract_net(geschaeft_text)
    verwahrart = extract_verwahrart(geschaeft_text)

    result = {
        "format": fmt,
        "isin": isin,
        "price": price,
        "gross": gross,
        "fees": fees,
        "net_magnitude": net_magnitude,
        "net_richtung": richtung,
        "tax": None,
        "reported_realized_pl": None,
        "cost_lots": [],
        "verwahrart": verwahrart,
    }

    if fmt == "old":
        result["flags"] = ["OLD_FORMAT"]
    else:
        result["flags"] = []

    if tax_text:
        result["tax"] = extract_tax(tax_text)
        if result["tax"] is None:
            result["tax"] = extract_tax(_compact(tax_text))
        if result["reported_realized_pl"] is None:
            result["reported_realized_pl"] = extract_reported_realized_pl(tax_text)
        if result["reported_realized_pl"] is None:
            result["reported_realized_pl"] = extract_reported_realized_pl(_compact(tax_text))
    if lots_text:
        lots = extract_cost_lots(lots_text)
        if not lots:
            lots = extract_cost_lots(_compact(lots_text))
        result["cost_lots"] = lots

        rpl3 = extract_reported_realized_pl(lots_text)
        if rpl3 is None:
            rpl3 = extract_reported_realized_pl(_compact(lots_text))
        if rpl3 is not None:
            result["reported_realized_pl"] = rpl3

    return result
