#!/usr/bin/env python3
"""Tests for the licence gate.

⚠️ THE POINT IS THE FAILING CASES. A checker that has only ever been run against valid input is
a checker nobody has seen say no, and "it passed" then means nothing. Each fixture below exists
to make one specific arm fire — contamination, a dateless stamp, a non-boolean flag — and the
real languages/ tree is asserted green separately so the two claims cannot be confused.

`unittest` rather than pytest on purpose: it ships with Python, and this repo runs its gate on a
fresh clone with nothing installed. Adding pytest here would mean a licence check needs `uv sync`
first — see the stdlib-only note in check_sources.py.

Run: python3 -m unittest discover -s builders -p 'test_*.py'
"""

from __future__ import annotations

import re
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
GATE = HERE / "check_sources.py"


def run(*args: str) -> tuple[int, str]:
    """Run the gate and return (code, output). stderr carries every message the gate emits."""
    result = subprocess.run(
        [sys.executable, str(GATE), *args], capture_output=True, text=True, check=False
    )
    return result.returncode, result.stdout + result.stderr


def fixture(name: str) -> str:
    return str(HERE / "fixtures" / name)


class LicenceGate(unittest.TestCase):
    def test_the_real_languages_tree_passes(self):
        code, output = run()
        self.assertEqual(code, 0, output)
        self.assertRegex(output, r"Sources OK")

    def test_share_alike_contaminating_a_permissive_output_is_rejected(self):
        code, output = run("--root", fixture("contaminated"))
        self.assertEqual(code, 1, output)
        self.assertRegex(output, r"share-alike contaminates the output")

    def test_a_verified_claim_with_no_date_is_rejected(self):
        code, output = run("--root", fixture("unstamped"))
        self.assertEqual(code, 1, output)
        self.assertRegex(output, r'requires a "verifiedOn" date')

    def test_a_non_boolean_licence_verified_is_rejected_not_coerced(self):
        code, output = run("--root", fixture("unstamped"))
        self.assertEqual(code, 1, output)
        self.assertRegex(output, r'"licenceVerified" must be an explicit true or false')

    def test_a_clean_tree_passes_and_its_output_may_publish(self):
        self.assertEqual(run("--root", fixture("clean"))[0], 0)
        code, output = run("--root", fixture("clean"), "--publish", "xx/out/words.txt")
        self.assertEqual(code, 0, output)
        self.assertRegex(output, r"Publish allowed")

    def test_publishing_german_is_now_allowed_and_every_source_is_stamped(self):
        # ⚠️ THIS TEST FLIPPED ON 2026-07-30, and the flip is the whole point of the gate.
        #
        # It used to assert PUBLISH BLOCKED, because nobody had read the Leipzig terms. They have
        # now been read — from Leipzig's own terms page via the Wayback Machine, since the live page
        # is bot-gated and the tarballs ship no licence file — and the evidence chain is recorded in
        # sources.json. So the assertion inverts: publishing must be ALLOWED, and every source must
        # carry a dated stamp.
        #
        # Keeping the assertion strict in the new direction matters as much as it did in the old
        # one. If a future source lands unstamped, this fails rather than quietly warning.
        code, output = run("--publish", "de/out/frequency.txt")
        self.assertEqual(code, 0, output)
        self.assertRegex(output, r"Publish allowed")

        import json

        sources = json.loads((ROOT / "languages" / "de" / "sources.json").read_text("utf-8"))
        for source in sources["sources"]:
            with self.subTest(source=source["id"]):
                self.assertIs(source["licenceVerified"], True, "an unstamped source reached main")
                self.assertRegex(source["verifiedOn"], r"^\d{4}-\d{2}-\d{2}$")

    def test_the_real_tree_does_not_trip_the_contamination_arm(self):
        # The inverse of the contamination fixture, on real data. Since 2026-07-30 nothing in the
        # German pipeline is share-alike at all, so the arm must not fire. Without this, a checker
        # that rejected everything would still pass the fixture above.
        code, output = run("--root", str(ROOT))
        self.assertEqual(code, 0, output)
        self.assertNotRegex(output, r"contaminates")

    def test_no_share_alike_source_is_back_in_the_german_pipeline(self):
        # The UD treebanks (CC BY-SA 4.0) were removed on 2026-07-30 and replaced by Wikidata
        # Lexemes (CC0). Re-adding a share-alike source would make the outputs unpublishable under
        # CC BY again — and the last time that happened it went unnoticed for months because the
        # dependency was real but undeclared. Assert the property, not the absence of two ids.
        import json

        sources = json.loads((ROOT / "languages" / "de" / "sources.json").read_text("utf-8"))
        share_alike = [s["id"] for s in sources["sources"] if "SA" in s["licence"].split("-")]
        self.assertEqual(share_alike, [], f"share-alike source(s) back in the pipeline: {share_alike}")
        for path, output in sources["outputs"].items():
            with self.subTest(output=path):
                self.assertNotIn("SA", output["licence"].split("-"))


    def test_frequency_declares_every_source_the_build_actually_reads(self):
        # ⚠️ REGRESSION GUARD FOR A LIVE DEFECT, fixed 2026-07-30.
        #
        # `make de` pass 3 rebuilds frequency.txt with `--lemmas out/lemmas.tsv`, so its ranking is
        # keyed by the CC BY-SA treebanks (build-frequency.mjs:95). For months `derivedFrom` listed
        # only the two Leipzig corpora, so the contamination check had nothing to fire on and the
        # gate stayed green over a CC-BY-3.0 claim that was not true.
        #
        # The gate can only check what it is told. That makes an under-declared `derivedFrom` the
        # one failure it is structurally blind to — hence this test, which asserts the declaration
        # matches the build rather than trusting the gate's own green.
        #
        # When the lemma table moves to Wikidata Lexemes (CC0), the treebank ids leave this list and
        # a wikidata id joins it. That edit must happen HERE and in sources.json together, which is
        # the point: the change becomes deliberate and reviewable instead of silent.
        import json

        sources = json.loads((ROOT / "languages" / "de" / "sources.json").read_text("utf-8"))
        declared = set(sources["outputs"]["out/frequency.txt"]["derivedFrom"])
        lemma_inputs = set(sources["outputs"]["out/lemmas.tsv"]["derivedFrom"])

        missing = lemma_inputs - declared
        self.assertEqual(
            missing,
            set(),
            "frequency.txt is built from lemmas.tsv (Makefile pass 3), so every source of the "
            f"lemma table is also a source of the frequency list. Undeclared: {sorted(missing)}",
        )


class StdlibOnly(unittest.TestCase):
    """The gate must run on a fresh clone. An import from PyPI here would make checking a licence
    depend on a working `uv sync`, and a gate you cannot run is a gate people route around."""

    THIRD_PARTY = re.compile(
        r"^\s*(?:from|import)\s+(datasets|huggingface_hub|pydantic|pytest|requests|numpy|pandas)\b",
        re.MULTILINE,
    )

    def test_the_gate_imports_nothing_from_pypi(self):
        for name in ("check_sources.py", "verify_provenance.py", "test_gate.py"):
            with self.subTest(file=name):
                found = self.THIRD_PARTY.findall((HERE / name).read_text("utf-8"))
                self.assertEqual(found, [], f"{name} imports {found} — see the stdlib-only note")


if __name__ == "__main__":
    unittest.main()
