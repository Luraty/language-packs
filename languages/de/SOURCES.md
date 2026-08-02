# Sources and licensing — German

This is **derived data**. Two upstream sources, two different licences, and they attach to different
files. Read this before shipping anything built from them.

The machine-readable version is [`sources.json`](sources.json), and it is the one that is *enforced*
— `make check` reads it, `make publish-de` refuses on it. This file is for humans; if the two ever
disagree, `sources.json` is what runs.

## `out/frequency.txt` — Leipzig Corpora Collection

Built from word-frequency counts in:

- `deu_news_2024_300K` — German news, 2024
- `deu-de_web_2021_300K` — German web text, 2021

> Leipzig Corpora Collection, Universität Leipzig.
> <https://wortschatz-leipzig.de/>
> D. Goldhahn, T. Eckart & U. Quasthoff: *Building Large Monolingual Dictionaries at the Leipzig
> Corpora Collection: From 100 to 200 Languages.* LREC 2012.

**Licence: CC BY 4.0.** Attribution required; **no non-commercial restriction**.

**Verified 2026-07-30**, and the way it was verified matters because two easier routes both fail:
the downloaded archives ship **no licence file** (confirmed by listing both tarballs — nine data
files each, no LICENSE/README/COPYING, and `*-meta.txt` carries only build dates and token counts),
and the live terms page sits behind a proof-of-work bot gate. The terms were read from Leipzig's own
page via the Wayback Machine, which is reading a public archive of a public page.

The page carries **two grants in adjacent sentences**, and conflating them is what cost this project
real time:

> "...licensed under the Creative Commons License **CC BY-NC**. [...] All corpora provided for
> download are licensed under **CC BY**."

CC BY-NC governs the **query portal and web services**. The **download tarballs** — which is what
`make corpora-de` fetches — are CC BY. The earlier CC BY-NC claim that was treated as a blocker read
the first sentence and missed the second. It was a scope error, not a licence change: the wording is
identical in every snapshot from 2017-04-06 to 2026-02-06. Version 4.0 is confirmed from the href on
"CC BY", not assumed — the visible text gives no version.

⚠️ **One inconsistency remains open, at the source.** Leipzig's own CLARIN repository
(`repo.data.saw-leipzig.de`) labels 87 LCC records CC BY-NC 4.0. None of the corpora used here are
among them, and it is a different packaging on a different channel with its own stated NC default —
but given this licence has now been wrong twice, one email asking LCC to confirm CC BY 4.0 for the
tarballs is cheap insurance before a public release.

## `out/lemmas.tsv` — Wikidata Lexemes (CC0)

Built from the German lexemes (Q188) in the Wikidata lexeme dump, plus this project's own
`irregulars.tsv`.

> Wikidata Lexemes. <https://dumps.wikimedia.org/wikidatawiki/entities/latest-lexemes.json.gz>
> Dump of 2026-07-29: 241,967 German lexemes.

**Licence: CC0 1.0.** From Wikidata:Copyright, read 2026-07-30: *"All structured data from the main,
Property, **Lexeme**, and EntitySchema namespaces is available under the Creative Commons CC0
License."*

Two properties of CC0 are why this replaced the treebanks:

- **No share-alike, no attribution obligation.** CC0 is a *contribution* requirement, so there is no
  upstream chain to audit — the code-licence-versus-data-licence trap that catches almost everything
  else in this space simply does not apply.
- **It waives EU sui generis database rights explicitly.** Every CC BY-SA alternative leaves that
  hook open, and it attaches to investment rather than originality, so "these are just facts" is not
  a defence against it.

### What this replaced, and why

`lemmas.tsv` was built from **UD German-GSD** and **UD German-HDT**, both CC BY-SA 4.0. That made the
lemma table share-alike — which was known — but it *also* made `frequency.txt` share-alike, which was
not: `make de` re-ranked the frequency list *through* the lemma table, so the treebanks shaped
3,824 of the 10,000 entries. `sources.json` declared only Leipzig, so the contamination check had
nothing to fire on and the gate stayed green over a CC-BY-3.0 claim that was false.

The treebanks are gone from the pipeline entirely. `builders/test_gate.py` asserts no share-alike
source can return.

⚠️ Worth recording: **UD German-GSD's lemmas were machine-assigned, not human-annotated** — UD's own
page says *"Lemmas: assigned by a program, not checked manually"* (TreeTagger, later patched with
TIGER gold values). This file and the now-deleted `build-lemmas.mjs` both claimed otherwise until 2026-07-30.

### ⚠️ Why the two files were never published together

Hugging Face carries **one licence field per dataset**. Bundling a BY-SA lemma table into a CC BY
frequency list makes the combined work share-alike: every downstream user of the frequency list
inherits the obligation, and a frequency list nobody can use permissively is not the public good this
repo exists to produce.

`builders/check_sources.py` enforces this, and a test watches the check fire. **The constraint no
longer binds** — both files are CC BY 4.0 now — but the check stays, because the next language will
face the same question. Arabic already does: every full-coverage MSA lemmatizer is GPL, non-commercial,
or costs $13,500 from the LDC. See `languages/ar/sources.json`.

## Share-alike — founder decision of 2026-07-28, now moot

That decision said share-alike on `lemmas.tsv` was fine because the packs are open source. It was
made before the "may ship commercially" framing, and before anyone noticed share-alike had reached
`frequency.txt` as well. Both concerns are resolved by the CC0 swap rather than by the argument, so
the decision no longer has to hold.

## What is NOT derived from anything

- `irregulars.tsv` — hand-written for this project.
- Everything under `builders/` — original, MIT.

## Reproducing the build

```bash
make corpora-de     # Leipzig archives into data/  (~130 MB)
make de             # fetches the Wikidata dump if absent, then builds
make verify         # did the output match what is recorded?
```

One pass now. The old four-pass build existed because the treebank lemmatizer had to bootstrap off a
surface ranking; Wikidata Lexemes is a standalone lexicon, so the table is complete before the first
count is read.

```bash
python3 builders/fetch_wikidata.py Q188 data/wikidata/de.tsv
python3 builders/build_lemmas_wikidata.py data/wikidata/de.tsv <words.txt>... \
  --irregulars languages/de/irregulars.tsv --out languages/de/out/lemmas.tsv
node builders/build-frequency.mjs <words.txt>... --lemmas languages/de/out/lemmas.tsv \
  --out languages/de/out/frequency.txt --limit 10000
```

⚠️ **Diff the output before recording it — and do not rely on that alone.** A lemmatizer regression is
silent and plausible. The rule-based version produced `warten→waren`, `Ware→war`, `Seite→seit` and
`Stärke→stark`, each passing its guard because the wrong target really is a common German word. The
2026-07-30 Wikidata swap then reproduced the same class three more times in an hour: `warten→warte`,
`stärke→stärken`, and `in→-in`, the last filing a top-20 preposition under the feminine *suffix* and
deleting it from the list. All of them are now pinned in `builders/test_lemmas.py`.
