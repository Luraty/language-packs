#!/usr/bin/env python3
"""Publish frequency lists to Hugging Face: one dataset per language, plus one combined.

⚠️ N+1 DATASETS, ALL GENERATED FROM ONE SOURCE.

A single dataset with per-language configs would be tidier and would make drift impossible. It also
loses the audience: somebody searching for "german word frequency list" does not search for a
multi-language dataset with configs. So the per-language repos exist for discoverability, and they
are *generated* — which recovers the no-drift property without paying for it in obscurity.

Per-language datasets are BUILD ARTEFACTS. Editing one on the Hub reintroduces exactly the drift
this arrangement avoids.

⚠️ NEVER RUN AS OF 2026-07-30. `--dry-run` works and is exercised; the push path is not, because
`make publish-de` is blocked by the licence gate — nobody has read the Leipzig terms yet. Treat the
push path as unverified code until it has pushed once.

Usage:
    uv run hf/publish.py --language de --dry-run
    uv run hf/publish.py --language de
    uv run hf/publish.py --all
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGUAGES = ROOT / "languages"
TEMPLATE = Path(__file__).resolve().parent / "card.template.md"

COMBINED_REPO = "younissk/word-frequency-lists"

# Hugging Face licence identifiers, which are not the same strings as the SPDX-ish ids in
# sources.json. Keep the mapping explicit rather than lowercasing and hoping.
HF_LICENCE = {
    "CC-BY-3.0": ("cc-by-3.0", "CC BY 3.0"),
    "CC-BY-4.0": ("cc-by-4.0", "CC BY 4.0"),
    "CC-BY-SA-4.0": ("cc-by-sa-4.0", "CC BY-SA 4.0"),
    "MIT": ("mit", "MIT"),
}


def size_category(rows: int) -> str:
    if rows < 1_000:
        return "n<1K"
    if rows < 10_000:
        return "1K<n<10K"
    if rows < 100_000:
        return "10K<n<100K"
    return "100K<n<1M"


def git_commit() -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def gate(target: str) -> None:
    """Refuse to publish anything the licence gate has not cleared.

    The Makefile runs this too. Duplicating it here is deliberate: a publish is not undoable, and a
    script that only behaves when invoked through the right wrapper is a script that will one day be
    invoked the other way.
    """
    result = subprocess.run(
        ["node", str(ROOT / "builders" / "check-sources.mjs"), "--publish", target],
        cwd=ROOT,
    )
    if result.returncode != 0:
        sys.exit(f"\nlicence gate refused {target} — nothing was published")


def load(language: str) -> tuple[dict, dict]:
    sources = json.loads((LANGUAGES / language / "sources.json").read_text())
    provenance_file = LANGUAGES / language / "out" / "provenance.json"
    provenance = json.loads(provenance_file.read_text()) if provenance_file.exists() else {}
    return sources, provenance


def read_list(language: str) -> list[str]:
    text = (LANGUAGES / language / "out" / "frequency.txt").read_text(encoding="utf-8")
    return [line.strip() for line in text.splitlines() if line.strip()]


def render_card(language: str, sources: dict, provenance: dict, lemmas: list[str]) -> str:
    output = sources["outputs"]["out/frequency.txt"]
    publish = output["publish"]
    licence_id, licence_name = HF_LICENCE[output["licence"]]

    used = {s["id"] for s in sources["sources"]} & set(output["derivedFrom"])
    attribution = "\n".join(
        f"- **{s['name']}** — {s['licence']}" + (f"\n  <{s['url']}>" if s.get("url") else "")
        for s in sources["sources"]
        if s["id"] in used
    )

    method = provenance.get("method", {}).get("frequency", "See the repository.")

    return TEMPLATE.read_text(encoding="utf-8").format(
        license_id=licence_id,
        license_name=licence_name,
        language_code=language,
        language_name=publish["languageName"],
        pretty_name=publish["prettyName"],
        repo_id=publish["huggingface"],
        corpus_summary=publish["corpusSummary"],
        register_caveat=publish["registerCaveat"],
        rows=len(lemmas),
        size_category=size_category(len(lemmas)),
        generated_on=provenance.get("generatedOn", "unknown"),
        sha256=provenance.get("files", {}).get("frequency.txt", {}).get("sha256", "unknown"),
        commit=git_commit(),
        method=method,
        attribution=attribution,
    )


def publish(language: str, *, dry_run: bool) -> tuple[str, list[str]]:
    sources, provenance = load(language)
    output = sources["outputs"]["out/frequency.txt"]
    repo_id = output["publish"]["huggingface"]

    if not dry_run:
        gate(f"{language}/out/frequency.txt")

    lemmas = read_list(language)
    card = render_card(language, sources, provenance, lemmas)

    if dry_run:
        print(f"── {repo_id} " + "─" * max(0, 76 - len(repo_id)))
        print(card)
        print(f"── would push {len(lemmas):,} rows, and frequency.txt as a plain file\n")
        return repo_id, lemmas

    from datasets import Dataset  # imported late so --dry-run needs no install
    from huggingface_hub import HfApi

    ds = Dataset.from_dict(
        {"rank": list(range(1, len(lemmas) + 1)), "lemma": lemmas}
    )
    ds.push_to_hub(repo_id, private=False)

    api = HfApi()
    api.upload_file(
        path_or_fileobj=str(LANGUAGES / language / "out" / "frequency.txt"),
        path_in_repo="frequency.txt",
        repo_id=repo_id,
        repo_type="dataset",
    )
    api.upload_file(
        path_or_fileobj=card.encode("utf-8"),
        path_in_repo="README.md",
        repo_id=repo_id,
        repo_type="dataset",
    )
    print(f"pushed {repo_id} ({len(lemmas):,} rows)")
    return repo_id, lemmas


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--language", help="language code, e.g. de")
    group.add_argument("--all", action="store_true", help="every language with a publish target")
    parser.add_argument("--dry-run", action="store_true", help="render the card, push nothing")
    args = parser.parse_args()

    if args.all:
        languages = sorted(
            d.name
            for d in LANGUAGES.iterdir()
            if d.is_dir() and (d / "sources.json").exists()
            and json.loads((d / "sources.json").read_text())
            .get("outputs", {})
            .get("out/frequency.txt", {})
            .get("publish")
        )
    else:
        languages = [args.language]

    if not languages:
        sys.exit("no language has a publish target")

    for language in languages:
        publish(language, dry_run=args.dry_run)

    # ⚠️ The combined dataset is NOT written yet. It needs a second language to be anything other
    # than a copy of the first, and Arabic has no pipeline. Writing it now would mean shipping a
    # "multi-language" dataset containing exactly one language.
    if len(languages) > 1:
        print(f"TODO: the combined dataset at {COMBINED_REPO} is not implemented yet")


if __name__ == "__main__":
    main()
