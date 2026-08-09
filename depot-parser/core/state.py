"""Zustand über Läufe hinweg: state/processed_index.json (§12.1)."""

import json
import os

SCHEMA_VERSION = 1


def empty_state() -> dict:
    return {"schema_version": SCHEMA_VERSION, "last_run": None, "processed": {}}


def load_state(path: str) -> dict:
    if not os.path.exists(path):
        return empty_state()
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def is_new(state: dict, tx_id: str) -> bool:
    return tx_id not in state["processed"]


def mark_processed(state: dict, tx_id: str, source: str, raw_ref: str, run_id: str) -> None:
    state["processed"][tx_id] = {"source": source, "raw_ref": raw_ref, "run_id": run_id}


def write_state(path: str, state: dict, run_id: str, run_at: str, new_count: int) -> None:
    state["last_run"] = {"run_id": run_id, "at": run_at, "new_count": new_count}
    _atomic_write_json(path, state)


def _atomic_write_json(path: str, data: dict) -> None:
    tmp_path = path + ".tmp"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)
