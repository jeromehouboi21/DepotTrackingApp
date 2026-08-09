import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from comdirect.filename import parse_filename
from comdirect.pdf import parse_pdf

base = r"C:\ComdirectPDFs\Abrechnungen"
wp = sorted(f for f in os.listdir(base) if f.startswith("Wertpapierabrechnung_"))

issues = []
fmt_counts = {}
n_sell_no_lots_no_reported = 0
n_negative_fees_new = 0
for i, fn in enumerate(wp):
    fname = parse_filename(fn)
    path = os.path.join(base, fn)
    try:
        r = parse_pdf(path, fname["shares"] if fname else 0.0)
    except Exception as e:
        issues.append((fn, f"EXCEPTION: {e}"))
        continue
    fmt_counts[r["format"]] = fmt_counts.get(r["format"], 0) + 1
    if r["isin"] is None:
        issues.append((fn, "no ISIN"))
    if r["net_magnitude"] is None:
        issues.append((fn, "no net"))
    if r["gross"] is None:
        issues.append((fn, "no gross"))
    if r["price"] is None:
        issues.append((fn, "no price"))
    if r["format"] == "unknown":
        issues.append((fn, "unknown format"))
    if fname["type"] == "SELL" and r["format"] == "new":
        if not r["cost_lots"] and r["reported_realized_pl"] is None:
            n_sell_no_lots_no_reported += 1
            issues.append((fn, "SELL new-format: no cost_lots AND no reported_realized_pl"))
        if r["fees"] < 0:
            n_negative_fees_new += 1
            issues.append((fn, f"negative fees on new-format: {r['fees']}"))
    if (i + 1) % 100 == 0:
        print(f"...{i+1}/{len(wp)}", file=sys.stderr)

with open(os.path.join(os.path.dirname(__file__), "_scan_result.json"), "w", encoding="utf-8") as f:
    json.dump({
        "total": len(wp),
        "format_counts": fmt_counts,
        "n_sell_no_lots_no_reported": n_sell_no_lots_no_reported,
        "n_negative_fees_new": n_negative_fees_new,
        "issues": issues,
    }, f, indent=2, ensure_ascii=False)

print("total:", len(wp))
print("format counts:", fmt_counts)
print("total issues:", len(issues))
print("n_sell_no_lots_no_reported:", n_sell_no_lots_no_reported)
print("n_negative_fees_new:", n_negative_fees_new)
