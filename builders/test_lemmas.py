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

import sys
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
        # ⚠️ UPDATED 2026-09-12. The expectation was ["من","الله","على","في","كان"], written before
        # the 2026-08-07 builder fixes (ADR-0031..0034) were ever run against the Qur'anic pack.
        # Rebuilding it on 2026-09-11 changed the head and nobody ran this suite, so it sat red
        # through two commits. All five below are genuinely among the commonest words in the text;
        # the change is the lemmatiser improving, not the ranking breaking.
        self.assertEqual(entries[:5], ["من", "الله", "ما", "إن", "في"])

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


class AlternateReadings(unittest.TestCase):
    """Rows may list several lemmas, primary first — lughaty#177, lughaty ADR-0028.

    ⚠️ **THE ONE RULE THAT MAKES THIS SAFE IS THAT COLUMN ONE NEVER MOVES.** The engine's
    `candidates(s)[0] === key(s)` invariant means everything that addresses knowledge reads column
    one, so extra columns can only ever add information. `test_column_one_is_unchanged` is the A/B
    control for that; the rest are the ADR's conformance rules restated against the shipped file.
    """

    def rows(self, language="ar"):
        out = []
        path = ROOT / "languages" / language / "out" / "lemmas.tsv"
        for line in path.read_text("utf-8").split("\n"):
            parts = line.split("\t")
            if len(parts) >= 2 and parts[0] and parts[1]:
                out.append((parts[0], parts[1], [p for p in parts[2:] if p]))
        return out

    def test_alternates_are_never_the_primary_and_never_repeat(self):
        # `candidates-repeat`: a learner cannot choose between two identical senses, so offering the
        # choice is worse than not offering one.
        for language in ("ar", "ar-x-quran", "de"):
            with self.subTest(language=language):
                bad = [f for f, l, alts in self.rows(language)
                       if len(set([l, *alts])) != 1 + len(alts)]
                self.assertEqual(bad, [], f"{len(bad)} rows repeat a reading, e.g. {bad[:5]}")

    def test_every_alternate_is_canonical(self):
        # `candidates-not-canonical`: a reading that keys onward means the learner who picks it is
        # credited under an address no other route to that word produces — one word, two unit keys.
        for language in ("ar", "ar-x-quran", "de"):
            with self.subTest(language=language):
                rows = self.rows(language)
                primary = {f: l for f, l, _ in rows}
                drifting = [(f, a) for f, _, alts in rows for a in alts
                            if primary.get(a, a) != a]
                self.assertEqual(drifting, [],
                                 f"{len(drifting)} non-canonical alternates, e.g. {drifting[:5]}")

    def test_no_alternate_is_empty_or_contains_a_tab(self):
        # The shape `parseLemmas` on the consumer side relies on. It used to take everything after
        # the FIRST tab, which turned a three-column row into a lemma containing a tab character.
        for language in ("ar", "ar-x-quran", "de"):
            with self.subTest(language=language):
                bad = [f for f, l, alts in self.rows(language)
                       if not l or any(not a for a in alts)]
                self.assertEqual(bad, [], f"empty readings on {len(bad)} rows: {bad[:5]}")

    def test_the_arabic_table_actually_carries_alternates(self):
        # ⚠️ A VACUITY GUARD. Every assertion above passes trivially on a one-column file, which is
        # exactly what this table was before lughaty#177 — so without this the whole class could go
        # green against a build that emitted nothing new.
        with_alts = [f for f, _, alts in self.rows("ar") if alts]
        self.assertGreater(len(with_alts), 1000,
                           f"only {len(with_alts)} rows carry an alternate reading; the multi-column "
                           f"emission is not running and every check in this class is vacuous")


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


