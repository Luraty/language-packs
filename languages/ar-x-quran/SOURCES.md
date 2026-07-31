# Sources and licensing — Qur'anic Arabic

**This is the cleanest pack in the repo.** The text is 7th-century and public domain; the lexicon is
CC0. There is no upstream licence to inherit at all.

The enforced version is [`sources.json`](sources.json). This file is for humans.

## Why `ar-x-quran` and not `ar-QA`

`QA` is the ISO **region** code for **Qatar** — `ar-QA` means "Arabic as used in Qatar" to every
BCP 47 parser and i18n library. `ar-qu` is malformed: variant subtags must be 5–8 characters.

Checked against the IANA language-subtag-registry on 2026-07-30:

- there is **no registered variant subtag for Arabic** at all
- there is **no ISO 639-3 code for Classical Arabic** — Classical Syriac has `syc`, Classical
  Armenian `xcl`, Classical Sanskrit the variant `cls`, but Arabic's classical register is folded
  into `arb`

Private use (`-x-`) is therefore the only well-formed way to express this, and it cannot collide
with a country code.

## `out/frequency.txt` — the Qur'an

6,236 canonical verses, **77,878 word tokens**, 14,811 distinct surface forms → **9,598 lemmas**.

**Licence: public domain (age).** No copyright subsists in a 7th-century work. At most a particular
digitization could claim thin rights, and a faithful transcription of a public-domain text attracts
no new copyright in most jurisdictions — explicit in the EU, where Directive (EU) 2019/790 Article 14
denies protection to faithful reproductions of public-domain works. The digitization used
([`semarketir/quranjson`](https://github.com/semarketir/quranjson)) is MIT.

⚠️ **What was deliberately not used.** The [Quranic Arabic Corpus](https://corpus.quran.com) has
3,680 hand-annotated lemmas and would have been ideal. Its terms are GPL **plus**:

> "Permission is granted to copy and distribute verbatim copies of this file, but CHANGING IT IS NOT
> ALLOWED."

A derived lemma-frequency list is exactly the change that forbids. Same trap as CAMeL's GPL-v2
databases, one notch tighter.

## `out/lemmas.tsv` — Wikidata Lexemes (CC0)

Same source and dump as [`../ar`](../ar/SOURCES.md).

⚠️ **The table is built against the Leipzig Arabic corpora as well as the Qur'an**, and that is
deliberate. The homograph tiebreak and the rarity guard are *statistical* — they need a large
frequency signal to conclude that `في` is a word in its own right rather than an inflection of the
rare verb `وفى`. Built against the Qur'an alone (77,878 tokens) the statistics are too thin and `في`
lands under `وفى`: the same wrong top ten that the first MSA Arabic build produced. Leipzig decides;
the Qur'an contributes its own vocabulary and **all** of the ranking.

## `out/uthmani.tsv` — the mushaf spelling

Keys are **modern orthography**; this file maps each key to how it is actually written in the mushaf.
**2,689 of 14,811 forms differ.**

| Uthmani | modern | what it is |
| --- | --- | --- |
| `ٱلله` | `الله` | alef wasla (U+0671) instead of alef |
| `فى` | `في` | final alef maqsura where modern uses ya |
| `ءامنوا` | `آمنوا` | bare hamza sequence instead of madda |
| `شىء` | `شيء` | the same maqsura-for-ya, word-medially |

Handling these lifted lexicon coverage from **58.0% of tokens to 78.8%**.

⚠️ **Every rewrite is conditional on resolving to a word the lexicon knows**, and that is not caution
for its own sake. An unconditional final `ى`→`ي` turns `فى` into `في`, which is right, and `على` into
`علي`, which is wrong — `على` ends in alef maqsura in modern orthography too, as do `إلى`, `حتى` and
`متى`, and those are among the commonest words in the text. Letting the lexicon arbitrate instead of
the rule is the same principle as the corpus-attestation filter: never invent a form, only join to
one that already exists.

## Reading the counts honestly

This is a **single closed text of ~78,000 words**, not a sample of a language. The counts describe
the Qur'an exactly — which is a stronger claim than a corpus-based list can make, and a narrower one.
A word occurring twice here is genuinely rare *in the Qur'an*; that is not the same as being rare in
Arabic. `--min-count 1` is set for the same reason: a curated text has no OCR tail to filter, so a
word occurring once is a real word. (The default floor of 20, tuned for Leipzig's ~10M tokens, cut
97% of the vocabulary and produced a 404-entry list.)

Classical Arabic — neither Modern Standard Arabic nor any spoken dialect.

## Reproducing

```bash
make corpora-ar     # Leipzig Arabic, needed for the lemma table's statistics
make quran          # fetches the text, then builds
make verify
```
