# Luraty language packs

Word frequency lists and lemma tables, built from public corpora, with the code that builds them and
an honest record of where every byte came from.

Two audiences, and the split is deliberate:

- **You want a frequency list.** Take `languages/<lang>/out/frequency.txt` — one lemma per line,
  commonest first. Read `languages/<lang>/SOURCES.md` for the licence before you redistribute it.
- **You want a pack for `@luraty/engine`.** `npm install @luraty/pack-ar` (or `pack-ar-x-quran`,
  `pack-de`). The packages live in [`packs/`](packs/). See *The npm packages*, below.

## What is here today

| Language | Frequency list | Lemma table | Pipeline |
| --- | --- | --- | --- |
| German (`de`) | ✅ 10,000 lemmas | ✅ 83,361 inflections | ✅ reproducible |
| Arabic (`ar`) | ✅ 10,000 MSA lemmas | ✅ 192,255 surface forms | ✅ reproducible |
| Qur'anic Arabic (`ar-x-quran`) | ✅ 9,598 lemmas | ✅ + mushaf spelling | ✅ reproducible |

## The pipeline

```
  ┌─ acquire ──────────────┐   ┌─ transform ─────────────┐   ┌─ publish ────┐
  │  Leipzig corpora  CC BY│   │  lemma table (CC0)      │   │  Hugging     │
  │  Wikidata Lexemes  CC0 │──▶│  → count → rank         │──▶│  Face        │
  │  builders/fetch_*.py   │   │  builders/  PY + NODE   │   │  hf/  PYTHON │
  └────────────────────────┘   └─────────────────────────┘   └──────────────┘
          data/  (gitignored)      languages/<lang>/out/       N+1 datasets
```

**Why two languages in one repo, and why it is nearly one.** Everything is Python now except
`build-frequency.mjs`, the ranker. The licence gate was ported first, checked byte-for-byte against
the Node original across nine argument combinations spanning exit 0, 1 and 2; the lemmatizer was
rewritten in Python outright when it moved to Wikidata. The seam is a **file format**, not an API:
Leipzig's `rank <TAB> word <TAB> count`. Neither half imports the other.

The ranker is the last piece. It is worth porting the same careful way — against the Node original,
asserting identical bytes — because it is where the counts actually get summed onto lemmas, and a
subtle change there is invisible in a diff of the output.

## Use it

```bash
make help            # every target, with what it actually does
make check           # licence + provenance gate  ← run this before anything
make test            # the gate's own tests
```