class TiebreakGuards(unittest.TestCase):
    """The four rules that stop the frequency tiebreak filing a common word under an unrelated one
    — lughaty#205, lughaty ADR-0032.

    Adjudication put the shipped table at 41.4% correct on its ambiguous decisions and this rule set
    at 60.0%; by corpus mass, 35.2% to 65.6%. These tests do not re-measure that. They pin the
    handful of behaviours that the measurement turned on, so that a future change to the builder has
    to break a named assertion rather than quietly move a number nobody re-runs.
    """

    # Every one of these was filed under an unrelated word by the shipped table, and every one is
    # in the top 60 of the Arabic frequency distribution. See the ADR for the full list.
    OWN_LEMMA = {
        "قد": "وقد", "هي": "وهى", "كما": "كم", "أمس": "ماس", "أحد": "حد", "أول": "آل",
        "تحت": "حتى", "ضمن": "وضم", "أعلن": "على", "لن": "لان", "أكثر": "كثر", "عدد": "عدة",
    }

    def test_a_word_that_outranks_its_lemma_is_its_own_lemma(self):
        rows = table("ar")
        for word, was in self.OWN_LEMMA.items():
            with self.subTest(word=word):
                self.assertIsNone(
                    rows.get(word),
                    f"{word} is filed under {rows.get(word)!r}; it used to be {was!r} and it is a "
                    f"citation form in its own right",
                )

    def test_an_assimilated_verb_keeps_its_waw(self):
        # ⚠️ **THIS TEST EXISTS BECAUSE ITS OPPOSITE WAS WRITTEN FIRST AND WAS WRONG.** The rule
        # "a lemma is never the form with a proclitic on the front" is true of و-the-conjunction and
        # false of و-the-first-radical: assimilated (مثال) verbs drop it in the imperfect and the
        # imperative, so `قف → وقف` is a correct assignment that looks exactly like a clitic error.
        # Enforcing the structural rule moved 550 rows and put `ينذر` under ذروة ("summit").
        rows = table("ar")
        for form, lemma in [("قف", "وقف"), ("صف", "وصف"), ("يهبوا", "وهب"), ("ينذر", "وذر")]:
            with self.subTest(form=form):
                self.assertEqual(rows.get(form), lemma)

    def test_a_pronoun_or_particle_is_never_filed_under_a_noun_or_a_verb(self):
        # The mirror of the content-word guard. A closed-class word is not an inflection of an
        # open-class one in any language, and Arabic pays for the allowance at the head of its list.
        rows = table("ar")
        # ⚠️ `نحن` ("we", 13,171x) is NOT here, and its absence is the honest part. It is still
        # filed under حان ("the time came"). Wikidata does not list it as a lemma at all, so the
        # guard has nothing to speak with, and at 10.8x it does not clear the unlisted-form bar of
        # 20x either. Lowering that bar to catch it was measured and scores worse. See ADR-0032.
        for word in ["هي", "هو", "هنا", "قد", "لن", "كما"]:
            with self.subTest(word=word):
                self.assertIsNone(rows.get(word), f"{word} is a function word, filed under {rows.get(word)!r}")

    def test_the_definite_article_is_still_joined(self):
        # ⚠️ THE COUNTERWEIGHT, AND THE REASON THE RULE SET NEEDED A PROCLITIC GUARD AT ALL. An
        # ال-prefixed form is routinely 20-50x commoner than its bare lemma in newswire — الثاني
        # 18,628x against ثان 614x — so a bare frequency test condemns exactly the joins that are
        # correct. Without this test the rule set scores better on the errors and silently destroys
        # the ال-join, which is most of what the table does.
        rows = table("ar")
        for form, lemma in [("الثاني", "ثان"), ("الأوروبي", "أوروبي"), ("اللازمة", "لزم"),
                            ("الكتاب", "كتاب"), ("الحكومة", "حكومة")]:
            with self.subTest(form=form):
                self.assertEqual(rows.get(form), lemma)

    def test_the_chain_terminates_at_a_word_that_is_its_own_lemma(self):
        # `الأول` reached `آل` ("clan") by flattening through `أول`; terminating the chain at `أول`
        # is the same claim as removing `أول`'s own row, and both halves must agree. The counterpart
        # `أول` is checked above.
        rows = table("ar")
        self.assertEqual(rows.get("الأول"), "أول")
        self.assertEqual(rows.get("الأولى"), "أول")

    def test_the_table_has_not_lost_rows_wholesale(self):
        # ⚠️ VACUITY GUARD. Every other assertion in this class is satisfied by a SMALLER table, so
        # a builder that deleted most of the file would pass them all.
        #
        # ⚠️ **THIS USED TO CARRY AN UPPER BOUND AGAINST HERMES' 196,607 OWN-PROPERTY CAP ON A PLAIN
        # OBJECT, AND THAT BOUND IS GONE ON PURPOSE.** The packs build a `ReadonlyMap` now
        # (lughaty#210), which has no such limit, so the ceiling that forced a frequency floor onto
        # the proclitic join no longer exists. If `parseLemmas` is ever changed back to a plain
        # object, this table at 192,136 rows is 2.3% under a hard crash on device — and no lane in
        # either repo would say so, because they all run on Node.
        rows = table("ar")
        self.assertGreater(len(rows), 150_000, "the table has lost rows wholesale")


