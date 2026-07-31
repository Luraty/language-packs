#!/usr/bin/env python3
"""Fetch the Qur'anic text and emit Leipzig-format word counts.

⚠️ WHY THIS IS THE CLEANEST SOURCE IN THE REPO.

The text is 7th-century. No copyright subsists in the WORK — only, at most, in a particular
digitization, and a faithful transcription of a public-domain text attracts no new copyright in
most jurisdictions (in the EU this is explicit: Directive (EU) 2019/790 Article 14 denies protection
to faithful reproductions of public-domain works). So unlike German and Arabic, where the corpus
licence took real work to establish, here there is no upstream licence to inherit.

The digitization used is `semarketir/quranjson` (MIT). That MIT grant covers the packaging; the text
underneath is public domain either way.

⚠️ WHAT IS NOT USABLE, and it is the obvious thing: the Quranic Arabic Corpus (corpus.quran.com)
has 3,680 hand-annotated lemmas and would be perfect. Its terms are GPL **plus** "Permission is
granted to copy and distribute verbatim copies of this file, but CHANGING IT IS NOT ALLOWED." A
derived lemma-frequency list is exactly the change that forbids. Same trap as CAMeL's GPL-v2
databases, one notch worse. Do not reach for it.

⚠️ UTHMANI ORTHOGRAPHY IS NOT MODERN ORTHOGRAPHY. The mushaf spells words in ways a modern reader
does not type, and every one of these was a silent join failure before it was a rule:

    ٱلله    alef wasla (U+0671) instead of alef      -> الله
    فى      final alef maqsura where modern uses ya  -> في
    ءامنوا  bare hamza sequence instead of madda      -> آمنوا
    شىء     the same maqsura-for-ya, word-medially    -> شيء

Handling them lifted Wikidata coverage from 58.0% of tokens to 78.8%. The normalized spelling is
what becomes the KEY; the Uthmani spelling is kept as a display column, because it is what is
actually written in the mushaf and a learner reading along needs to recognise it.

Usage:
    python3 builders/fetch_quran.py --out data/quran/quran-words.txt \\
        --wikidata data/wikidata/ar.tsv [--uthmani data/quran/uthmani.tsv]

Output is Leipzig's `rank <TAB> word <TAB> count`, so the rest of the pipeline needs no special case.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/semarketir/quranjson/master/source/surah/surah_{}.json"
UA = {"User-Agent": "luraty-language-packs/0.1 (github.com/younissk/luraty-language-packs)"}
SURAHS = 114

# Harakat, superscript alef, tatweel, and the Qur'anic recitation marks (U+06D6–U+06ED) that appear
# throughout the mushaf and are not part of any word.
MARKS = re.compile("[ً-ْٰـۖ-ۭٖ-ٟ]")
NON_ARABIC = re.compile("[^ء-ي]")


# Uthmani → modern rewrites, each a documented orthographic convention of the mushaf.
REWRITES = (
    ("ٱ", "ا"),        # alef wasla ٱ → alef ا     ٱلله   → الله
    ("ءا", "آ"),      # bare hamza seq → madda     ءامنوا → آمنوا
    ("ىء", "يء"),    # maqsura-for-ya, medial     شىء    → شيء
)
FINAL_MAQSURA = re.compile("ى$")


def to_modern(word: str, known: set[str]) -> str:
    """Uthmani spelling → the spelling a modern reader would type.

    ⚠️ EVERY REWRITE IS CONDITIONAL ON RESOLVING TO A KNOWN WORD, and that is not caution for its
    own sake — an unconditional rule got this wrong immediately. Final ى → ي turns `فى` into `في`,
    which is right, and `على` into `علي`, which is WRONG: `على` ends in alef maqsura in modern
    orthography too, as do `إلى`, `حتى` and `متى`. Those are among the commonest words in the text,
    so an unconditional rule corrupts the head of the list.

    Applying a rewrite only when it turns an unrecognised string into a recognised one makes the
    lexicon arbitrate instead of the rule. Same shape as the corpus-attestation filter in
    build-frequency.mjs: never invent a form, only join to one that already exists.
    """
    if word in known:
        return word
    for src, dst in REWRITES:
        if src in word:
            candidate = word.replace(src, dst)
            if candidate in known or candidate != word:
                word = candidate
    if word in known:
        return word
    candidate = FINAL_MAQSURA.sub("ي", word)
    return candidate if candidate in known else word


def main(argv: list[str]) -> int:
    if "--out" not in argv:
        print(__doc__.strip().split("Usage:")[1], file=sys.stderr)
        return 2
    out = Path(argv[argv.index("--out") + 1])
    uthmani_out = Path(argv[argv.index("--uthmani") + 1]) if "--uthmani" in argv else None

    # The lexicon that arbitrates the orthographic rewrites above. Falling back to an empty set
    # would silently disable every conditional rule, so an absent table is an error, not a default.
    wikidata = Path(argv[argv.index("--wikidata") + 1]) if "--wikidata" in argv else None
    if wikidata is None or not wikidata.exists():
        print("need --wikidata data/wikidata/ar.tsv (run: make ar)", file=sys.stderr)
        return 2
    marks = re.compile("[ً-ْٰـ]")
    known: set[str] = set()
    for line in wikidata.read_text("utf-8").split("\n"):
        parts = line.split("\t")
        if len(parts) >= 2 and parts[0] and parts[1]:
            known.add(marks.sub("", parts[0]))
            known.add(marks.sub("", parts[1]))

    counts: Counter[str] = Counter()
    # For each normalized key, how often each Uthmani spelling produced it. The commonest wins the
    # display column — several spellings can collapse onto one key and picking arbitrarily would
    # make the displayed form unstable between builds.
    spellings: dict[str, Counter[str]] = defaultdict(Counter)
    verses = 0

    for surah in range(1, SURAHS + 1):
        request = urllib.request.Request(SOURCE.format(surah), headers=UA)
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.load(response)
        for verse in data.get("verse", {}).values():
            verses += 1
            for token in verse.split():
                uthmani = MARKS.sub("", token)
                uthmani = re.sub("[^ء-يٱ]", "", uthmani)
                if not uthmani:
                    continue
                key = to_modern(uthmani, known)
                key = NON_ARABIC.sub("", key)
                if not key:
                    continue
                counts[key] += 1
                spellings[key][uthmani] += 1

    # The Qur'an has 6,236 verses in the standard Kufan counting. This source stores the basmala as
    # a separate entry for 112 of the 114 surahs, so its own expected total is 6,348. Assert the
    # figure rather than trusting it: if the source ever changes shape, the counts silently change
    # meaning, and a frequency list that quietly measures a different text is the worst failure here.
    EXPECTED_VERSES = 6348
    if verses != EXPECTED_VERSES:
        print(f"  ⚠️  {verses} verses, expected {EXPECTED_VERSES} (6,236 canonical + 112 basmala). "
              f"The source changed shape — do not record these counts until you know why.",
              file=sys.stderr)
        return 1

    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        "".join(f"{i}\t{word}\t{count}\n" for i, (word, count) in enumerate(ranked, 1)),
        encoding="utf-8",
    )
    print(f"  verses {verses}  tokens {sum(counts.values())}  distinct forms {len(counts)}")
    print(f"  wrote {out}")

    if uthmani_out is not None:
        uthmani_out.parent.mkdir(parents=True, exist_ok=True)
        uthmani_out.write_text(
            "".join(f"{key}\t{spellings[key].most_common(1)[0][0]}\n" for key, _ in ranked),
            encoding="utf-8",
        )
        differing = sum(1 for k in counts if spellings[k].most_common(1)[0][0] != k)
        print(f"  wrote {uthmani_out} ({differing} of {len(counts)} differ from the modern key)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
