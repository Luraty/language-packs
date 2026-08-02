#!/usr/bin/env python3
"""Check every generated file under a language's `out` directory against the checksum recorded in
its `provenance.json`.

⚠️ WHY THIS MATTERS MORE THAN IT LOOKS. Two copies of these bytes exist on purpose: this repo
generates them, and the private Luraty repo vendors them into `@luraty/pack-de` (a pack cannot
ship as `.txt` — React Native has no `fs`). A one-way vendoring relationship is fine right up
until somebody hand-edits the copy, at which point the two diverge silently and the frequency
list a learner is scored against stops being the one published here.

A recorded checksum turns that from silent into loud. It also catches the likelier accident: a
lemmatizer change regenerating the outputs without anyone diffing them, which is exactly how
`warten→waren` survived once already.

⚠️ STDLIB ONLY — see the same note in check_sources.py. This must run on a fresh clone.

Usage:
    python3 builders/verify_provenance.py
    python3 builders/verify_provenance.py --update   # after a DELIBERATE rebuild
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

RED = "\033[31m"
YEL = "\033[33m"
GRN = "\033[32m"
DIM = "\033[2m"
OFF = "\033[0m"


def main(argv: list[str]) -> int:
    root = Path(__file__).resolve().parent.parent
    languages_dir = root / "languages"
    update = "--update" in argv

    problems: list[str] = []
    checked = 0
    updated = 0

    languages = sorted(entry.name for entry in languages_dir.iterdir() if entry.is_dir())

    for lang in languages:
        provenance_file = languages_dir / lang / "out" / "provenance.json"
        if not provenance_file.exists():
            continue

        provenance = json.loads(provenance_file.read_text(encoding="utf-8"))
        dirty = False

        for name, recorded in (provenance.get("files") or {}).items():
            file = languages_dir / lang / "out" / name
            where = f"languages/{lang}/out/{name}"

            if not file.exists():
                problems.append(f"{where}: recorded in provenance.json but missing on disk")
                continue

            data = file.read_bytes()
            actual = hashlib.sha256(data).hexdigest()
            rows = len(data.decode("utf-8").rstrip().split("\n"))
            checked += 1

            if actual == recorded["sha256"] and rows == recorded["rows"] and len(data) == recorded["bytes"]:
                continue

            if update:
                provenance["files"][name] = {"sha256": actual, "rows": rows, "bytes": len(data)}
                dirty = True
                updated += 1
                print(
                    f"  {YEL}UPDATED{OFF} {where} {DIM}{recorded['rows']}→{rows} rows{OFF}",
                    file=sys.stderr,
                )
                continue

            problems.append(
                f"{where}: does not match provenance.json\n"
                f"      recorded  sha256 {recorded['sha256'][:16]}…  {recorded['rows']} rows  {recorded['bytes']} bytes\n"
                f"      on disk   sha256 {actual[:16]}…  {rows} rows  {len(data)} bytes\n"
                f"      If this was a deliberate rebuild, DIFF IT FIRST, then: make provenance-update"
            )

        if dirty:
            provenance_file.write_text(
                json.dumps(provenance, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
            )

    for problem in problems:
        print(f"  {RED}FAIL{OFF} {problem}", file=sys.stderr)

    if problems:
        print(f"\n  {RED}{len(problems)} file(s) diverged.{OFF}", file=sys.stderr)
        return 1

    if checked == 0:
        print(f"  {YEL}WARN{OFF} no provenance.json found — nothing was verified", file=sys.stderr)
    elif update:
        print(
            f"\n  {GRN}Provenance updated{OFF} {DIM}({updated} of {checked} file(s)){OFF}",
            file=sys.stderr,
        )
    else:
        print(f"\n  {GRN}Provenance OK{OFF} {DIM}({checked} file(s)){OFF}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
