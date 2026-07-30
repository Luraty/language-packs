#!/usr/bin/env python3
"""The licence gate.

⚠️ WHY THIS IS CODE AND NOT A PARAGRAPH IN A README.

The German pack's attribution file already says, in prose: *"Confirm the current terms before
shipping."* Prose does not block a publish. Nobody re-reads a caveat they wrote themselves, and
this project has already had the Leipzig licence wrong **twice** — once as CC BY-NC, which was
treated as a blocker that killed the language, and once as unverified-but-assumed. A licence
mistake in a corpus is recoverable; a licence mistake in a *published dataset* has already
travelled.

Two tiers, on purpose:

  `check`   — structure and contamination. MUST be green today, or the gate becomes noise that
              everyone learns to skip.
  `--publish <lang>/<output>` — additionally demands a human verification stamp. Red until
              someone actually reads the upstream terms. That redness is the point.

⚠️ STDLIB ONLY, AND THAT IS A REQUIREMENT. `make check` must run on a fresh clone with nothing
installed. The moment this file imports something from PyPI, checking a licence needs a working
`uv sync` first, and a gate you cannot run is a gate people route around. Do not add `datasets`,
`pydantic`, or a test framework here.

Usage:
    python3 builders/check_sources.py
    python3 builders/check_sources.py --publish de/out/frequency.txt
    python3 builders/check_sources.py --root builders/fixtures/contaminated   # tests
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

RED = "\033[31m"
YEL = "\033[33m"
GRN = "\033[32m"
DIM = "\033[2m"
OFF = "\033[0m"


def is_share_alike(licence: object) -> bool:
    """A licence id is share-alike if `SA` is one of its dash-separated parts. `CC-BY-SA-4.0` → yes."""
    return "SA" in str(licence).split("-")


def parse_args(argv: list[str]) -> tuple[str | None, Path]:
    publish_target = None
    if "--publish" in argv:
        index = argv.index("--publish")
        if index + 1 < len(argv):
            publish_target = argv[index + 1]

    # `--root` exists so the gate can be pointed at fixture trees. A checker with no failing-case
    # test is a checker nobody has ever seen say no.
    if "--root" in argv:
        index = argv.index("--root")
        if index + 1 < len(argv):
            return publish_target, Path(argv[index + 1]).resolve()
    return publish_target, Path(__file__).resolve().parent.parent


def main(argv: list[str]) -> int:
    publish_target, root = parse_args(argv)
    languages_dir = root / "languages"

    errors: list[str] = []
    warnings: list[str] = []

    def fail(where: str, message: str) -> None:
        errors.append(f"{where}: {message}")

    def warn(where: str, message: str) -> None:
        warnings.append(f"{where}: {message}")

    if not languages_dir.is_dir():
        print("no languages/ directory", file=sys.stderr)
        return 2

    languages = sorted(
        entry.name
        for entry in languages_dir.iterdir()
        if entry.is_dir() and (entry / "sources.json").exists()
    )

    if not languages:
        print("no languages/*/sources.json found", file=sys.stderr)
        return 2

    publish_allowed = False

    for lang in languages:
        file = languages_dir / lang / "sources.json"
        where = f"languages/{lang}/sources.json"

        try:
            doc = json.loads(file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as error:
            fail(where, f"not valid JSON — {error}")
            continue

        if doc.get("language") != lang:
            fail(where, f'"language" is {json.dumps(doc.get("language"))} but the directory is {lang}')

        by_id: dict[str, dict] = {}
        for index, source in enumerate(doc.get("sources") or []):
            at = f"{where} sources[{index}]"

            for field in ("id", "name", "licence"):
                value = source.get(field)
                if not isinstance(value, str) or value == "":
                    fail(at, f'"{field}" must be a non-empty string')

            # Booleans, not truthy values. A missing field and an explicit `false` must not read the
            # same — "nobody filled this in" and "somebody checked and it is false" are different
            # facts.
            for field in ("licenceVerified", "redistributeDerived"):
                if not isinstance(source.get(field), bool):
                    fail(
                        at,
                        f'"{field}" must be an explicit true or false, '
                        f"not {json.dumps(source.get(field))}",
                    )

            if source.get("licenceVerified") is True and not isinstance(source.get("verifiedOn"), str):
                fail(
                    at,
                    '"licenceVerified": true requires a "verifiedOn" date '
                    "— a claim with no date rots silently",
                )
            if source.get("licenceVerified") is False and source.get("verifiedOn") is not None:
                fail(at, '"licenceVerified": false requires "verifiedOn": null')

            source_id = source.get("id")
            if isinstance(source_id, str):
                if source_id in by_id:
                    fail(at, f"duplicate source id {json.dumps(source_id)}")
                by_id[source_id] = source

        for path, output in (doc.get("outputs") or {}).items():
            at = f'{where} outputs["{path}"]'

            if not isinstance(output.get("licence"), str):
                fail(at, '"licence" must be a string')
                continue
            if not (languages_dir / lang / path).exists():
                warn(at, "declared output does not exist on disk yet")

            from_ids = output.get("derivedFrom") or []
            if not isinstance(from_ids, list) or not from_ids:
                fail(at, '"derivedFrom" must list at least one source id')
                continue

            resolved = []
            for source_id in from_ids:
                source = by_id.get(source_id)
                if source is None:
                    fail(at, f'"derivedFrom" names {json.dumps(source_id)}, which is not in "sources"')
                    continue
                resolved.append(source)

            # ⚠️ THE CONTAMINATION CHECK — the one a human reviewer reliably misses.
            #
            # Hugging Face carries ONE licence field per dataset. Bundle a CC BY-SA input into a
            # dataset you publish as CC BY and the combined work is share-alike anyway: every
            # downstream user is now obliged to share alike, and a frequency list nobody can use
            # permissively is not the public good this repo exists to produce.
            if not is_share_alike(output["licence"]):
                for source in (s for s in resolved if is_share_alike(s.get("licence"))):
                    fail(
                        at,
                        f'declared "{output["licence"]}" but derives from {source["id"]} '
                        f'which is "{source["licence"]}" — share-alike contaminates the output. '
                        f"Split the artefact or relicense it.",
                    )

            for source in (s for s in resolved if s.get("redistributeDerived") is False):
                fail(at, f'derives from {source["id"]}, whose "redistributeDerived" is false — this cannot ship')

            unverified = [s for s in resolved if s.get("licenceVerified") is not True]
            target = f"{lang}/{path}"

            if publish_target == target:
                if output.get("publish") is None:
                    fail(at, 'has no "publish" target but was requested for publication')
                elif unverified:
                    fail(
                        at,
                        f"PUBLISH BLOCKED — {len(unverified)} source(s) unverified: "
                        f"{', '.join(s['id'] for s in unverified)}. Read the upstream terms, then set "
                        f'"licenceVerified": true and "verifiedOn".',
                    )
                else:
                    publish_allowed = True
            elif unverified and output.get("publish"):
                warn(at, f"{len(unverified)} unverified source(s) — cannot publish until stamped")

    for message in warnings:
        print(f"  {YEL}WARN{OFF} {message}", file=sys.stderr)
    for message in errors:
        print(f"  {RED}FAIL{OFF} {message}", file=sys.stderr)

    if errors:
        print(f"\n  {RED}{len(errors)} problem(s).{OFF}", file=sys.stderr)
        return 1

    if publish_target is not None:
        if not publish_allowed:
            print(f"\n  {RED}No output matched {publish_target}.{OFF}", file=sys.stderr)
            return 1
        print(f"\n  {GRN}Publish allowed:{OFF} {publish_target}", file=sys.stderr)
    else:
        plural = "language" if len(languages) == 1 else "languages"
        print(
            f"\n  {GRN}Sources OK{OFF} {DIM}({len(languages)} {plural}: {', '.join(languages)}){OFF}",
            file=sys.stderr,
        )
        if warnings:
            print(
                f"  {DIM}{len(warnings)} warning(s) — nothing is publishable yet.{OFF}",
                file=sys.stderr,
            )

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
