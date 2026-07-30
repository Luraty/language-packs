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

**Licence: CC BY** (the project publishes its word lists as CC BY 3.0, and its RDF datasets as
CC BY 4.0). Attribution required; **no non-commercial restriction**.

⚠️ **Two honest caveats, and the first one has already cost this project real time.**

1. An earlier note claimed Leipzig was CC BY-**NC** and therefore unusable in a paid product. That
   was wrong, and it was treated as a blocker.
2. **The downloaded archives contain no licence file.** The CC BY claim comes from the project's
   published pages, which are behind bot-protection and could not be read directly. The corpus
   metadata that ships in the archive (`*-meta.txt`) states only build date and token counts.

Caveat 2 is why `licenceVerified` is `false` in `sources.json` and why **publishing is currently
blocked**. Closing it is a five-minute job for a human with a browser: read the terms, then set
`licenceVerified: true` and `verifiedOn`.

## `out/lemmas.tsv` — Universal Dependencies German treebanks

Built from the human-annotated `FORM` → `LEMMA` columns of:

- **UD German-GSD** — CC BY-SA 4.0
- **UD German-HDT** — annotation CC BY-SA 4.0 (the underlying *text* is academic-use only; only the
  annotation columns are used here, and no source text is redistributed)

> Universal Dependencies. <https://universaldependencies.org/>

**Licence: CC BY-SA 4.0.** ⚠️ **Share-alike.** A file derived from a BY-SA source is normally
required to carry BY-SA itself, so `lemmas.tsv` is treated as CC BY-SA 4.0 and distributed with this
notice.

Share-alike attaches to *this data file*, not to an application that reads it — but that boundary is
a legal question, not an engineering one, and it should be checked by someone qualified before the
pack ships commercially.

### ⚠️ Why the two files are never published together

Hugging Face carries **one licence field per dataset**. Bundle the BY-SA lemma table into the CC BY
frequency list and the combined work is share-alike: every downstream user of the frequency list
inherits the obligation, and a frequency list nobody can use permissively is not the public good
this repo exists to produce.

`builders/check-sources.mjs` enforces this. It is not left to anyone's memory, and there is a test
that watches the check fire.

## Share-alike is NOT a problem — founder decision, 2026-07-28

**The language packs are open source.** CC BY-SA on `lemmas.tsv` is therefore fine, and the question
this spent two revisions worrying about is closed. Ship the attribution, keep the licence, move on.

The note below is kept only for the case where a future pack must ship closed.

### If the share-alike ever does become a problem

`lemmas.tsv` is the only BY-SA artefact. Replacements exist and the pipeline does not care which one
produced the file:

- Extract inflections from **German Wiktionary** (also CC BY-SA — same problem).
- Buy or license a commercial morphology (DWDS, Canoo, or a vendor lexicon).
- Hand-write it. `irregulars.tsv` shows the shape; 15,000 rows is a lot of typing but it is the only
  route that carries no upstream licence at all.

## What is NOT derived from anything

- `irregulars.tsv` — hand-written for this project.
- Everything under `builders/` — original, MIT.

## Reproducing the build

```bash
make corpora-de     # Leipzig archives + the two UD treebanks, into data/
make de             # four commands, two passes
make verify         # did the output match what is recorded?
```

`make de` is the recipe below, and it runs the pair **twice** on purpose — pass one has no lemma
table to rank against, so its output is only good enough to build one from.

```bash
node builders/build-frequency.mjs <words.txt>... --out languages/de/out/frequency.txt --limit 10000
node builders/build-lemmas.mjs languages/de/out/frequency.txt <treebank.conllu>... \
  --irregulars languages/de/irregulars.tsv --out languages/de/out/lemmas.tsv
node builders/build-frequency.mjs <words.txt>... --lemmas languages/de/out/lemmas.tsv \
  --out languages/de/out/frequency.txt --limit 10000
node builders/build-lemmas.mjs languages/de/out/frequency.txt <treebank.conllu>... \
  --irregulars languages/de/irregulars.tsv --out languages/de/out/lemmas.tsv
```

⚠️ **Diff the output before recording it.** A lemmatizer regression is silent and plausible — the
rule-based version this replaced produced `warten→waren`, `Ware→war`, `Seite→seit` and `Stärke→stark`,
and every one passed its guard because the wrong target really is a common German word.
