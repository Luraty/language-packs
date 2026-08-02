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

⚠️ **The German list is built entirely from writing** — Leipzig news and web text. The research is
clear that subtitle frequencies predict how people actually use a language better than written ones
do, and this project exists for someone reactivating a language they *heard*. `make check` says so
on every run. Closing it costs a licence decision, not a code change: `docs/ROADMAP.md` item D.

## Reading order

| | |
| --- | --- |
| [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) | What the research says a frequency list needs, and what this repo does about each point |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | The gaps between those two columns, ordered by value per unit of risk |
| [`docs/CORPORA.md`](docs/CORPORA.md) | Where the next corpus comes from — sizes, licences, and what was actually verified |
| [`catalog/corpora.json`](catalog/corpora.json) | The enforced version of the above. `make catalog` checks it against every language |

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
make check           # licence gate + catalogue cross-check  ← run this before anything
make candidates L=de # what would close this language's register gaps, and at what licence cost
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

The lists are **open source and free for everyone, and also ship inside Luraty, which has paid
features**. Which upstream terms survive follows from the second half, so three terms are checked
separately:

- **share-alike** — contaminates a *permissive* output; fix by splitting the artefact or relicensing.
  ⚠️ It is **not** a commercial restriction — CC BY-SA governs how the data file is licensed onward,
  not whether it may earn money. `lemmas.tsv` is fine
- **non-commercial** — ❌ **fatal, and neither open-sourcing nor "the list is free" routes around
  it.** NC binds the *licensee*, so publishing your derivative lifts nothing; and NC restricts the
  *use*, not the price tag on one component, so a free list inside a paid-feature app is the case NC
  exists to prevent. The gate rejects an NC source feeding a non-NC output *and* rejects any NC
  output, which together mean an NC source is unusable here. Not hypothetical —
  `UD_Arabic-PADT` is CC BY-NC-SA 3.0 and `UD_German-LIT` is CC BY-NC-SA 4.0, and each is the
  *obvious* next treebank for its language
- **no-derivatives** — no output licence rescues it. A frequency count is an adaptation

⚠️ A blanket "open source, non-commercial" licence for the whole repo is not available: `lemmas.tsv`
derives from CC BY-SA treebanks, and **CC BY-SA forbids adding restrictions** — NC included — to a
derivative. Output licences are decided by the upstreams, one artefact at a time.

An **unrecognised licence id is a hard error**, which is the arm that matters most. The check this
replaced split the id on dashes and looked for `SA`, so a typo'd `CC-BY-SA4.0` read as permissive and
sailed through. A typo that silently disables the licence check is the worst failure this gate can
have, because everything downstream then reports green.

> **Nothing is publishable right now**, by design. The two Leipzig licences are unread — four routes
> were tried on 2026-07-30 and the terms page is behind an anti-bot wall. Read them, set
> `licenceVerified` and `verifiedOn`, and the gate opens. The four UD treebank licences *were* read,
> and are stamped with the verbatim text in their notes.

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

Arabic also needed a decision German never faced: inherited dialect and written MSA are related but
different systems, so "Arabic frequency" is at least two lists, measured separately. **That one is
now answered** — the register axis *is* the split. News and Wikipedia are MSA; subtitles are heavily
dialectal, because dubbing and subtitling are done in Egyptian and Levantine rather than MSA. So the
register mix the methodology recommends for any language is the same axis that separates the two
Arabics. Build both from one pipeline, tag them, never sum them.

⚠️ **A harder blocker took its place.** Arabic must be lemmatized — surface forms fragment across
clitics *and* inflections — and the licences read on 2026-07-30 say `UD_Arabic-PADT` is
**CC BY-NC-SA 3.0** (non-commercial), `UD_Arabic-PUD` is clean but ~1,000 sentences, and
`UD_Arabic-NYUAD` ships without word forms and needs a paid LDC licence to populate. There is no
free, commercially usable, large Arabic lemma source among the obvious three. Settle that before
writing pipeline code — `docs/ROADMAP.md` item G.
