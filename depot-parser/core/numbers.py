"""Deutsches Zahlenformat: '.' = Tausendertrennzeichen, ',' = Dezimaltrennzeichen."""


def parse_de_number(s: str) -> float:
    """"1.250,43" -> 1250.43 ; "10,712" -> 10.712 ; "3.000" -> 3000"""
    return float(s.strip().replace(".", "").replace(",", "."))


def parse_signed_amount(s: str) -> float:
    """comdirect-PDFs zeigen Abzüge mit nachgestelltem Minus: "15,30-" statt "-15,30"."""
    s = s.strip()
    negative = False
    if s.endswith("-"):
        negative = True
        s = s[:-1].strip()
    if s.startswith("-"):
        negative = True
        s = s[1:].strip()
    value = parse_de_number(s)
    return -value if negative else value
