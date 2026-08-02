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

# Which Leipzig corpora feed each language. Arabic deliberately excludes ara_wikipedia_2021_1M
# (CC BY-SA upstream), so the attestation test must not look for entries in a corpus the build
# never read — that would fail for a reason that has nothing to do with the lemmatizer.
LANGUAGES = {"de": ["deu_news_2024_300K", "deu-de_web_2021_300K"],
             "ar": ["ara_news_2020_1M", "ara_news_2022_1M"]}
# ar-x-quran is ranked against its own corpus, which is generated rather than downloaded, so its
# attestation check reads that file instead of a Leipzig directory.
QURAN_WORDS = ROOT / "data" / "quran" / "quran-words.txt"


def table(language: str = "de") -> dict[str, str]:
    rows = {}
    path = ROOT / "languages" / language / "out" / "lemmas.tsv"
    for line in path.read_text("utf-8").split("\n"):
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


class ArabicSilentErrors(unittest.TestCase):
    """Arabic reproduced the class in its own way, and worse — the FIRST Arabic build had a wrong
    top ten. `في` (in, 1,619,683×) was filed under `وفى` (to fulfil, 511×) and `من` (from) under the
    given name `منية` (28×), because the frequency tiebreak only ever compared candidates against
    each other, never against the form. Same shape as `heute→heuen` in German; only the scale
    differed, at 40,492× rather than 4,848×."""

    FUNCTION_WORDS = ["في", "من", "على", "أن", "إلى", "عن", "مع", "هذا", "كان", "التي"]

    def test_the_commonest_function_words_are_their_own_lemma(self):
        rows = table("ar")
        for word in self.FUNCTION_WORDS:
            with self.subTest(word=word):
                self.assertIsNone(
                    rows.get(word),
                    f"{word} is one of the commonest words in Arabic and was filed under "
                    f"{rows.get(word)!r} — a rare lexeme whose paradigm happens to contain it",
                )

    def test_the_frequency_list_starts_with_function_words(self):
        # The cheapest possible smoke test, and the one that caught the wrong top ten by eye.
        entries = [w for w in (ROOT / "languages" / "ar" / "out" / "frequency.txt")
                   .read_text("utf-8").split("\n") if w]
        self.assertEqual(entries[:5], ["في", "من", "على", "أن", "إلى"])

    def test_real_inflections_still_map(self):
        # The guards must not be so strict that nothing merges. These are genuine Arabic
        # inflections, and the definite article is a proclitic that has to be joined.
        rows = table("ar")
        for form, lemma in [("يقول", "قول"), ("يكتب", "كتب"),
                            ("الكتاب", "كتاب"), ("الحكومة", "حكومة")]:
            with self.subTest(form=form):
                self.assertEqual(rows.get(form), lemma)


class QuranicArabic(unittest.TestCase):
    """The Qur'anic pack reproduced the Arabic failure a third time, for a third reason.

    Built against its own 77,878-token corpus alone, the homograph tiebreak had too thin a frequency
    signal and `في` landed under the rare verb `وفى` — the same wrong top ten as the first MSA build.
    The lemma table is therefore built against Leipzig AND the Qur'an, with Leipzig doing the
    deciding. Separately, an unconditional Uthmani rewrite turned `على` into `علي`."""

    def test_the_frequency_list_starts_with_function_words(self):
        entries = [w for w in (ROOT / "languages" / "ar-x-quran" / "out" / "frequency.txt")
                   .read_text("utf-8").split("\n") if w]
        self.assertEqual(entries[:5], ["من", "الله", "على", "في", "كان"])

    def test_maqsura_final_words_are_not_rewritten_to_ya(self):
        # على، إلى، حتى، متى end in alef maqsura in MODERN orthography too. An unconditional
        # final ى→ي corrupts them, and they are among the commonest words in the text.
        entries = set(w for w in (ROOT / "languages" / "ar-x-quran" / "out" / "frequency.txt")
                      .read_text("utf-8").split("\n") if w)
        for correct, wrong in [("على", "علي"), ("إلى", "إلي"), ("حتى", "حتي")]:
            with self.subTest(word=correct):
                self.assertIn(correct, entries)
                self.assertNotIn(wrong, entries)

    def test_the_uthmani_column_covers_every_key_and_actually_differs(self):
        freq = [w for w in (ROOT / "languages" / "ar-x-quran" / "out" / "frequency.txt")
                .read_text("utf-8").split("\n") if w]
        uthmani = {}
        for line in (ROOT / "languages" / "ar-x-quran" / "out" / "uthmani.tsv").read_text("utf-8").split("\n"):
            parts = line.split("\t")
            if len(parts) >= 2 and parts[0]:
                uthmani[parts[0]] = parts[1]
        missing = [w for w in freq if w not in uthmani]
        self.assertEqual(missing, [], f"{len(missing)} keys have no mushaf spelling: {missing[:5]}")
        # If nothing differed, the normalization would be a no-op and the column pointless.
        self.assertEqual(uthmani.get("الله"), "ٱلله")
        self.assertGreater(sum(1 for k, v in uthmani.items() if k != v), 1000)


class TableShape(unittest.TestCase):
    def test_no_unresolved_chains(self):
        # build-frequency does ONE lookup, so `a → b → c` files `a` under `b` while `b` files under
        # `c`, and both survive into the list as separate entries.
        for language in list(LANGUAGES) + ["ar-x-quran"]:
            with self.subTest(language=language):
                rows = table(language)
                chains = [(f, t, rows[t]) for f, t in rows.items() if t in rows]
                self.assertEqual(chains, [], f"{len(chains)} unresolved chain(s), e.g. {chains[:3]}")

    def test_every_frequency_entry_is_attested_in_the_corpora(self):
        # The licence argument for CC BY rests on this: every string in the published list occurs
        # in CC BY Leipzig text, so none of it is carried in from a lexicon. It is also a quality
        # check — the 85 strings this removed from German were 1990s spellings and artefacts.
        import re

        marks = re.compile("[\u064B-\u0652\u0670\u0640]")
        targets = {**LANGUAGES, "ar-x-quran": None}
        for language, corpus_names in targets.items():
            with self.subTest(language=language):
                corpora = ([QURAN_WORDS] if corpus_names is None
                           else [p for name in corpus_names
                                 for p in (ROOT / "data" / "leipzig" / name).glob("*-words.txt")])
                corpora = [p for p in corpora if p.exists()]
                if not corpora:
                    self.skipTest(f"corpora not downloaded; run `make corpora-{language}`")
                normalize = (lambda w: marks.sub("", w)) if language.startswith("ar") else str.lower
                attested = set()
                for path in corpora:
                    for line in path.read_text("utf-8", errors="replace").split("\n"):
                        parts = line.split("\t")
                        if len(parts) >= 3 and parts[1]:
                            attested.add(normalize(parts[1]))
                entries = [w for w in (ROOT / "languages" / language / "out" / "frequency.txt")
                           .read_text("utf-8").split("\n") if w]
                missing = [w for w in entries if w not in attested]
                self.assertEqual(missing, [], f"{len(missing)} unattested: {missing[:10]}")


if __name__ == "__main__":
    unittest.main()
