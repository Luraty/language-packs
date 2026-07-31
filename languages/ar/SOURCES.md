# Sources and licensing — Arabic

This is **derived data**. The machine-readable version is [`sources.json`](sources.json) and it is
the one that is *enforced* — `make check` reads it. This file is for humans; if the two disagree,
`sources.json` is what runs.

**Everything here is CC BY 4.0 or CC0.** Nothing is share-alike, non-commercial, or paid.

## `out/frequency.txt` — Leipzig Arabic newswire

Built from word-frequency counts in:

- `ara_news_2020_1M` — Arabic news, 2020
- `ara_news_2022_1M` — Arabic news, 2022

> Leipzig Corpora Collection, Universität Leipzig. <https://wortschatz-leipzig.de/>
> D. Goldhahn, T. Eckart & U. Quasthoff: *Building Large Monolingual Dictionaries at the Leipzig
> Corpora Collection: From 100 to 200 Languages.* LREC 2012.

**Licence: CC BY 4.0**, verified 2026-07-30. See [`../de/SOURCES.md`](../de/SOURCES.md) for the full
evidence chain — the terms page carries two grants and the earlier CC BY-NC reading conflated them.

⚠️ **`ara_wikipedia_2021_1M` is downloaded and deliberately not used.** Its upstream is Arabic
Wikipedia, which is CC BY-SA, so Leipzig arguably grants more than it holds. A count table
incorporates no source expression and the argument would probably hold — but dropping one corpus is
cheaper than defending it, and the two news corpora carry no share-alike upstream at all.

## `out/lemmas.tsv` — Wikidata Lexemes (CC0)

> Wikidata Lexemes, Arabic (Q13955). Dump of 2026-07-29: 53,770 lexemes, 1,381,387 form→lemma pairs.

**Licence: CC0 1.0.** *"All structured data from the main, Property, **Lexeme**, and EntitySchema
namespaces is available under the Creative Commons CC0 License."*

### Why Wikidata and not a real Arabic morphological analyser

Because every alternative is blocked, and this was checked rather than assumed:

| resource | licence | verdict |
| --- | --- | --- |
| CAMeL `morphology-db-msa-r13`, `disambig-mle-calima-msa-r13` | **GPL v2** | viral |
| CAMeL `morphology-db-msa-s31` (SAMA 3.1) | **LDC** | members only, no commercial use, ever |
| UD Arabic-PADT | **CC BY-NC-SA 3.0** | non-commercial |
| UD Arabic-NYUAD | CC BY-SA 4.0, **ships no word forms** | needs PATB from the LDC |
| Penn Arabic Treebank (LDC) | **$13,500** non-member | research-only; redistribution forbidden at any price |
| Farasa | research-only | — |
| Alkhalil, Qutuf | CC BY-**NC** | non-commercial |
| Qabas | CC BY-**ND** | a derived list is exactly what ND forbids |
| BAMA 1.0 | **GPL v2**, free | the ancestor CAMeL descends from — which is *why* CAMeL is GPL |
| **Wikidata Lexemes** | **CC0** | the only clean link in the chain |

CAMeL Tools *itself* is MIT. Its **databases** are not, and the distinction is the whole trap: the
archived pipeline in the sibling repo recorded its licence as "CAMeL Tools (MIT)" and said nothing
about the data. Its vocalized column was database *content* — Leipzig's Arabic is undiacritized, so
every diacritic in it came out of a GPL-v2 lexicon.

Wikidata also happens to solve that: its Arabic forms are **fully diacritized**, under CC0.

## Arabic is not German with different letters

Three things in the pipeline change for `--script arabic`, and each one was a bug before it was a
flag:

1. **Diacritics are stripped on both sides.** Wikidata writes `كَتَبَ`, Leipzig writes `كتب`. Compared
   raw, nothing matches at all.
2. **The definite article `ال` is joined to its noun**, where the bare noun is already known. It is a
   proclitic, not a separate token — Leipzig writes `الكتاب` as one word — and it sits on **23.9% of
   all Arabic tokens**. Joining recovers 5,696 forms.
3. **Suffix generation is off.** German gets adjective endings appended to known lemmas; Arabic is
   non-concatenative, where a plural is `كتاب`→`كتب`, an internal vowel change with nothing to append.

⚠️ **The first Arabic build had a wrong top ten** and it is worth knowing why. `في` ("in",
1,619,683 occurrences) was filed under `وفى` ("to fulfil", 511) and `من` ("from") under the given
name `منية` (28), because the homograph tiebreak compared candidates only against each other and
never against the form. The fix — refuse to map a form onto a lemma more than 200× rarer than itself
— then turned out to fix German too, where `heute` had been filed under `heuen` ("to make hay").

## What is NOT derived from anything

Everything under `builders/` — original, MIT.

## Reproducing the build

```bash
make corpora-ar     # the two Leipzig Arabic news corpora  (~600 MB)
make ar             # fetches the Wikidata dump if absent, then builds
make verify         # did the output match what is recorded?
```

⚠️ **MSA only.** Inherited dialect and written MSA are different systems, so "Arabic frequency" is at
least two lists. This is the MSA one, and newswire at that — it is not the Arabic anyone speaks at
home. A dialect list needs a dialect *corpus*; it is not a flag on this pipeline.
