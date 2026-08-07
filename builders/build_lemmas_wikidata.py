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

import os
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



# Matres lectionis and the feminine ending: the letters that spell a vowel rather than a consonant,
# so two forms that differ only in these are one root wearing two skeletons. ⚠️ Hamza-carrying
# letters are deliberately NOT here — see the self-lexeme guard, where folding them in collapses
# أمس ("yesterday") onto ماس ("diamond") and loses the clearest error the rule catches.
WEAK = frozenset("اويىة")


def skeleton(word: str) -> str:
    """The consonants of a word, with the vowel letters removed."""
    return "".join(c for c in word if c not in WEAK)


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
    # ⚠️ THE FUNCTION-WORD CLASSES, WHICH ARE THE MIRROR OF `CONTENT` AND EXIST FOR THE SAME REASON.
    # Pronoun, particle, adverb, adposition, conjunction, determiner, interjection — the closed
    # classes. A pronoun is never an inflection of a noun, so a form that heads one must not be
    # filed under a content word. Ids taken from the Arabic dump itself rather than guessed:
    # Q468801 pronoun (هي، أنا), Q184943 particle (قد), Q380057 adverb (هنا), Q4833830 adposition
    # (حوالي), plus the rarer closed classes that appear in the same data.
    FUNCTION = {"Q468801", "Q184943", "Q380057", "Q4833830", "Q36484", "Q576271", "Q1401131"}
    # Longest first, so وال is tested before و.
    PROCLITICS = ("وال", "بال", "فال", "كال", "لل", "ال", "و", "ب", "ل", "ف", "ك", "س")
    # ⚠️ **THE FOUR RULES BELOW RUN FOR ARABIC ONLY, AND THAT IS A LIMIT ON THE EVIDENCE RATHER
    # THAN ON THE IDEA.** Two of them — the function-word guard and the self-lexeme rule — are
    # stated in language-neutral terms and would fire on German unchanged. Every guard that keeps
    # them honest is not: the proclitic list is Arabic, and `skeleton()` strips Arabic matres, so
    # on German `skeleton(a) == skeleton(b)` degenerates to `a == b` and the guard never speaks.
    # Turning them loose on German would mean shipping the rules with their brakes removed, on a
    # pack whose error rate nobody has adjudicated. The German Wikidata dump is not even fetched on
    # this machine, so there is no A/B to run.
    #
    # Doing this properly for German means the same protocol: sample, adjudicate, measure, and
    # write the German-shaped guards (separable prefixes, umlaut, the -en/-e paradigm). Until then
    # the German table is byte-identical, which is checked in `test_lemmas.py`.
    tiebreak_rules = script == "arabic"

    candidates: dict[str, set[tuple[str, str]]] = defaultdict(set)
    own_categories: dict[str, set[str]] = defaultdict(set)
    lexicon: set[str] = set()
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
            # Every string Wikidata calls an Arabic word, lemma or inflection. The proclitic join
            # below uses it as its one guard: never take apart something the lexicon contains.
            lexicon.add(form)
            lexicon.add(lemma)
            # An identity row carries no information: build-frequency falls back to the surface
            # form anyway when the table has no entry.
            if form != lemma:
                candidates[form].add((lemma, category))

    counts = leipzig_counts(corpora, normalize)

    rows: list[tuple[str, str]] = []
    ambiguous: list[tuple[str, str, list[str]]] = []
    blocked: list[tuple[str, list[str]]] = []
    # Forms that head their own lexeme and outrank every candidate — their own citation form. Kept
    # so no later pass can re-map one; see both comments below.
    self_lemma: set[str] = set()
    # form → every lemma Wikidata offered for it, for the rows where there was more than one.
    also: dict[str, list[str]] = {}
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
        # ⚠️ THE TWO SELF-LEXEME THRESHOLDS. Both overridable so the sweeps that chose them can be
        # re-run; neither is a tuned peak, and the comments at their use sites say why.
        #
        #   SELF_RARITY_LIMIT — the form is a lemma in Wikidata, so "commoner than its candidate"
        #     is enough. 1x is the END of the scale, not a fitted value: swept 1/2/4/6x, monotone,
        #     zero regressions at every setting against 145 adjudicated decisions.
        #   RARITY_UNLISTED — Wikidata has not listed the form, so frequency is the only evidence
        #     and the bar is much higher. Swept 10/20/50/100x: the adjudicated score is FLAT across
        #     them (87, 88, 87, 87 of 145), so this is a plateau and the adjudicated set does not
        #     choose. It was chosen on the HEAD of the distribution instead, where 20x removes
        #     كما→كم (89,288x), يجب→أجاب, النقد→قد and أبو→أبى that 50x leaves in.
        SELF_RARITY_LIMIT = float(os.environ.get("SELF_RARITY_LIMIT", "1"))
        RARITY_UNLISTED = float(os.environ.get("RARITY_UNLISTED", "20"))
        options = [
            (lem, cat) for lem, cat in options
            if counts.get(form, 0) <= RARITY_LIMIT * max(1, counts.get(lem, 0))
        ]
        if not options:
            blocked.append((form, ["all candidates far rarer than the form itself"]))
            continue

        # ⚠️ **THERE IS NO CLITIC-INVERSION RULE HERE, AND THE REASON IS WORTH THE PARAGRAPH.**
        # "A citation form never carries a proclitic, so a candidate that is exactly
        # `proclitic + form` cannot be its lemma" looks airtight, and it was written, measured and
        # deleted. It is FALSE for Arabic, because و is not only the conjunction — it is the first
        # radical of a whole productive verb class. Assimilated (مثال) verbs drop it in the
        # imperfect and the imperative, so `proclitic + form` is exactly what a correct assignment
        # looks like:
        #
        #     قف   → وقف     the imperative of "to stop"
        #     صف   → وصف     "describe!"
        #     يهبوا → وهب    an imperfect of "to give"
        #     ينذر  → وذر    an imperfect of "to leave"
        #
        # Enforcing the rule moved 550 rows and re-pointed those paradigms at whatever else shared
        # a skeleton — `ينذر` landed on ذروة, "summit". It also fixed nothing: its motivating cases,
        # قد→وقد and هي→وهي, are a particle and a pronoun, which the function-word guard below
        # already refuses to file under a verb. Measured with and without, on the adjudicated set:
        # 87/145 against 86/145, inside the noise, against 550 rows of real damage.
        #
        # `PROCLITICS` survives because the unlisted-form guard further down uses it for something
        # different and defensible: deciding whether a frequency RATIO is explained by an article.

        # ⚠️ **FUNCTION-WORD PROTECTION — THE MIRROR OF THE CONTENT-WORD GUARD ABOVE.** That guard
        # stops a noun swallowing a verb. This stops a noun or a verb swallowing a PRONOUN or a
        # PARTICLE, which the first guard deliberately allowed through so that article and pronoun
        # paradigms could still merge (`das → der`). Arabic pays for that allowance at the head of
        # its list: نحن ("we") under حان ("the time came"), هنا ("here") under وهن ("weakness").
        #
        # A closed-class word is not an inflection of an open-class one, in any language. Narrow on
        # purpose: it only refuses CONTENT candidates, so a pronoun may still merge into another
        # pronoun's paradigm.
        if tiebreak_rules and own_categories.get(form, set()) & FUNCTION:
            options = [(lem, cat) for lem, cat in options if cat not in CONTENT]

        if not options:
            blocked.append((form, ["clitic inversion or function-word guard removed every candidate"]))
            continue

        lemmas = sorted({lem for lem, _ in options})

        # ⚠️ **SELF-LEXEME RARITY — THE SHARPER QUESTION THE 200× GUARD CANNOT ASK.**
        #
        # `RARITY_LIMIT` asks "is this target absurdly rarer than the form?" and lets anything
        # inside three orders of magnitude through. That is the right question for a form with no
        # opinion of its own. It is the wrong question for a form that HEADS ITS OWN LEXEME: such a
        # word is already a citation form, and if it is also commoner than the thing it is about to
        # be filed under, the corpus is telling you which reading it contains.
        #
        #     أمس  (27,208x) → ماس    "yesterday" filed under "diamond"
        #     أحد  (26,924x) → حد     "one/someone" under "limit"
        #     أول  (20,305x) → آل     "first" under "clan"
        #     حال  (12,372x) → حلا    "state" under "to be sweet"
        #
        # ⚠️ **AND IT MUST NOT FIRE ON A GENUINE INFLECTION THAT HAPPENS TO BE A LEXEME.** يتم is a
        # real verb ("to be orphaned") AND the imperfect of تم; تكون, تعمل, تصدر are the same shape.
        # Every one of them is RARER than its target, so the comparison leaves them alone. That
        # asymmetry is the whole reason the rule is stated as a ratio against the chosen candidate
        # rather than as "heads its own lexeme ⇒ never map", which was measured and breaks them.
        #
        # ⚠️ **DROPPING THE ROW ALSO TERMINATES EVERY CHAIN THAT RAN THROUGH IT, AND THAT IS
        # CORRECT RATHER THAN INCIDENTAL.** `resolve()` treats the mapping as transitive, so a
        # form that is absent from it is a terminus:
        #
        #     shipped   يخوض → خوض → خاض   flattens to   يخوض → خاض
        #     with R5   خوض is a lemma     leaves        يخوض → خوض
        #
        # Deferring the deletion until after flattening was measured as the alternative and is
        # WRONG for the same reason it looks safe: it keeps the edge, so `الأمس` flattens through
        # `أمس` to `ماس` — the very error the rule exists to stop. "Is this form a citation form?"
        # and "does a chain stop here?" are one question, and both halves must get the same answer.
        # On the adjudicated set: terminate 93/145 correct, defer 75/145.
        #
        # ⚠️ **THE SKELETON GUARD IS WHAT KEEPS IT HONEST, AND IT HAS A DIRECTION.** Terminating
        # alone regressed ten forms in seven families, all one shape — the form and its candidate
        # differ ONLY in weak letters (matres lectionis and the feminine ة):
        #
        #     خوض/خاض  دور/دار  ميل/مال      a masdar and its hollow verb, same root
        #     فرنسية/فرنسي  ثانية/ثان  خاصة/خاص   a feminine and its masculine
        #     سوريا/سوري                     a country and its nisba
        #
        # One lexeme wearing two vowel skeletons, and Wikidata lists both as lemmas — which is
        # exactly the condition this rule keys on, so it fires on all of them. The genuine errors
        # do not have the shape: أمس[أمس] vs ماس[مس], أحد[أحد] vs حد[حد], نحن[نحن] vs حان[حن] all
        # differ in their CONSONANTS. ⚠️ Hamza stays a consonant on purpose — folding it into the
        # weak set collapses أمس onto ماس and loses the clearest fix the rule has.
        #
        # ⚠️ **BUT A SYMMETRIC GUARD IS WRONG, BECAUSE THE ة PAIR IS NOT SYMMETRIC.** The feminine
        # is derived from the masculine, so the masculine is the citation form and the direction
        # decides who is right:
        #
        #     خاصة → خاص     the form is the feminine       R5 must NOT fire
        #     شعب  → شعبة    the form is the masculine      R5 SHOULD fire (الشعب, 20,985x)
        #
        # A symmetric guard suppressed both and gave back nine head-of-list fixes — الشعب→شعبة,
        # الحكم→حكمة, يتم→تام, ليست→لاس — to prevent four.
        #
        # ⚠️ **AND A NOUN IS NOT ANYONE'S FEMININE.** جمهورية ("republic") is a noun that merely
        # looks like the feminine of the adjective جمهوري; so are محكمة, محافظة, مقاومة, مؤسسة —
        # every one of them a head-of-list word. The suppression therefore only applies when both
        # sides are the same part of speech. Where they differ, they are two lexemes and the rule
        # stands.
        # ⚠️ **THE SAME CLAIM, FOR THE FORMS WIKIDATA HAS NOT GOT ROUND TO LISTING.** The rule below
        # needs `form in own_categories` — Wikidata must already call the form a lemma. That
        # precondition is about the lexicon's COVERAGE, not about the form, and at the head of the
        # list the gap is expensive:
        #
        #     أنه  (89,256x) → أنهى (759x)   "that he" filed under "to finish"    117x
        #     يجب  (24,162x) → أجاب (713x)   "must" under "to answer"              34x
        #
        # Neither is listed as an Arabic lemma, so the rule below cannot speak, and the frequency
        # tiebreak files a top-20 word under a word 100 times rarer. The shipped table escapes
        # `أنه` only by accident: its chain happened to wander somewhere rare enough for the final
        # 200x sweep to delete the whole row, and terminating chains stops that accident happening.
        #
        # ⚠️ **A LARGE RATIO IS THE EVIDENCE, AND IT HAS TO BE LARGE.** A real inflection is
        # routinely commoner than its citation form — that is why the rule below uses 1x only when
        # the lexicon has independently confirmed the form is a lemma. With no such confirmation
        # the bar is `RARITY_UNLISTED`, swept and set at the value below.
        # ⚠️ **AND A PROCLITIC EXPLAINS THE RATIO, SO IT IS NOT EVIDENCE.** In newswire an
        # ال-prefixed form is routinely 20-50x commoner than its bare lemma — الثاني 18,628x
        # against ثان 614x — which is the ال-join working, not a wrong assignment. A bare ratio
        # test condemns exactly the forms that pass already: الثاني→ثان, الأوروبي→أوروبي,
        # اللازمة→لزم, الإسلامية→إسلامي, المتعلقة→متعلق. So the arm stands down whenever stripping
        # a known proclitic leaves something with the candidate's consonant skeleton.
        #
        # It still fires where the candidate is NOT what the strip produces, which is where the
        # errors live: النقد ("criticism", 5,703x) filed under the particle قد, العدوان under عدو,
        # الإنسان under أنس.
        if tiebreak_rules and form not in own_categories and lemmas:
            likely = max(lemmas, key=lambda lem: (counts.get(lem, 0), [-ord(c) for c in lem]))
            explained = any(form.startswith(c) and len(form) > len(c) + 1
                            and skeleton(form[len(c):]) == skeleton(likely)
                            for c in PROCLITICS)
            if (not explained
                    and counts.get(form, 0) > RARITY_UNLISTED * max(1, counts.get(likely, 0))):
                blocked.append((form, ["unlisted and far commoner than every candidate"]))
                self_lemma.add(form)
                continue

        if tiebreak_rules and form in own_categories and lemmas:
            likely = max(lemmas, key=lambda lem: (counts.get(lem, 0), [-ord(c) for c in lem]))
            same_pos = bool(own_categories.get(form, set()) & own_categories.get(likely, set()))
            derived_feminine = form.endswith("ة") and same_pos
            variant = skeleton(form) == skeleton(likely) and not likely.endswith("ة")
            if (counts.get(form, 0) > SELF_RARITY_LIMIT * max(1, counts.get(likely, 0))
                    and not (variant and (derived_feminine or not form.endswith("ة")))):
                blocked.append((form, ["heads its own lexeme and outranks every candidate"]))
                self_lemma.add(form)
                continue

        if len(lemmas) == 1:
            rows.append((form, lemmas[0]))
            continue
        # Highest-frequency candidate wins; alphabetical only to make ties deterministic.
        chosen = max(lemmas, key=lambda lem: (counts.get(lem, 0), [-ord(c) for c in lem]))
        rows.append((form, chosen))
        ambiguous.append((form, chosen, lemmas))
        # ⚠️ **THE CANDIDATE SET IS KEPT, NOT JUST REPORTED.** It was computed here, printed by
        # `--report`, and thrown away — so 13,834 of 86,910 Arabic rows (15.9%) recorded a silent
        # choice with no trace in the output. lughaty ADR-0028 gave the pack format somewhere to put
        # them; this is the line that fills it.
        also[form] = lemmas

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
            # ⚠️ **NEVER TAKE APART A WORD THE LEXICON LISTS AS A HEADWORD.** `الذي` — one of the
            # commonest words in Arabic, 152,834× — was stripped to `ذي`, a rare form of `ذو`
            # (2,236×), which then absorbed all of it and sat at RANK 16 of the frequency list. A
            # learner was taught `ذي` as the sixteenth most important Arabic word and never taught
            # `الذي` at all. The feminine `التي` is a headword too and happens to have no row, which
            # is why it sat correctly at rank 8 and nobody noticed the asymmetry.
            #
            # The guard is "is it a LEMMA", not "is it a form": `الكتاب` and `الثاني` are both
            # Wikidata *forms*, and joining those is the entire point of this pass.
            if form in own_categories:
                continue
            if form.startswith("ال") and len(form) > 3 and form not in mapping:
                stem = form[2:]
                if stem in known and stem != form:
                    mapping[form] = mapping.get(stem, stem)
                    clitics_joined += 1

    # ⚠️ **THE SINGLE-LETTER PROCLITICS, WHICH THE `ال` RULE'S OWN GUARD CANNOT SAFELY CARRY.**
    # و ب ل ف ك attach the same way and cost more: `وقال`, `وأضاف`, `بشكل`, `بسبب` are all in the
    # top 200 and none of them merges with its bare form. But "strip when the remainder is a known
    # word" is CATASTROPHIC here — Arabic's root system means almost any 2-3 letter remainder is
    # also a word, so `كان` (was) reads as ك+ان, `لجنة` (committee) as ل+جنة, `فقط` (only) as ف+قط,
    # `بحث` (research) as ب+حث. Measured: 12 of 20 control words destroyed.
    #
    # Anchoring to the lexicon instead — never take apart a form Wikidata lists AT ALL, as a lemma
    # or as anyone's inflection — fixes it: **0 of 45 controls destroyed**, 61 joins in the top
    # 1,000, 1,105,705 tokens rejoined. The existing `RARITY_LIMIT` on the stem removes the
    # remainder cases (`وكالة → كالة`, `فيما → يما`).
    #
    # ⚠️ **AND THE STRIP IS CHOSEN BY THE COMMONEST STEM, NOT THE LONGEST CLITIC.** Longest-first
    # reads `والذي` as وال+ذي and lands back on the rare `ذي`; comparing stems gives و+الذي and the
    # right answer. The two orderings disagree on exactly the words this pass exists to rescue.
    #
    # ⚠️ **AND IT CARRIES A FREQUENCY FLOOR, BECAUSE THE UNBOUNDED VERSION WALKS INTO A HERMES
    # CEILING.** Joining every attested proclitic form adds 106,974 rows and takes the table to
    # 192,159 — and `parseLemmas` materialises the whole table as own properties on ONE plain
    # object, which Hermes caps at **196,607** (measured; engine/docs/guides/benchmarking.md). That
    # is 2.3% of headroom on a hard ceiling, on the runtime React Native actually ships and the one
    # Node cannot show you. The next corpus refresh would crash the app on device with every test
    # green.
    #
    # The floor costs almost nothing because `frequency.txt` cuts off at 219 occurrences: a row for
    # a form seen 5 times in 20M tokens cannot affect ranking, introduction or coverage — it only
    # decides what happens if a learner taps that exact string. At 10 the join keeps **96.2% of the
    # corpus mass it recovers** for 31,658 rows instead of 106,974, and the table lands at 116,843,
    # 59% of the cap.
    CLITIC_FLOOR = int(os.environ.get("CLITIC_FLOOR", "10"))
    clitic_stem_joined = 0
    if script == "arabic":
        for form in counts:
            if form in lexicon or form in mapping or counts.get(form, 0) < CLITIC_FLOOR:
                continue
            best = None
            for clitic in PROCLITICS:
                if not form.startswith(clitic) or len(form) <= len(clitic) + 1:
                    continue
                stem = form[len(clitic):]
                if (stem in lexicon and counts.get(stem, 0) > 0
                        and counts.get(form, 0) <= RARITY_LIMIT * max(1, counts.get(stem, 0))
                        and (best is None or counts.get(stem, 0) > counts.get(best, 0))):
                    best = stem
            if best is not None:
                mapping[form] = mapping.get(best, best)
                clitic_stem_joined += 1

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

    # ⚠️ **A LATER PASS MUST NOT PUT BACK WHAT THE SELF-LEXEME RULE TOOK OUT.** The adjective pass,
    # the clitic join and the overrides all add rows after the choice point, and each of them can
    # re-map a form this rule declared to be its own citation form.
    for form in self_lemma:
        mapping.pop(form, None)

    rows = sorted(mapping.items())

    # ⚠️ **EXTRA COLUMNS, AND COLUMN ONE IS UNTOUCHED — THAT IS THE WHOLE SAFETY ARGUMENT.**
    #
    # lughaty ADR-0028: a pack row may list several lemmas, primary first, and the engine's
    # `candidates(s)[0] === key(s)` invariant means everything that reads `key` reads column one. So
    # this loop may only ever APPEND. Verified by the A/B harness in `test_lemmas.py`, which builds
    # with and without the alternates from the same dump and requires column one to be identical.
    #
    # Three conditions, each of which drops the alternates rather than risking a wrong one:
    #
    #   1. **The primary must still be one of the recorded candidates.** Chain flattening, the
    #      clitic join, the overrides and the final rarity sweep all run AFTER the choice was made
    #      and can re-point a form. If they did, the recorded set no longer describes this row and
    #      the honest output is one column.
    #   2. **Every alternate is resolved through the finished mapping.** A candidate that is itself
    #      a form filed elsewhere is not canonical, and ADR-0028's `candidates-not-canonical` check
    #      exists because offering one means the learner who picks it is credited under an address
    #      no other route to that word produces.
    #   3. **Deduped, primary excluded.** `candidates-repeat` — a learner cannot choose between two
    #      identical senses.
    def alternates(form: str, primary: str) -> list[str]:
        listed = also.get(form)
        if not listed or primary not in listed:
            return []
        out_alts: list[str] = []
        for lemma in listed:
            canonical = mapping.get(lemma, lemma)
            if canonical == primary or canonical in out_alts or not canonical:
                continue
            out_alts.append(canonical)
        return out_alts

    with_alternates = 0
    lines = []
    for f, l in rows:
        alts = alternates(f, l)
        if alts:
            with_alternates += 1
        lines.append("\t".join([f, l, *alts]) + "\n")

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("".join(lines), encoding="utf-8")
    print(f"  rows carrying alternate readings:     {with_alternates}")
    print(f"  clitic forms joined (ar):             {clitics_joined}")
    print(f"  proclitic stems joined (ar):          {clitic_stem_joined}")
    print(f"  swept by the final rarity check:      {len(swept)}")
    print(f"  adjective forms generated:            {generated}")
    print(f"  hand-written overrides applied:       {overrides}")
    print(f"  chains flattened:                     {chains_flattened}")
    print(f"  cycles broken:                        {cycles_broken}")

    print(f"  wikidata forms with a distinct lemma: {len(candidates)}")
    print(f"  ...attested in the corpora:           {len(rows)}")
    print(f"  ...of which ambiguous:                {len(ambiguous)}")
    print(f"  blocked by the content-word guard:    {len(blocked)}")
    print(f"  kept as their own lemma (self-lexeme): {len(self_lemma)}")
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
