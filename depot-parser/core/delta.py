"""Delta-Datei je Lauf: delta/transactions_delta_<RUN_ID>.json (§12.2)."""

import json
import os


def write_delta(out_dir: str, run_id: str, run_at: str, base_count_before: int,
                 new_transactions: list[dict]) -> str:
    sources = {"comdirect": 0, "comdirect_transfer": 0, "scalable": 0}
    for tx in new_transactions:
        if tx["source"] == "comdirect" and tx["type"] == "TRANSFER_IN":
            sources["comdirect_transfer"] += 1
        elif tx["source"] == "comdirect":
            sources["comdirect"] += 1
        elif tx["source"] == "scalable":
            sources["scalable"] += 1

    payload = {
        "run_id": run_id,
        "generated_at": run_at,
        "base_count_before": base_count_before,
        "new_count": len(new_transactions),
        "sources": sources,
        "transactions": new_transactions,
    }

    delta_dir = os.path.join(out_dir, "delta")
    os.makedirs(delta_dir, exist_ok=True)
    path = os.path.join(delta_dir, f"transactions_delta_{run_id}.json")
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)
    return path