class ProcliticJoin(unittest.TestCase):
    """`و ب ل ف ك` attach like `ال` and were never joined — lughaty#206, lughaty ADR-0033."""

    def test_the_relative_pronoun_survives_the_article(self):
        # ⚠️ **THE DEFECT THIS ISSUE IS NAMED FOR.** `الذي`, one of the commonest words in Arabic
        # (152,834x), was stripped to `ذي` — a rare form of `ذو`, 2,236x — which absorbed all of it
        # and sat at RANK 16 of the frequency list, while `الذي` was absent from the list entirely.
        # A learner was taught `ذي` as the sixteenth most important Arabic word. The feminine `التي`
        # is a headword with no row and sat correctly at rank 8, which is why nobody noticed.
        rows = table("ar")
        self.assertIsNone(rows.get("الذي"), "الذي is a headword and must not be taken apart")
        entries = [w for w in (ROOT / "languages" / "ar" / "out" / "frequency.txt")
                   .read_text("utf-8").split("\n") if w]
        self.assertIn("الذي", entries)
        self.assertLess(entries.index("الذي"), 100)
        self.assertGreater(entries.index("ذي"), 1_000, "ذي is rare and must not sit near the head")

    def test_the_strip_is_chosen_by_the_commonest_stem(self):
        # Longest-clitic-first reads `والذي` as وال+ذي and lands back on the rare `ذي`. Comparing
        # stems gives و+الذي. The two orderings disagree on exactly the words this pass rescues.
        self.assertEqual(table("ar").get("والذي"), "الذي")

    def test_the_common_proclitic_forms_are_joined(self):
        rows = table("ar")
        for form, lemma in [("وقال", "قال"), ("وأضاف", "أضاف"), ("بشكل", "شكل"),
                            ("بسبب", "سبب"), ("وهو", "هو"), ("والتي", "التي")]:
            with self.subTest(form=form):
                self.assertEqual(rows.get(form), lemma)

    def test_it_does_not_take_apart_ordinary_words(self):
        # ⚠️ **THE REASON THE GUARD IS THE LEXICON AND NOT "THE REMAINDER IS A KNOWN WORD".** Arabic
        # roots are three consonants, so almost any 2-3 letter remainder is also a word: the naive
        # rule reads `كان` (was) as ك+ان, `لجنة` (committee) as ل+جنة, `فقط` (only) as ف+قط, `بحث`
        # (research) as ب+حث. Measured at 12 of 20 controls destroyed. Anchoring to Wikidata — never
        # take apart a form the lexicon lists at all — destroys 0 of 45.
        rows = table("ar")
        for word in ["كان", "لجنة", "فقط", "بحث", "لها", "بها", "كأس", "باسم",
                     "وقت", "وطن", "ولد", "كبير", "فكرة", "فاز", "كلام", "بلد", "بيت"]:
            with self.subTest(word=word):
                lemma = rows.get(word)
                self.assertFalse(
                    lemma is not None and len(lemma) < len(word) and word.endswith(lemma),
                    f"{word} was taken apart into a proclitic plus {lemma!r}",
                )


