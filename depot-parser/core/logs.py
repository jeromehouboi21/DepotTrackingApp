"""Konsolen-Transparenz (§13)."""

import logging
import sys


def setup_logging(verbose: bool, quiet: bool) -> logging.Logger:
    # Windows-Konsolen laufen oft mit cp1252; das Konsolen-Layout (§13) nutzt
    # Box-Drawing-Zeichen, die dort nicht kodierbar sind - Stream auf UTF-8 zwingen.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    level = logging.WARNING if quiet else (logging.DEBUG if verbose else logging.INFO)
    logger = logging.getLogger("depot_parser")
    logger.setLevel(level)
    logger.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.propagate = False
    return logger


class RunLogger:
    """Kapselt die Phasen-Ausgabe aus §13."""

    def __init__(self, logger: logging.Logger, run_id: str):
        self.log = logger
        self.run_id = run_id
        self.log.info(f"Depot-Parser · Lauf {run_id}")

    def phase(self, title: str) -> None:
        self.log.info(f"│")
        self.log.info(f"├ {title}")

    def line(self, msg: str, indent: int = 4) -> None:
        self.log.info(" " * indent + msg)

    def debug_line(self, msg: str, indent: int = 6) -> None:
        self.log.debug(" " * indent + msg)

    def warn(self, msg: str) -> None:
        self.log.warning(f"! {msg}")

    def error(self, msg: str) -> None:
        self.log.error(f"✗ {msg}")

    def final(self, msg: str) -> None:
        """Schluss-Zusammenfassung: erscheint IMMER, auch bei --quiet (§13)."""
        print(msg)
