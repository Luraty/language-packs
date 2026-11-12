# Attribution and licensing — `packs/dict-ar-en`

This package is **derived data** from one dictionary, English Wiktionary. Every meaning carries the
dictionary it came from (`Meaning.source`), so a UI can attribute it — and so a second source can be
added later without changing the shape of the data.

| Part | Licence |
| --- | --- |
| The code (`src/index.ts`, `scripts/`, the compiled `dist/` minus its data string) | MIT |
| Every sense (`source: 'wiktionary-en'`) | **CC BY-SA 4.0** |

`package.json` declares `MIT AND CC-BY-SA-4.0`.

⚠️ **EVERY ENTRY IS MACHINE-EXTRACTED AND UNREVIEWED.** No human has read these senses against the
words they are filed under. A sense can be wrong, archaic, or attached to a homograph of the word a
learner tapped. The build artifact they come from records `reviewed_by: null`, and that null is the
only place "nobody checked this" is written down — so this file says it again.

## `wiktionary-en` — English Wiktionary

> Wiktionary contributors, *Wiktionary, the free dictionary* — Arabic entries.
> <https://en.wiktionary.org/>
>
> Extracted with Wiktextract and distributed by kaikki.org: <https://kaikki.org/dictionary/Arabic/>.
> Tatu Ylonen, *Wiktextract: Wiktionary as Machine-Readable Structured Data*, LREC 2022.

**Licence: CC BY-SA 4.0** — <https://creativecommons.org/licenses/by-sa/4.0/>. (Wiktionary text is
also available under the GFDL; this package relies on CC BY-SA 4.0 only.)

**What was changed**, as CC BY-SA 4.0 §3(a)(1)(B) requires this to say:

1. **Extracted** — only headword, part of speech and gloss text were taken from the kaikki.org
   Wiktextract dump (`builders/dict_kaikki_ar.py`); examples, etymologies, inflection tables,
   pronunciations and translations were not.
2. **Normalized and filtered** — headwords had Arabic diacritics and tatweel stripped
   (`builders/build_dictionary.py`), and only entries whose key `@luraty/pack-ar` can produce are
   kept (`scripts/build.mjs`).
3. **Re-keyed** — entries are addressed by `@luraty/pack-ar`'s `key()`. That is an exact join; no
   entry was moved to a different key.
4. **Truncated** — at most 5 senses per word, duplicates removed, each sense cut at a word boundary
   to 200 characters with the cut marked `…`, whitespace collapsed.

A few Wiktionary glosses quote other dictionaries by name (one cites Lane). That text is
Wiktionary's, under Wiktionary's licence.

### ⚠️ The share-alike obligation

CC BY-SA 4.0 is **share-alike**. If you redistribute this data, or anything adapted from it — a
re-keyed copy, a subset, a merge with another dictionary — you must:

- **credit** Wiktionary's contributors and link the source and the licence, as above;
- **say what you changed**;
- **license your adaptation under CC BY-SA 4.0** (or a licence listed as BY-SA compatible), and add
  no terms or technical measures that stop others doing the same.

That obligation attaches to the **data**, not to the MIT code around it. Whether shipping it inside
an application makes the application an adaptation or a collection is a question for whoever ships
the application; this file does not answer it.

## Deferred: Lane's Lexicon

Edward William Lane's *An Arabic-English Lexicon* (1863–1893) was built into this package before its
first publish and **removed on 2026-09-13, before anything was published**. The text itself is public
domain. The digital copy is the problem: the only one available to the build is the `lanelexcon`
table in the SQLite database distributed with **wizsk/arabic_lexicons**
(<https://github.com/wizsk/arabic_lexicons>), a repository released under **GPL-3.0** as a software
project, which credits other apps for the databases and states **no separate licence for the data**.
Whether a transcription of a public-domain text carries new rights is not settled by that: in the
United States it usually does not, but in the EU the maker of a database may hold a *sui generis*
database right in it. Until a digitization with a clear licence (or a clear statement from its
maker) exists, none of Lane's text is in this package.

## Not in this package

No other dictionary. The build directory beside the artifact holds eight more (Lane, Arabic
Wiktionary, Arabic WordNet, five classical Arabic lexicons); none of their data is here.