Nothing to install for `check` and `test` — the gate is stdlib-only Python and must stay that way,
which `test_gate.py` asserts. A gate that needs `uv sync` before it can tell you whether a licence
is verified is a gate people route around. The transform builders are dependency-free Node. Only
publishing needs [uv](https://docs.astral.sh/uv/): `uv sync`.

### Rebuilding German from scratch

```bash
make corpora-de      # downloads the Leipzig corpora into data/  (~130 MB)
make de              # fetches the Wikidata dump if absent, then builds
```

The lemma table comes from **Wikidata Lexemes**, which is **CC0** — public domain, no attribution
owed, and it expressly waives the EU database right that every share-alike alternative leaves open.
That replaced the UD treebanks, which were CC BY-SA and quietly made the frequency list share-alike
too; see `languages/de/sources.json`.

Swapping the lemmatizer reproduced this project's worst bug class **four times** — `warten→warte`,
`stärke→stärken`, `in→-in` (which deleted a top-20 German word by filing the preposition under the
feminine *suffix*), and `heute→heuen`, "today" filed under "to make hay". The last one was only found
while building Arabic, where the same flaw put `في` under `وفى` and produced a visibly wrong top ten.
All are pinned as tests in `builders/test_lemmas.py`. If you change the lemmatizer again, expect the
same, and do not rely on diffing the output to catch it.

## Licensing is a gate, not a paragraph

`make check` reads `languages/*/sources.json` and refuses inconsistency. `make publish-*` refuses to
ship a file whose upstream terms nobody has actually read.

This is code rather than prose because the prose already failed. The German pack's attribution file
says *"Confirm the current terms before shipping"* — and the Leipzig licence has been wrong twice
anyway, once as CC BY-**NC**, which was briefly treated as a blocker that killed the language.

It also catches the mistake a human reviewer reliably misses: **Hugging Face carries one licence
field per dataset.** Publish a CC BY-SA lemma table alongside a CC BY frequency list and share-alike
swallows both, so every downstream user inherits an obligation — and a frequency list nobody can use
permissively is not the public good this repo exists for.

Both German files are CC BY 4.0 today, so that constraint does not currently bind. It stays anyway,
because it caught the real thing: `frequency.txt` was declared CC BY while being built *through* a
CC BY-SA lemma table, and the check could not fire because `derivedFrom` did not mention it. **A gate
only sees what it is told** — which is why there is now a separate test asserting the declaration
matches what the build actually reads.

> **The gate is open as of 2026-07-30.** Every German and Arabic source is stamped. Leipzig's terms were
> read from their own page via the Wayback Machine (the live site is bot-gated and the tarballs ship
> no licence file): CC BY-NC governs their **query portal**, while "All corpora provided for download
> are licensed under CC BY" — the distinction the earlier CC BY-NC scare got wrong. One inconsistency
> remains recorded and unresolved: Leipzig's own CLARIN repository labels other LCC corpora CC BY-NC.
> None of ours are among them, but a confirming email is cheap insurance.

## Publishing to Hugging Face

One source of truth, **N+1 generated datasets**: one per language plus one combined.

Per-language repos are named for the search rather than the brand —
`younissk/german-word-frequency`, not `younissk/luraty-frequency-de` — because somebody looking for a
German frequency list does not search for a multi-language dataset. Branding goes inside the card,
which search engines index anyway.

⚠️ **Per-language datasets are build artefacts.** Editing one by hand reintroduces exactly the drift
that generating them from one source avoids.

⚠️ **"Automatic" here means `make`, not CI.** GitHub Actions is billing-blocked account-wide across
these projects; every job dies in seconds with `steps: []`. A target you run is honest. A workflow
file that never starts is not.

## The npm packages

[`packs/`](packs/) holds `@luraty/pack-ar`, `@luraty/pack-ar-x-quran` and `@luraty/pack-de`: the
built `frequency.txt` + `lemmas.tsv` for a language, wrapped as a ready `LanguagePack` for
[`@luraty/engine`](https://github.com/Luraty/engine). React Native has no `fs`, so each pack turns its
data files into a TypeScript module (`npm run generate`) and a consumer only runs `npm install`.

[`packs/dict-ar-en`](packs/dict-ar-en/) is the fourth package and not a pack: `@luraty/dict-ar-en`, an
offline Arabic→English dictionary (English Wiktionary, CC BY-SA 4.0, and Lane's Lexicon, public
domain) generated from `languages/fusha/out/` and keyed by `@luraty/pack-ar`'s `key()`. `make dict-ar-en`
rebuilds it.

They moved here from the private Luraty app repository on 2026-09-13, once the engine was on npm —
until then a public repo could not install it. Nothing was rebuilt in the move: each `0.1.x` ships
exactly the files the app was already using.

⚠️ **TWO OF THE THREE ARE NOT TODAY'S `make` OUTPUT.** `packs/ar` is byte-identical to
`languages/ar/out/`. `packs/de` is the 2026-07-28 treebank build (commit `703b101`, CC BY-SA lemma
table), not the current Wikidata rebuild in `languages/de/out/`; `packs/ar-x-quran` is the 2026-07-30
build plus 2,689 mushaf-spelling rows, not the current rebuild. Adopting a rebuild is a deliberate
minor version, with its measurements redone — never a silent `cp`.

```bash
cd packs/ar && npm install && npm run check   # typecheck, tests, build, publint, a plain-Node import
npm publish                                   # prepack builds dist/
```

## Qur'anic Arabic

```bash
make quran
```

The cleanest pack here: the text is 7th-century and public domain, the lexicon is CC0, so there is no
upstream licence to inherit. 77,878 word tokens → **9,598 lemmas**.

**`ar-x-quran`, not `ar-QA`** — `QA` is the region code for *Qatar*. Per the IANA registry there is
no registered variant subtag for Arabic and no ISO code for Classical Arabic, so BCP 47 private use
is the only well-formed way to say this.

Keys are modern orthography; `out/uthmani.tsv` holds the mushaf spelling, which differs for 2,689
forms (`ٱلله`→`الله`, `فى`→`في`, `ءامنوا`→`آمنوا`). Handling that lifted lexicon coverage from 58.0%
of tokens to 78.8% — but each rewrite is conditional on resolving to a known word, because an
unconditional final `ى`→`ي` turns `على` into `علي`.

⚠️ Not usable, despite being the obvious tool: the Quranic Arabic Corpus is GPL **and** states
"CHANGING IT IS NOT ALLOWED."

⚠️ A single closed text, so the counts describe the Qur'an exactly rather than sampling a language.

## Arabic

Built 2026-07-30, MSA newswire, **CC BY 4.0** — same shape as German and the same CC0 lemma source.

```bash
make corpora-ar && make ar
```

**What made it hard was licensing, not linguistics.** Every full-coverage MSA morphological analyser
is blocked: CAMeL's MSA databases are GPL v2, UD Arabic-PADT is CC BY-NC-SA, NYUAD ships no word
forms and needs the Penn Arabic Treebank from the LDC ($13,500, research-only, redistribution
forbidden at any price), Farasa is research-only, Alkhalil is NC, Qabas is ND. Wikidata Lexemes (CC0)
is the only clean link in the chain — and its Arabic forms are fully diacritized, which recovers the
vocalization the GPL database was otherwise the only source of.

The archived pipeline in lughaty (`archive/pre-reset-2026-07-27`) is **not** what produced these
files, and its licence note is why: it recorded "CAMeL Tools (MIT)" and said nothing about the
GPL-v2 *databases* underneath.

Three things change for Arabic and each was a bug before it was a flag: diacritics are stripped on
both sides so the diacritized lexicon joins the undiacritized corpus; the definite article `ال` is
joined to its noun (a proclitic on **23.9%** of tokens); and suffix generation is off, because Arabic
plurals are internal vowel changes with nothing to append.

⚠️ **MSA only.** Inherited dialect is a separate system and is not measured here. That needs a
dialect *corpus*, not a flag — Leipzig's Arabic is all newswire MSA.

⚠️ `ara_wikipedia_2021_1M` is downloaded and deliberately unused: CC BY-SA upstream. Dropping one
corpus is cheaper than defending the argument that a count table doesn't inherit it.
