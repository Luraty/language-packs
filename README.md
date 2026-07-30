# Luraty language packs

Word frequency lists and lemma tables, built from public corpora, with the code that builds them and
an honest record of where every byte came from.

Two audiences, and the split is deliberate:

- **You want a frequency list.** Take `languages/<lang>/out/frequency.txt` — one lemma per line,
  commonest first. Read `languages/<lang>/SOURCES.md` for the licence before you redistribute it.
- **You are working on [Luraty](https://github.com/younissk/lughaty).** This repo is the upstream
  for `@luraty/pack-*`. See *The seam*, below.

## What is here today

| Language | Frequency list | Lemma table | Pipeline |
| --- | --- | --- | --- |
| German (`de`) | ✅ 10,000 lemmas | ✅ 83,401 inflections | ✅ reproducible |
| Arabic (`ar`) | ❌ | ❌ | ❌ corpora only — see below |

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

Swapping the lemmatizer reproduced this project's worst bug class **three times in an hour** —
`warten→warte`, `stärke→stärken`, and `in→-in`, the last of which deleted a top-20 German word by
filing the preposition under the feminine *suffix*. All three are now pinned as tests in
`builders/test_lemmas.py`. If you change the lemmatizer again, expect the same, and do not rely on
diffing the output to catch it.

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

> **The gate is open as of 2026-07-30.** All five German sources are stamped. Leipzig's terms were
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

## The seam with Luraty

`@luraty/pack-de` lives in the private [lughaty](https://github.com/younissk/lughaty) repo, not here,
because it imports `@luraty/engine` at runtime and that package is private and unpublished — a public
repo cannot install it. So the pack **vendors** the two output files and turns them into a TypeScript
module (React Native has no `fs`, so a pack cannot ship as `.txt`).

Direction of truth is one-way: **this repo generates, lughaty vendors.** `out/provenance.json`
records the checksums so a divergence is detectable rather than silent. When the engine publishes to
npm, the pack moves here and the duplication ends. Recorded as
[ADR-0008](https://github.com/younissk/lughaty/blob/main/docs/adr/0008-repositories-are-split-by-rate-of-change-not-by-subject.md).

Two analysis tools stayed behind for the same reason — `coverage-curve.mjs` and `diagnose-gap.mjs`
bundle against the engine to measure a pack, so they cannot run here.

## Arabic

**The pipeline is not gone.** The 2026-07-27 reset archived the whole tree as a branch and a tag, so
a complete, tested, already-Python, already-language-agnostic pipeline survives — along with the
finished output: 77,400 MSA lemmas with vocalization, POS and Zipf scores, generated 2026-07-14.

```bash
git -C ../lughaty show archive/pre-reset-2026-07-27:tools/content/zipf/freqpipe/pipeline.py
```

The corpora (3.2 GB) and the 15 MB lemma cache are still on disk there too. Arabic is a **recovery**
job, not a rewrite.

⚠️ **What actually blocks it is the lemmatizer's licence.** That pipeline uses CAMeL Tools — MIT, but
its `morphology-db-msa-r13` and `disambig-mle-calima-msa-r13` databases are **GPL v2**, and the
output's vocalized column is database *content*: Leipzig's Arabic is undiacritized, so every diacritic
was copied out of that lexicon.

There is no permissive full-coverage MSA alternative. Every Arabic UD treebank is non-commercial or
needs the Penn Arabic Treebank from the LDC ($13,500, research-only, redistribution still forbidden);
Farasa is research-only, Alkhalil is NC, Qabas is no-derivatives. The free full-coverage option
(BAMA, 38,600 lemmas) is GPL v2 — which is *why* CAMeL is GPL, since it descends from it.

The likely route is the same one German took: **Wikidata Lexemes (CC0)** has 53,762 Arabic lexemes,
~600–710k form→lemma pairs, and — usefully — every form fully diacritized, which is the exact thing
the GPL database was holding hostage.

Arabic also needs a decision German never faced: inherited dialect and written MSA are related but
different systems, so "Arabic frequency" is at least two lists, measured separately. The archived
77,400-lemma output is MSA only. Note the asymmetry that cuts across it — CAMeL's **dialect**
databases (Gulf, Levantine) are CC BY 4.0; only the MSA one is GPL.
