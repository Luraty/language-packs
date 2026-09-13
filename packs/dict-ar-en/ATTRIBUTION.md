# Attribution and licensing — `packs/dict-ar-en`

This package is **derived data**: two dictionaries, two different licences, kept apart in the data so
that every meaning can be attributed to the dictionary it came from (`Meaning.source`).

| Part | Licence |
| --- | --- |
| The code (`src/index.ts`, `scripts/`, the compiled `dist/` minus its data string) | MIT |
| Every sense with `source: 'wiktionary-en'` | **CC BY-SA 4.0** |
| Every sense with `source: 'lane'` | public domain (see the caveat below) |

`package.json` declares `MIT AND CC-BY-SA-4.0`. Lane carries no SPDX identifier; it adds no obligation.

⚠️ **EVERY ENTRY IS MACHINE-EXTRACTED AND UNREVIEWED.** No human has read these senses against the
words they are filed under. A sense can be wrong, archaic, or attached to a homograph of the word a
learner tapped. The build artifacts they come from record `reviewed_by: null`, and that null is the
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
3. **Re-keyed** — entries are addressed by `@luraty/pack-ar`'s `key()`. For this source that is an
   exact join; no Wiktionary entry was moved to a different key.
4. **Truncated** — at most 5 senses per word, duplicates removed, each sense cut at a word boundary
   to 200 characters with the cut marked `…`, whitespace collapsed.

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

## `lane` — Lane's Arabic-English Lexicon

> Edward William Lane, *An Arabic-English Lexicon*, 8 parts, London: Williams & Norgate, 1863–1893.

**Licence: public domain.** Published 1863–1893; Lane died in 1876 and the posthumous parts' editor,
Stanley Lane-Poole, in 1931. No copyright term in force anywhere covers the text.

The digitization was taken from the SQLite database distributed with
**wizsk/arabic_lexicons** — <https://github.com/wizsk/arabic_lexicons> — table `lanelexcon`
(`builders/dict_classical.py`).

⚠️ **THE CHAIN OF CUSTODY OF THAT DIGITIZATION IS NOT VERIFIED.** The `arabic_lexicons` repository is
released under GPL-3.0 as a software project and credits other apps for "providing us with the
databases"; it states no separate licence for the data, and the same database holds dictionaries
that are still in copyright (Hans Wehr, among others — deliberately not read). The claim relied on
here is that a transcription of a public-domain text carries no new copyright. That is the usual
position in the United States; in the EU a database maker may hold a sui generis database right.
Confirm before relying on it commercially.

**What was changed:**

1. **Extracted** — HTML stripped, entities decoded, cut to 400 characters (`builders/dict_classical.py`);
   diacritics and tatweel stripped from the index key (`builders/build_dictionary.py`).
2. **Re-keyed** — the extract indexes words with their hamzas removed (`أَرْضٌ` under `ارض`), which
   `@luraty/pack-ar` keys as a different word. Each sense is re-keyed to the headword Lane's own text
   opens with, when that headword is the same spelling up to hamza, ة and ى
   (`@luraty/pack-ar`'s `compare`). 206 senses moved.
3. **Filtered** — only keys `@luraty/pack-ar` can produce are kept. Senses with no English in them
   (a bare headword) and senses that are only a cross-reference (`أَدْمٌ : see أُدْمَةٌ`) were
   dropped: 3,999 of them.
4. **Truncated** — at most 5 senses per word, each cut at a word boundary to 240 characters with
   the cut marked `…`; the extract's `===` / `___` sub-entry separators replaced with ` · `.

Lane's English is **nineteenth-century and scholarly**: it cites its authorities in parentheses
(`(S, M, K)`), quotes Arabic at length, and uses "inf. n.", "aor." and "q. v.". A UI should label it
as a classical reference, not as a gloss.

## Not in this package

No other dictionary. The build directory beside the artifacts holds seven more (Arabic Wiktionary,
Arabic WordNet, five classical Arabic lexicons); none of their data is here.
