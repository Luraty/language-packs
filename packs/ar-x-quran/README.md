# `@luraty/pack-ar-x-quran`

Qur'anic Arabic, as a `LanguagePack` the engine can run.

```ts
import { arQuran, vocabulary } from '@luraty/pack-ar-x-quran';
```

9,598 lemmas ranked by how often they occur **in the Qur'an**, and 90,549 surface forms that key
onto them. The corpus is a single closed text, so unlike German these counts are not a sample of a
language — they describe the Qur'an exactly.

## Three decisions worth knowing before you touch it

### 0. The tokenize pattern must cover the Qur'anic ANNOTATION block

`[\u0620-\u065F\u066E-\u06D3\u06D5-\u06FF]+` — note that it runs to U+06FF, not U+06D3.

⚠️ **Measured 2026-08-01: leaving out U+06D6–U+06ED cut words in half.** `هُدًۭى` in al-Baqarah 2:2
carries U+06ED ARABIC SMALL LOW MEEM *between* the tanween and the alef maksura, so a class covering
only letters and vowel marks tokenized it as `هُدً` + `ى` — two fragments, neither of them a word.

The corrected count over the full mushaf is **77,878 word tokens, down from 80,811**, which is
exactly what the pack build independently reports. Ranked-token coverage rose **86.0% → 89.7%**.

⚠️ Several of those signs also stand ALONE between words, so `split()` now returns tokens made of no
letters. They key to the empty string, and `coverage()` already excludes unkeyable tokens from its
running count — but any caller doing its own arithmetic over `split()` must filter them, or every
verse looks longer than it is.

### 1. `normalize` strips the vowel marks and nothing else

`["stripArabicDiacritics", "stripTatweel"]`, deliberately short.

⚠️ **`normalizeArabicAlef` IS NOT IN THE CHAIN, and adding it makes the pack worse.** Measured
2026-08-01 over all 80,811 running tokens of the mushaf: folding أ إ آ ٱ together took ranked-token
coverage from **68.5% down to 68.3%**, because it also merges أن into ان and إن into ان — distinct
words that the frequency list holds separately. The provenance file in `luraty-language-packs` warns
about the same class of damage from the other direction: an unconditional final ى→ي turns على into
علي.

It IS in `compare`, and that is not a contradiction. Normalising decides *which word this is*, where
merging two words is a bug; comparing decides *whether the learner's answer is right*, where being
forgiving about an alef someone typed differently is correct.

### 2. The mushaf spellings are DATA, not code

The 2,689 Uthmani forms that differ from their modern spelling — `ٱلله` for `الله`, `فى` for `في`,
`ءامنوا` for `آمنوا` — are appended to `lemmas.tsv` as ordinary surface→lemma rows, inverted from the
`uthmani.tsv` the pack build produces.

⚠️ **This is what makes the pack usable on real mushaf text, and it is worth 17 points.** Measured
2026-08-01: ranked-token coverage over the whole Qur'an went from **68.5% to 86.0%** when those rows
were added — and to **89.7%** once the tokenizer stopped splitting words at recitation marks. The alternative was a new conditional normalize step in the engine — more code, in the
one package that is supposed to know no language.

### 3. Verse text is NOT in this package

A pack is a dictionary; the Qur'an is content. The text lives in `public.passages`, loaded by
`tools/quran/`. Keeping them apart is what lets a second Arabic pack (MSA) score the same verses, and
what stops 340 KB of scripture shipping inside a lexicon.

## Provenance

Built from `luraty-language-packs`, branch `project-next-steps`, `languages/ar-x-quran/out/`:
Wikidata Lexemes (CC0) for lemmatisation, counts from the full mushaf (6,348 stored verses, 77,878
word tokens, 14,811 distinct surface forms). The Qur'anic text itself is public domain.

⚠️ **That branch is not merged.** Regenerating this pack means going and getting it.

## Known residue

10% of running tokens still key to something outside the frequency list — `رضا`, `زال`, `لئك`,
`نهى` and similar. These are lemmatiser artefacts: the CC0 lexicon resolves a form to a base the
Qur'anic count never saw. They read as unknown words to every learner, which makes every text look
slightly harder than it is. Fixing it is a pack-build problem, not a Luraty one.
