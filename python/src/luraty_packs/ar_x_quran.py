r"""Qur'anic Arabic, already built.

```ts
import { ar_quran, vocabulary } from '@luraty/pack-ar-x-quran';
```

⚠️ **THE FREQUENCY LIST DESCRIBES THE QUR'AN, NOT ARABIC.** It is counted from one closed text of
77,878 words, so "rank 40" means the fortieth commonest word *in the mushaf* — which is exactly
what you want for grading a verse and exactly wrong for grading a newspaper. A learner's Qur'anic
vocabulary and their Modern Standard Arabic vocabulary are different measurements, taken with
different packs, and they must never be summed.

⚠️ **`ar-x-quran` IS ITS OWN VARIETY, not a flavour of `ar`.** Unit keys carry it, so a word proven
here is not proven in MSA. That is the correct behaviour and the reason the two are separate packs:
knowing `يُؤْمِنُونَ` from recitation says little about reading a news headline.
"""

from __future__ import annotations

from typing import Final

from luraty_engine import LanguagePack, Lemma, PackProblem, PackSample, check_pack, vocabulary_of
from luraty_packs._loader import build, read_trimmed

__all__ = ["ar_quran", "frequency", "sample", "self_check", "vocabulary"]

_DIR: Final = "ar-x-quran"

# The raw frequency list, commonest first — for a host that wants to build its own order.
frequency: Final[str] = read_trimmed(_DIR, "frequency.txt")

# The pack. Pass it to `coverage()`, or to `learner()` as its `pack`.
ar_quran: Final[LanguagePack] = build(_DIR, "@luraty/pack-ar-x-quran", frequency)

# Every distinct lemma, commonest first. Pre-computed, because every host needs it and computing it
# means keying ten thousand words.
#
# This is what you slice for a placement list, or pass as `learner(...)`'s `vocabulary`.
vocabulary: Final[tuple[Lemma, ...]] = vocabulary_of(ar_quran, frequency)

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
    return check_pack(ar_quran, PackSample(text=sample_text))
