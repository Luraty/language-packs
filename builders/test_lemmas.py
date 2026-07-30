#!/usr/bin/env python3
"""Regression tests for the built German lemma table.

⚠️ THESE ARE THE BUGS, NOT HYPOTHETICALS. Every case below was produced by a real lemmatizer in
this project and shipped or nearly shipped:

    warten → waren      rule-based version, 2026-07     (to wait → were)
    Ware   → war        rule-based version, 2026-07     (goods → was)
    Seite  → seit       rule-based version, 2026-07     (page → since)
    Stärke → stark      rule-based version, 2026-07     (strength → strong)
    warten → warte      Wikidata swap, 2026-07-30       (verb eaten by a noun)
    stärke → stärken    Wikidata swap, 2026-07-30       (noun eaten by a verb)
    in     → -in        Wikidata swap, 2026-07-30       (preposition eaten by a SUFFIX lexeme)

The last three are the point. Replacing the lemmatizer to fix a licence problem reproduced the
same failure class within an hour, in a new way each time — which is exactly what the warning in
build-lemmas.mjs predicted would happen and why "diff the output" is not a sufficient control.

These run against the COMMITTED table, so they guard the artefact rather than the algorithm. A
rebuild that reintroduces any of these fails here even if every other check is green.
"""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEMMAS = ROOT / "languages" / "de" / "out" / "lemmas.tsv"
FREQUENCY = ROOT / "languages" / "de" / "out" / "frequency.txt"


def table() -> dict[str, str]:
    rows = {}
    for line in LEMMAS.read_text("utf-8").split("\n"):
        parts = line.split("\t")
        if len(parts) >= 2 and parts[0] and parts[1]:
            rows[parts[0]] = parts[1]
    return rows


class KnownSilentErrors(unittest.TestCase):
    def test_a_word_is_never_filed_under_a_historically_wrong_lemma(self):
        rows = table()
        for form, forbidden in [
            ("warten", "waren"), ("warten", "warte"), ("ware", "war"),
            ("seite", "seit"), ("stärke", "stark"), ("stärke", "stärken"),
        ]:
            with self.subTest(form=form):
                self.assertNotEqual(
                    rows.get(form), forbidden,
                    f"{form} → {forbidden} is a documented silent error; it teaches a learner a "
                    f"different word than the one they proved",
                )

    def test_no_lemma_is_a_bound_morpheme(self):
        # `in` → `-in` (the feminine suffix) deleted a top-20 German word from the list, because
        # the affix was then dropped as unattested. Affixes are not words.
        offenders = [f"{f} → {l}" for f, l in table().items() if l.startswith("-") or l.endswith("-")]
        self.assertEqual(offenders, [], f"affix lexemes used as lemmas: {offenders[:5]}")

    def test_the_core_paradigms_collapse(self):
        # If these break, the head of the frequency list is wrong, which is the most visible place
        # a lemmatizer can fail. `das → der` in particular was split by a Wikidata cycle.
        rows = table()
        for form, lemma in [("die", "der"), ("das", "der"), ("den", "der"),
                            ("ist", "sein"), ("sind", "sein"), ("war", "sein"), ("waren", "sein"),
                            ("hat", "haben"), ("wird", "werden"), ("kann", "können")]:
            with self.subTest(form=form):
                self.assertEqual(rows.get(form), lemma)


class TableShape(unittest.TestCase):
    def test_no_unresolved_chains(self):
        # build-frequency does ONE lookup, so `a → b → c` files `a` under `b` while `b` files under
        # `c`, and both survive into the list as separate entries.
        rows = table()
        chains = [(f, t, rows[t]) for f, t in rows.items() if t in rows]
        self.assertEqual(chains, [], f"{len(chains)} unresolved chain(s), e.g. {chains[:3]}")

    def test_every_frequency_entry_is_attested_in_the_corpora(self):
        # The licence argument for CC BY rests on this: every string in the published list occurs
        # in CC BY Leipzig text, so none of it is carried in from a lexicon. It is also a quality
        # check — the 85 strings this removed were 1990s spellings and lemmatizer artefacts.
        corpora = sorted((ROOT / "data" / "leipzig").glob("*/*-words.txt"))
        if not corpora:
            self.skipTest("corpora not downloaded; run `make corpora-de`")
        attested = set()
        for path in corpora:
            for line in path.read_text("utf-8", errors="replace").split("\n"):
                parts = line.split("\t")
                if len(parts) >= 3 and parts[1]:
                    attested.add(parts[1].lower())
        entries = [w for w in FREQUENCY.read_text("utf-8").split("\n") if w]
        missing = [w for w in entries if w not in attested]
        self.assertEqual(missing, [], f"{len(missing)} unattested: {missing[:10]}")


if __name__ == "__main__":
    unittest.main()
