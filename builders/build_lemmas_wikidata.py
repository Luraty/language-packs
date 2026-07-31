#!/usr/bin/env python3
"""Build a form→lemma table from the Wikidata Lexeme dump.

⚠️ WHY THIS REPLACES THE TREEBANK LEMMATIZER.

The UD treebanks are CC BY-SA 4.0. Reading their FORM→LEMMA columns makes the lemma table
share-alike, and because `make de` pass 3 re-ranks the frequency list *through* that table
(build-frequency.mjs), share-alike reached the frequency list too — a list nobody can use
permissively, which is the opposite of what this repo exists to produce.

Wikidata's Lexeme namespace is **CC0**: "All structured data from the main, Property, Lexeme, and
EntitySchema namespaces is available under the Creative Commons CC0 License"
(https://www.wikidata.org/wiki/Wikidata:Copyright). CC0 also expressly waives EU sui generis
database rights, which CC BY-SA does not. So the output is free of both hooks.

It is also simply better here. Measured against the same two Leipzig corpora:

    Wikidata table       73.9% of corpus TOKENS mappable
    treebank table       25.5%
    treebank-only        2.9%   (what the swap actually costs)

⚠️ AMBIGUITY IS THE REAL COST, and it is where the old silent-error class lives.

The treebank resolved homographs by majority over annotated context. A dump has no context, so
Wikidata hands back every candidate: `waren` → {sein, ware}. Picking wrong here reproduces exactly
the bug this project already shipped once — `Ware→war`, `warten→waren` — where a learner who proved
one word is credited with another.

The tiebreak is corpus frequency of the candidate lemma's own surface form: `sein` outweighs `ware`
by orders of magnitude, so `waren→sein` wins. That is a heuristic, not a parse. It is right for the
head of the distribution, where the mass is, and it is least reliable in the tail — which is why
--report prints every ambiguous decision for eyeballing rather than burying them.

Usage:
    python3 builders/build_lemmas_wikidata.py <wikidata.tsv> <leipzig-words.txt>... \\
        --out languages/de/out/lemmas.tsv [--report]

Input <wikidata.tsv> is `form <TAB> lemma <TAB> lexicalCategory`, produced from
https://dumps.wikimedia.org/wikidatawiki/entities/latest-lexemes.json.gz
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

# ⚠️ SCRIPT NORMALIZATION. Wikidata's Arabic forms are fully diacritized (`كَتَبَ`); Leipzig's Arabic
# text is not (`كتب`). Compared raw, NOTHING matches — the table would be 100% correct and 0% useful.
# Stripping harakat, superscript alef and tatweel is what makes the two joinable, and it is also what
# `build-frequency.mjs --script arabic` does to the corpus side, so the keys agree on both halves.
#
# The diacritics are not discarded from the world, only from the KEY: they are what a learner needs
# in order to pronounce an Arabic word that is written ambiguously, and Wikidata gives them under CC0
# where CAMeL's GPL-v2 database was the only other full-coverage source. Keeping a vocalized column
# is a live option; it just must not be the join key.
ARABIC_MARKS = re.compile("[\u064B-\u0652\u0670\u0640]")
SCRIPTS = {
    "latin": lambda w: w.lower(),
    "arabic": lambda w: ARABIC_MARKS.sub("", w),
}


def leipzig_counts(paths: list[Path], normalize) -> dict[str, int]:
    """Leipzig `*-words.txt` is `rank <TAB> word <TAB> count`. Normalized to match the ranker."""
    counts: dict[str, int] = defaultdict(int)
    for path in paths:
        for line in path.read_text("utf-8", errors="replace").split("\n"):
            parts = line.split("\t")
            if len(parts) >= 3 and parts[1]:
                try:
                    counts[normalize(parts[1])] += int(parts[2])
                except ValueError:
                    continue
    return counts



def resolve(mapping: dict[str, str], counts: dict[str, int]) -> tuple[int, int]:
    """Flatten chains and break cycles in place. Returns (chains_flattened, cycles_broken)."""
    chains_flattened = cycles_broken = 0
    for form in list(mapping):
        # Breaking a cycle deletes its canonical member, so a key snapshotted above may be gone
        # by the time we reach it.
        if form not in mapping:
            continue
        seen_path, node = [form], mapping[form]
        while node in mapping and node not in seen_path:
            seen_path.append(node)
            node = mapping[node]
        if node in seen_path:  # cycle
            cycle = seen_path[seen_path.index(node):]
            canonical = max(cycle, key=lambda w: (counts.get(w, 0), [-ord(c) for c in w]))
            for member in cycle:
                if member == canonical:
                    mapping.pop(member, None)
                else:
                    mapping[member] = canonical
            cycles_broken += 1
        elif node != mapping[form]:
            mapping[form] = node
            chains_flattened += 1
    return chains_flattened, cycles_broken


def main(argv: list[str]) -> int:
    if "--out" not in argv:
        print(__doc__.strip().split("Usage:")[1], file=sys.stderr)
        return 2
    out = Path(argv[argv.index("--out") + 1])
    report = "--report" in argv
    script = argv[argv.index("--script") + 1] if "--script" in argv else "latin"
    if script not in SCRIPTS:
        print(f"unknown --script {script}; expected one of {', '.join(SCRIPTS)}", file=sys.stderr)
        return 2
    normalize = SCRIPTS[script]
    value_at = {argv.index("--out") + 1}
    if "--script" in argv:
        value_at.add(argv.index("--script") + 1)
    if "--irregulars" in argv:
        value_at.add(argv.index("--irregulars") + 1)
    positional = [a for i, a in enumerate(argv) if not a.startswith("--") and i not in value_at]
    if len(positional) < 2:
        print("need <wikidata.tsv> and at least one <leipzig-words.txt>", file=sys.stderr)
        return 2

    wikidata_file, corpora = Path(positional[0]), [Path(p) for p in positional[1:]]

    # Wikidata lexical categories. Only the three open classes matter here — see the guard below.
    NOUN, VERB, ADJECTIVE = "Q1084", "Q24905", "Q34698"
    CONTENT = {NOUN, VERB, ADJECTIVE}

    candidates: dict[str, set[tuple[str, str]]] = defaultdict(set)
    own_categories: dict[str, set[str]] = defaultdict(set)
    for line in wikidata_file.read_text("utf-8").split("\n"):
        parts = line.split("\t")
        if len(parts) >= 3 and parts[0] and parts[1]:
            form, lemma, category = normalize(parts[0]), normalize(parts[1]), parts[2]
            # ⚠️ AFFIX LEXEMES. Wikidata models bound morphemes as lexemes too — `-in` is the
            # feminine suffix, `-chen` the diminutive. They are written with a hyphen, and they
            # are NOT words a frequency list may contain. Left in, they are quietly destructive:
            # `in` (the preposition, a top-20 German word) was filed under `-in`, and then the
            # corpus-attestation filter dropped `-in` as unattested, so the preposition vanished
            # from the list entirely. Six rows, one of them load-bearing.
            if lemma.startswith("-") or lemma.endswith("-"):
                continue
            own_categories[lemma].add(category)
            # An identity row carries no information: build-frequency falls back to the surface
            # form anyway when the table has no entry.
            if form != lemma:
                candidates[form].add((lemma, category))

    counts = leipzig_counts(corpora, normalize)

    rows: list[tuple[str, str]] = []
    ambiguous: list[tuple[str, str, list[str]]] = []
    blocked: list[tuple[str, list[str]]] = []
    for form in sorted(candidates):
        # Only forms the corpus actually contains can ever be looked up. Emitting the rest would
        # inflate the table with rows `rank()` can never reach.
        if form not in counts:
            continue

        # ⚠️ CONTENT-WORD POS GUARD. Frequency alone cannot tell a citation form from an
        # inflection, and without this the tiebreak produced exactly the errors this project
        # already shipped once:
        #
        #     warten → warte     (the VERB "to wait" swallowed by the NOUN "watchtower")
        #     stärke → stärken   (the NOUN "strength" swallowed by the VERB "to strengthen")
        #
        # Both are cases where the form is ITSELF a lemma of a different part of speech. So: if
        # this form heads its own content-word lexeme, refuse to file it under a content word of
        # a different class.
        #
        # The guard is deliberately narrow. Applying it to every citation form also kills
        # `das → der`, because `das` heads its own pronoun lexeme — and that is a merge we want,
        # since articles and pronouns are paradigms rather than distinct words. Restricting the
        # check to noun/verb/adjective keeps the function-word paradigms intact.
        #
        # The asymmetry is the point, and it is the repo's existing rule: a missed merge leaves a
        # learner two real words, a false merge teaches them a falsehood.
        own = own_categories.get(form, set()) & CONTENT
        options = sorted(candidates[form])
        if own:
            kept = [(lem, cat) for lem, cat in options if cat not in CONTENT or cat in own]
            if not kept:
                blocked.append((form, [lem for lem, _ in options]))
                continue
            options = kept

        # ⚠️ RARITY GUARD — the one that catches what the POS guard cannot.
        #
        # A word cannot be an inflection of something drastically rarer than itself. Wikidata lists
        # obscure lexemes whose paradigms happen to contain very common strings, and the frequency
        # tiebreak walks straight into them because it only compares CANDIDATES against each other,
        # never against the form. Both languages were wrong before this guard:
        #
        #     في    (1,619,683×) → وفى    (511×)     3,170×    "in" filed under "to fulfil"
        #     من    (1,133,781×) → منية   (28×)     40,492×    "from" filed under a given name
        #     heute (   184,124×) → heuen  (38×)      4,848×    "today" filed under "to make hay"
        #     kosten (   68,024×) → kosen  (30×)      2,267×    "to cost" filed under "to caress"
        #
        # The threshold is empirical, and the gap it sits in is wide enough to be trustworthy.
        # Measured on German: every known-correct mapping is at most 58.7× (`eigenen→eigen`, high
        # because `eigen` is almost always declined), while every wrong one starts at 934×. Most
        # correct mappings are under 6×. 200× is the middle of an order-of-magnitude gap, not a
        # tuned constant — if a future language puts real mappings above it, the gap is the thing to
        # re-measure, not the number to nudge.
        RARITY_LIMIT = 200
        options = [
            (lem, cat) for lem, cat in options
            if counts.get(form, 0) <= RARITY_LIMIT * max(1, counts.get(lem, 0))
        ]
        if not options:
            blocked.append((form, ["all candidates far rarer than the form itself"]))
            continue

        lemmas = sorted({lem for lem, _ in options})
        if len(lemmas) == 1:
            rows.append((form, lemmas[0]))
            continue
        # Highest-frequency candidate wins; alphabetical only to make ties deterministic.
        chosen = max(lemmas, key=lambda lem: (counts.get(lem, 0), [-ord(c) for c in lem]))
        rows.append((form, chosen))
        ambiguous.append((form, chosen, lemmas))

    # ⚠️ FLATTEN CHAINS AND BREAK CYCLES. build-frequency does ONE lookup per surface form
    # (`lemmaOf.get(surface) ?? surface`), so an unresolved chain `a → b → c` files `a` under `b`
    # while `b` itself files under `c`, and the list ends up holding both.
    #
    # Cycles are worse and they are not hypothetical: Wikidata has `das → der` AND `der → das`,
    # because each heads its own lexeme and lists the other's forms. A single lookup just swaps
    # them, so `der` and `das` BOTH survived into the top 20 — the article paradigm split in half
    # at the very head of the list, which is the most visible place it could possibly happen.
    #
    # Resolution: walk to a fixpoint; on a cycle, elect the most frequent member as canonical and
    # point every other member at it. Frequency is the right tiebreak because the canonical form
    # is the one the list should rank.
    mapping = dict(rows)

    # ⚠️ ADJECTIVE DECLENSION, WHICH WIKIDATA LARGELY DOES NOT HAVE.
    #
    # German adjectives inflect for case/gender/number/strength — roughly 48 surface forms each.
    # Wikidata carries ~1.24 forms per adjective lexeme, i.e. almost none. Without this, the exact
    # failure the README describes comes straight back: `vergangenen` made the top 10,000 while
    # `vergangen` did not, because the count never got summed onto the lemma.
    #
    # Generating forms from suffix rules is what produced this project's worst bug (`warten→waren`,
    # `Ware→war`). The difference here is what the rule is anchored to. That version GUESSED the
    # lemma from a surface form. This one starts from a lemma Wikidata already says is an
    # adjective and only adds endings, under three guards:
    #
    #   1. the generated form must be ATTESTED in the corpus (no invented words);
    #   2. it must not already be mapped (Wikidata's real data always wins);
    #   3. it must not head a lexeme of its own — that is precisely what stops `alte→alt` when
    #      `alte` is its own entry, and it is the guard the 2026 rule-based version lacked.
    # Two kinds of base take these endings, and both are needed:
    #
    #   adjective lemmas          `eigen`     + en → `eigenen`     → eigen
    #   already-mapped participles `vergangen` + en → `vergangenen` → vergehen
    #
    # The second case is why this iterates over `mapping` too. Wikidata files `vergangen` under the
    # verb `vergehen` (it is a past participle) but has no entry at all for the DECLINED participle
    # `vergangenen` — which occurs 2,577 times, 60× more than `vergangen` itself. Left ungenerated,
    # the declined form ranks as its own word and the base never accumulates its mass: exactly the
    # split-across-inflections failure the README describes. A declined participle belongs wherever
    # its base belongs, so it inherits the base's target rather than pointing at the base.
    # ⚠️ GERMAN MORPHOLOGY ONLY. Arabic is non-concatenative — a plural is `كتاب`→`كتب`, an internal
    # vowel change with no suffix to bolt on, so appending endings would invent words rather than
    # find them. Empty tuple = the whole block becomes a no-op for `--script arabic`.
    ADJECTIVE_ENDINGS = ("e", "en", "em", "er", "es") if script == "latin" else ()
    all_lemmas = set(own_categories)
    bases: dict[str, str] = {lem: lem for lem, cats in own_categories.items() if ADJECTIVE in cats}
    bases.update(dict(mapping))  # snapshot: never expand a row this loop just added
    generated = 0
    for base, target in bases.items():
        for ending in ADJECTIVE_ENDINGS:
            form = base + ending
            if form in counts and form not in mapping and form not in all_lemmas:
                mapping[form] = target
                generated += 1

    # ⚠️ ARABIC DEFINITE ARTICLE. `ال` is a proclitic, not a separate token: Leipzig writes
    # `الكتاب` as one word, so it never matches the bare lemma `كتاب` and the two rank separately.
    # 23.9% of Arabic tokens carry it. Stripping it where the remainder is ALREADY a known form or
    # lemma recovers 5,407 forms and 3.9% of token mass — and the "already known" condition is what
    # keeps it safe, since it never invents a word, it only joins two strings the lexicon already
    # contains. Not applied to Latin script, which has no such clitic.
    clitics_joined = 0
    if script == "arabic":
        known = set(mapping) | set(mapping.values()) | set(own_categories)
        for form in counts:
            if form.startswith("ال") and len(form) > 3 and form not in mapping:
                stem = form[2:]
                if stem in known and stem != form:
                    mapping[form] = mapping.get(stem, stem)
                    clitics_joined += 1

    # Hand-written overrides win. `irregulars.tsv` is this project's own work (MIT, verified by
    # authorship), it predates the Wikidata swap, and it encodes decisions somebody made
    # deliberately — dropping it to adopt a dump would throw away the one input with no upstream
    # licence question at all. Applied BEFORE chain resolution so an override participates in
    # flattening like any other row.
    overrides = 0
    if "--irregulars" in argv:
        irregulars = Path(argv[argv.index("--irregulars") + 1])
        if irregulars.exists():
            for line in irregulars.read_text("utf-8").split("\n"):
                parts = line.split("\t")
                if len(parts) >= 2 and parts[0] and parts[1] and not parts[0].startswith("#"):
                    form, lemma = normalize(parts[0].strip()), normalize(parts[1].strip())
                    if form != lemma and form in counts:
                        mapping[form] = lemma
                        overrides += 1

    chains_flattened = cycles_broken = 0
    for _sweep in range(10):
        if not any(t in mapping for t in mapping.values()):
            break
        c, y = resolve(mapping, counts)
        chains_flattened += c
        cycles_broken += y
    # ⚠️ FINAL RARITY SWEEP. The guard above filters CANDIDATES, but three later steps add rows it
    # never saw: generated adjective forms, hand-written overrides, and chain resolution — which can
    # re-point a form at a much rarer target than the one it was originally checked against. That is
    # how `fast → fasen` survived (2,810 occurrences filed under a lemma with ZERO). Re-checking the
    # finished mapping is the only place that catches all three.
    swept = [f for f, l in mapping.items()
             if counts.get(f, 0) > RARITY_LIMIT * max(1, counts.get(l, 0))]
    for form in swept:
        del mapping[form]

    rows = sorted(mapping.items())

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("".join(f"{f}\t{l}\n" for f, l in rows), encoding="utf-8")
    print(f"  clitic forms joined (ar):             {clitics_joined}")
    print(f"  swept by the final rarity check:      {len(swept)}")
    print(f"  adjective forms generated:            {generated}")
    print(f"  hand-written overrides applied:       {overrides}")
    print(f"  chains flattened:                     {chains_flattened}")
    print(f"  cycles broken:                        {cycles_broken}")

    print(f"  wikidata forms with a distinct lemma: {len(candidates)}")
    print(f"  ...attested in the corpora:           {len(rows)}")
    print(f"  ...of which ambiguous:                {len(ambiguous)}")
    print(f"  blocked by the content-word guard:    {len(blocked)}")
    # Build the lookup ONCE. Inlining `dict(rows)` into the generator's condition rebuilds a
    # 130k-entry dict on every one of the corpus's 544k distinct forms, which does not finish.
    mapped = {f for f, _ in rows}
    covered = sum(c for w, c in counts.items() if w in mapped)
    print(f"  token coverage:                       {100 * covered / sum(counts.values()):.1f}%")
    if report:
        print("\n  every ambiguous decision (chosen ← candidates):")
        for form, chosen, options in sorted(
            ambiguous, key=lambda t: -counts.get(t[0], 0)
        ):
            others = " ".join(o for o in options if o != chosen)
            print(f"    {form:24} → {chosen:20} (over: {others})   [{counts.get(form, 0)}×]")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
