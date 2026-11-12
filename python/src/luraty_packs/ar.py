r"""Modern Standard Arabic.

```ts
import { msa, vocabulary } from '@luraty/pack-ar';
```

⚠️ **THE FREQUENCY LIST DESCRIBES NEWSWIRE, NOT SPEECH.** It is counted from two Leipzig Arabic
news corpora, so "rank 40" means the fortieth commonest word *in written journalism*. That is a
good proxy for reading and a poor one for a taxi rank — the vocabulary of asking for directions
is not the vocabulary of a wire report, and this pack will rate a learner who can do the first and
not the second as a beginner.

⚠️ **`ar` AND `ar-x-quran` ARE SEPARATE VARIETIES AND MUST NEVER BE SUMMED.** Unit keys carry the
variety, so a word proven in the mushaf is not proven here. That is correct: knowing
`يُؤْمِنُونَ` from recitation says little about reading a news headline, and a single "Arabic
level" would hide exactly the unevenness this product exists to measure.

⚠️ **`normalizeArabicAlef` IS IN `compare` ONLY, NOT IN `normalize`, AND THE FIRST VERSION OF THIS
PACK GOT THAT WRONG.** Folding أ/إ/ا looks obviously right for unpointed newswire — I wrote a
paragraph arguing it was "what makes the lemma table join the corpus", and it was not verified.
`scripts/check-packs.mjs` refuted it in one line:

    unstable-key — key() is not idempotent: "ماس" keys again to "ماساة"

The lemma table was built stripping harakat, superscript alef and tatweel — **not** hamza-carrying
alefs (see `provenance.json`). Folding them in `normalize` made surface forms collide with table
keys the table never expected, so keying twice gave two different answers and one word would have
been tracked under two unit keys.

⚠️ **THE GENERAL SHAPE, FOR THE THIRD TIME IN THIS REPO: the normalize chain and the lemma table
are two descriptions of one language, and nothing makes them agree except a check that compares
them.** #106 was the same failure between the frequency list and `key()`. The fix is always to
make one derive from the other, or to assert they agree.

It stays in `compare`, where it belongs: a learner typing a plain alef for a hamzated one is
right, and `compare` is about grading her answer rather than about identity.

Sources: frequency from Leipzig newswire (`ara_news_2020_1M`, `ara_news_2022_1M`; Wikipedia
excluded on purpose — CC BY-SA upstream). Lemmatization from Wikidata Lexemes (CC0). See
`luraty-language-packs/languages/ar/out/provenance.json`.
"""

from __future__ import annotations

from typing import Final

from luraty_engine import LanguagePack, Lemma, PackProblem, PackSample, check_pack, vocabulary_of
from luraty_packs._loader import build, read_trimmed

__all__ = ["frequency", "msa", "sample", "self_check", "vocabulary"]

_DIR: Final = "ar"

# The raw frequency list, commonest first — for a host that wants to build its own order.
frequency: Final[str] = read_trimmed(_DIR, "frequency.txt")

# The pack. Pass it to `coverage()`, or to `learner()` as its `pack`.
msa: Final[LanguagePack] = build(_DIR, "@luraty/pack-ar", frequency)

# Every distinct lemma, commonest first. Pre-computed, because every host needs it and computing it
# means keying ten thousand words.
#
# This is what you slice for a placement list, or pass as `learner(...)`'s `vocabulary`.
vocabulary: Final[tuple[Lemma, ...]] = vocabulary_of(msa, frequency)

# A short passage of real running text in this language.
#
# ⚠️ **IT IS THE CONFORMANCE FIXTURE AND THE CALIBRATION TEXT, AND THAT DUAL USE IS DELIBERATE.**
# `check-packs.mjs` tokenizes it to prove the pattern covers the script; the app redacts it by rank
# so a learner can judge where her vocabulary stops. Both need the same thing — ordinary prose that
# this pack claims to handle — and one sample that fails either job is telling you something.
sample: Final[str] = read_trimmed(_DIR, "sample.txt")


def self_check(sample_text: str) -> tuple[PackProblem, ...]:
    r"""Run the engine's conformance checks against this pack's own data.

    ⚠️ Hand it REAL mushaf text, not a transliteration and not a modern-spelled paraphrase. The check
    that matters here is whether the tokenizer survives Uthmani orthography, and only Uthmani input
    exercises it.
    """
    return check_pack(msa, PackSample(text=sample_text))