class DerivationalTemplates(unittest.TestCase):
    """A maṣdar or a participle is commoner than its verb, and that is not evidence — lughaty#209.

    The unlisted-form rule refuses to file a word under something 20x rarer. Arabic derivation
    breaks that reasoning: `قائلا` is **198x** commoner than `قائل` and is still its accusative.
    A blind held-out A/B put 15 of 118 decisions in the *worse* column and every one was this shape.

    ⚠️ **A ROOT SKELETON CANNOT SEPARATE THEM AND THAT WAS MEASURED.** `قائلا`/`قائل` and `كما`/`كم`
    both share a skeleton; the first must stay mapped and the second must not. What separates them
    is that Arabic derivation runs on TEMPLATES, so it is a string test rather than a statistic.
    """

    def test_a_participle_keeps_its_accusative_and_its_plural(self):
        rows = table("ar")
        for form, lemma in [("قائلا", "قائل"), ("مؤكدا", "مؤكد"), ("مضيفا", "مضيف"),
                            ("مبينا", "مبين"), ("المستضعفين", "مستضعف")]:
            with self.subTest(form=form):
                self.assertEqual(rows.get(form), lemma)

    def test_a_masdar_is_its_own_headword(self):
        # ⚠️ **THE ARM THAT WAS BUILT, MEASURED AND REMOVED.** `استهلاك ← استهلك` (form X) and
        # `تعزيز ← عزز` (form II تفعيل) were implemented, and a blind held-out A/B of 60 rows with
        # three judges **refuted them 15:40 — the rule was preferred in 27%**, against 73% for
        # leaving them alone. The reason was unanimous across all three framings: a maṣdar is its
        # own DICTIONARY HEADWORD. `اتحاد` is "union", a noun a learner meets as a noun; filing it
        # under `اتحد` credits a verb she has not read.
        #
        # This test pins the REMOVAL, so re-adding the arm turns a suite red instead of quietly
        # re-losing 40 held-out decisions.
        rows = table("ar")
        # ⚠️ `مهرجان` is NOT here. It is filed under `مهرج` ("clown", an unrelated Persian loan)
        # and the judges called that pair "neither" — a pre-existing tiebreak error this rule does
        # not touch and does not claim to fix. Pinning it would assert a fix that does not exist.
        for word in ["اتحاد", "احترام", "اختبار", "استطلاع", "انطباع", "تمويل"]:
            with self.subTest(word=word):
                self.assertIsNone(rows.get(word), f"{word} is a headword, filed under {rows.get(word)!r}")

    def test_it_does_not_rescue_a_lexicalised_particle(self):
        # ⚠️ **THE COUNTERWEIGHT, AND THE WHOLE REASON THE RULE IS A TEMPLATE TEST.** These three
        # were endorsed by the judges as correctly unmapped, and every one of them would come back
        # under the obvious guard — a shared consonant skeleton — which is why that guard was
        # measured and rejected: it recovers ~38k corpus mass and loses ~130k.
        rows = table("ar")
        for word in ["كما", "لن", "أبو", "قد", "هي", "أمس", "أحد", "أول"]:
            with self.subTest(word=word):
                self.assertIsNone(rows.get(word), f"{word} is a citation form, filed under {rows.get(word)!r}")


class ArabicRulesAreArabicOnly(unittest.TestCase):
    """⚠️ The tiebreak rules run for `--script arabic` and nothing else, and this is the test that
    holds the gate shut.

    Two of them — the function-word guard and the self-lexeme rule — are written in language-neutral
    terms and would fire on German unchanged. Every guard that keeps them honest is Arabic: the
    proclitic list, and `skeleton()`, which strips Arabic matres and so degenerates to string
    equality on a Latin word. Letting them run on German would ship the rules with their brakes off,
    against a table nobody has adjudicated.

    ⚠️ This is a SYNTHETIC test on purpose. The German dump and corpora are not on every machine, so
    an A/B of the real German table skips exactly where it is needed; a fixture always runs.
    """

    # `gab` is its own lemma AND far commoner than `geben`, which is precisely the self-lexeme
    # rule's firing condition. Under `--script arabic` the row disappears. Under `--script latin`
    # it must survive.
    # ⚠️ THE RATIO IS 50x ON PURPOSE. The builder already had a 200x `RARITY_LIMIT` sweep before
    # any of this, so a fixture at 500x is deleted by code that predates the change and the test
    # passes for the wrong reason — which is exactly what the first version of this fixture did.
    # 50x clears the unlisted bar of 20x and stays well under 200x, so only the new rule can fire.
    WIKIDATA = "gab\tgeben\tQ24905\ngab\tgab\tQ24905\ngeben\tgeben\tQ24905\n"
    WORDS = "1\tgab\t5000\n2\tgeben\t100\n"

    def build(self, script):
        import subprocess
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "wd.tsv").write_text(self.WIKIDATA, encoding="utf-8")
            (d / "words.txt").write_text(self.WORDS, encoding="utf-8")
            subprocess.run(
                [sys.executable, str(ROOT / "builders" / "build_lemmas_wikidata.py"),
                 str(d / "wd.tsv"), str(d / "words.txt"), "--script", script,
                 "--out", str(d / "out.tsv")],
                check=True, capture_output=True,
            )
            return {line.split("\t")[0]: line.split("\t")[1]
                    for line in (d / "out.tsv").read_text("utf-8").split("\n") if "\t" in line}

    def test_the_rules_fire_for_arabic(self):
        # The control. If this stops firing the next test is vacuous and proves nothing.
        self.assertIsNone(self.build("arabic").get("gab"),
                          "the self-lexeme rule did not fire; the gate test below is now vacuous")

    def test_the_rules_do_not_fire_for_latin(self):
        self.assertEqual(self.build("latin").get("gab"), "geben",
                         "an Arabic-only tiebreak rule fired on a Latin-script build")


if __name__ == "__main__":
    unittest.main()
