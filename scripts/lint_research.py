from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    required = [
        "AGENTS.md",
        "README.md",
        "research/protocol.md",
        "wiki/index.md",
        "state/checkpoint.md",
        "state/decisions.md",
        "state/open-questions.md",
        "state/log.md",
        "outputs/phase-0-product-and-feasibility-plan.md",
        "corpus/source-inventory.csv",
    ]
    for relative in required:
        if not (ROOT / relative).is_file():
            errors.append(f"missing required file: {relative}")

    for schema_path in sorted((ROOT / "schemas").glob("*.json")):
        try:
            json.loads(schema_path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001 - lint should report all parse failures
            errors.append(f"invalid JSON {schema_path.relative_to(ROOT)}: {exc}")

    source_path = ROOT / "corpus/source-inventory.csv"
    if source_path.is_file():
        with source_path.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        ids = [row.get("source_id", "") for row in rows]
        if len(ids) != len(set(ids)):
            errors.append("duplicate source_id in corpus/source-inventory.csv")
        for index, row in enumerate(rows, start=2):
            if not re.fullmatch(r"SRC-\d{3}", row.get("source_id", "")):
                errors.append(f"invalid source_id on CSV row {index}")
            if not row.get("url", "").startswith("https://"):
                errors.append(f"non-HTTPS or missing URL on CSV row {index}")

    markdown_paths = [
        *ROOT.glob("*.md"),
        *(ROOT / "research").rglob("*.md"),
        *(ROOT / "wiki").rglob("*.md"),
        *(ROOT / "outputs").rglob("*.md"),
        *(ROOT / "state").rglob("*.md"),
    ]
    link_pattern = re.compile(r"\[[^\]]+\]\((?!https?://|#)([^)]+)\)")
    for path in markdown_paths:
        text = path.read_text(encoding="utf-8")
        for target in link_pattern.findall(text):
            clean_target = target.split("#", 1)[0]
            if clean_target and not (path.parent / clean_target).resolve().exists():
                errors.append(f"broken local link in {path.relative_to(ROOT)}: {target}")

    if errors:
        print("Research lint failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Research lint passed")
    print(f"Schemas checked: {len(list((ROOT / 'schemas').glob('*.json')))}")
    print(f"Markdown files checked: {len(markdown_paths)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
