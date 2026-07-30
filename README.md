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
| German (`de`) | ✅ 10,000 lemmas | ✅ 15,471 inflections | ✅ reproducible |
| Arabic (`ar`) | ❌ | ❌ | ❌ corpora only — see below |

## The pipeline

```
  ┌─ acquire ──────────────┐   ┌─ transform ─────────────┐   ┌─ publish ────┐
  │  Gutenberg · Wikipedia │   │  count → rank           │   │  Hugging     │
  │  Hugging Face · Leipzig│──▶│  → lemmatize → re-rank  │──▶│  Face        │
  │  utils/*.py   PYTHON   │   │  builders/*.mjs   NODE  │   │  hf/  PYTHON │
  └────────────────────────┘   └─────────────────────────┘   └──────────────┘
          data/  (gitignored)      languages/<lang>/out/       N+1 datasets
```

**Why two languages in one repo.** Acquisition and publishing are Python because that is where the
Hugging Face tooling lives. The transformation stage is Node because it already exists, is already
correct, and its comments record five specific silent failures that a rewrite would have to
rediscover — see `provenance.json`'s `lemmatizerWarning`. The German corpora are not on this machine,
so a rewrite could not even be verified. The seam between the two is a **file format**, not an API:
Leipzig's `rank <TAB> word <TAB> count`. Neither half imports the other.

## Use it

```bash
make help            # every target, with what it actually does
make check           # licence + provenance gate  ← run this before anything
make test            # the gate's own tests
```

Nothing to install for `check` and `test` — the Node builders are dependency-free. The Python side
uses [uv](https://docs.astral.sh/uv/): `uv sync`.

### Rebuilding German from scratch

```bash
make corpora-de      # downloads Leipzig + clones the UD treebanks into data/
make de              # two passes, ~1 minute
```

`make de` runs the build **twice** on purpose. Pass one ranks surface forms, because there is no
lemma table yet; the lemma table is built from that ranking; pass two re-ranks with each surface
count summed onto its lemma. Skipping pass two splits a word's frequency across its inflections —
`vergangen`, `eigen` and `zweit` fall out of the top 10,000 while `vergangenen`, `eigenen` and
`zweiten` stay in, and 750 entries end up with a key nothing can rank.

## Licensing is a gate, not a paragraph

`make check` reads `languages/*/sources.json` and refuses inconsistency. `make publish-*` refuses to
ship a file whose upstream terms nobody has actually read.

This is code rather than prose because the prose already failed. The German pack's attribution file
says *"Confirm the current terms before shipping"* — and the Leipzig licence has been wrong twice
anyway, once as CC BY-**NC**, which was briefly treated as a blocker that killed the language.

It also catches the mistake a human reviewer reliably misses: **Hugging Face carries one licence
field per dataset.** `frequency.txt` is CC BY, `lemmas.tsv` is CC BY-**SA**. Publish them together
and share-alike swallows both, so every downstream user of the frequency list inherits an obligation
— and a frequency list nobody can use permissively is not the public good this repo exists for.

> **Nothing is publishable right now**, by design. Four upstream licences are unstamped. Read them,
> set `licenceVerified` and `verifiedOn`, and the gate opens.

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

The corpora are downloaded — `ara_news_2020_1M`, `ara_news_2022_1M`, `ara_wikipedia_2021_1M`, about
3.2 GB — but **the code that processed them is gone**, deleted with the rest of the content pipeline
on 2026-07-27. Only the archives and a 15 MB lemma cache survive.

Arabic also needs a decision German never faced: inherited dialect and written MSA are related but
different systems, so "Arabic frequency" is at least two lists, measured separately.
