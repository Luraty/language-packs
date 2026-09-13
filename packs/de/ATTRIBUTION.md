# Attribution and licensing — `packs/de`

This pack is **derived data**. Two upstream sources, two different licences, and they attach to
different files. Read this before shipping the pack in anything.

## `frequency.txt` — Leipzig Corpora Collection

Built from word-frequency counts in:

- `deu_news_2024_300K` — German news, 2024
- `deu-de_web_2021_300K` — German web text, 2021

> Leipzig Corpora Collection, Universität Leipzig.
> <https://wortschatz-leipzig.de/>
> D. Goldhahn, T. Eckart & U. Quasthoff: *Building Large Monolingual Dictionaries at the Leipzig
> Corpora Collection: From 100 to 200 Languages.* LREC 2012.

**Licence: CC BY 4.0.** Attribution required; **no non-commercial restriction**.

✅ **CONFIRMED IN WRITING BY WORTSCHATZ LEIPZIG, 2026-08-04**, replying to a question that named these
corpora specifically and stated the intended commercial use. The question is in
[`leipzig-licence-email.md`](../../leipzig-licence-email.md); the reply is kept on file by the project.

That settles two things this file previously had to guess at:

1. **The version.** This note used to hedge between CC BY 3.0 word lists and CC BY 4.0 RDF datasets.
   It is **4.0** for the download archives.
2. **The archives carry no licence file** — that part was true and remains true. The terms live on
   the portal page and now in that reply, so nothing downstream of a download can tell you what you
   took. This is why the confirmation is checked in rather than left in an inbox.

⚠️ **AN EARLIER NOTE IN THIS REPOSITORY CLAIMED LEIPZIG WAS CC BY-NC** and therefore unusable in a
paid product. That was wrong and was being treated as a blocker. The likely source of the error is
real and still live: **`repo.data.saw-leipzig.de` genuinely is CC BY-NC**, and it is a *different*
corpus set from the Wortschatz portal. Download from the portal, never from the repository site.

## `lemmas.tsv` — Universal Dependencies German treebanks

Built from the human-annotated `FORM` → `LEMMA` columns of:

- **UD German-GSD** — CC BY-SA 4.0
- **UD German-HDT** — annotation CC BY-SA 4.0 (the underlying *text* is academic-use only; only the
  annotation columns are used here, and no source text is redistributed)

> Universal Dependencies. <https://universaldependencies.org/>

**Licence: CC BY-SA 4.0.** ⚠️ **Share-alike.** A file derived from a BY-SA source is normally
required to carry BY-SA itself, so `lemmas.tsv` should be treated as CC BY-SA 4.0 and distributed
with this notice.

Share-alike attaches to *this data file*, not to an application that reads it — but that boundary is
a legal question, not an engineering one, and it should be checked by someone qualified before the
pack ships commercially.

## What is NOT derived from anything

- `pack.config.json` — original.
- `irregulars.tsv` — hand-written for this project. Now lives in
  [luraty-language-packs](https://github.com/Luraty/language-packs) at
  `languages/de/irregulars.tsv`.
- Everything in `engine/` — original.

## Share-alike is NOT a problem — founder decision, 2026-07-28

**The language packs are open source.** CC BY-SA on `lemmas.tsv` is therefore fine, and the
question this file spent two revisions worrying about is closed. Ship the attribution, keep the
licence, move on.

The note below is kept only for the case where a future pack must ship closed.

## If the share-alike ever does become a problem

`lemmas.tsv` is the only BY-SA artefact. Replacements exist and the pipeline does not care which
one produced the file:

- Extract inflections from **German Wiktionary** (also CC BY-SA — same problem).
- Buy or license a commercial morphology (DWDS, Canoo, or a vendor lexicon).
- Hand-write it. `irregulars.tsv` shows the shape; 15,000 rows is a lot of typing but it is
  the only route that carries no upstream licence at all.

## Reproducing the build

`frequency.txt` and `lemmas.tsv` are the build output of this repository's pipeline, which owns the
corpus downloads, the two-pass builder, the hand-written irregulars, and a licence gate that refuses
to publish data whose upstream terms nobody has read.

```bash
# The shipped files come from the 2026-07-28 two-pass build (commit 703b101), not from today's
# `make de`, which is a different, Wikidata-based table — see the README.
cd packs/de && npm run generate && npm test && npm run build
```

Direction of truth is one way: **that repo generates, this pack vendors.** Its
`languages/de/out/provenance.json` records the checksums, so a divergence is detectable instead of
silent. `src/index.test.ts` separately asserts that `data.generated.ts` has not drifted from the two
files sitting beside it.

The pack cannot simply live there yet: it imports `@luraty/engine` at runtime, and that package is
private and unpublished, so a public repository could not install it.
ADR-0008 (Luraty app repository) records
the split and what ends the duplication.

Two analysis tools stayed here for the same reason — `analysis/coverage-curve.mjs` and
`analysis/diagnose-gap.mjs` bundle against the engine to measure a built pack.
