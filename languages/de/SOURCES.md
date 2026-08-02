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

⚠️ **Three honest caveats, and the first one has already cost this project real time.**

1. An earlier note claimed Leipzig was CC BY-**NC** and therefore unusable in a paid product. That
   was wrong, and it was treated as a blocker.
2. **The downloaded archives contain no licence file.** The CC BY claim comes from the project's
   published pages. The corpus metadata that ships in the archive (`*-meta.txt`) states only build
   date and token counts.
3. **The version is unsettled.** `sources.json` records `CC-BY-3.0` on the basis that Leipzig
   publishes its word lists under 3.0, but its RDF datasets are 4.0 and secondary summaries cite
   4.0 for the downloadable corpora. Settle the version in the same reading as the terms.

Caveat 2 is why `licenceVerified` is `false` in `sources.json` and why **publishing is currently
blocked**.

⚠️ **Four routes were tried on 2026-07-30 and all four failed.** `/en/usage` answers with an
anti-bot interstitial reading *"Making sure you're not a bot!"*; `/en/download/` carries no licence
text; neither `repo.data.saw-leipzig.de` nor the CLARIN VLO surfaced anything machine-readable. The
terms remain genuinely unread, and that is why the boolean is still `false`.

Closing it is a five-minute job for a human with a browser: read the terms, then set
`licenceVerified: true` and `verifiedOn`. A cheaper first probe, if you want to know whether the
archives ship a licence file at all: `deu_news_2024_10K.tar.gz` is 2 MB rather than 218 MB.

## `out/lemmas.tsv` — Universal Dependencies German treebanks

Built from the human-annotated `FORM` → `LEMMA` columns of:

- **UD German-GSD** — CC BY-SA 4.0
- **UD German-HDT** — annotation CC BY-SA 4.0 (the underlying *text* is academic-use only; only the
  annotation columns are used here, and no source text is redistributed)

> Universal Dependencies. <https://universaldependencies.org/>

✅ **Both were verified on 2026-07-30** by fetching each treebank's own `LICENSE.txt`. GSD's reads,
in full: *"The treebank is licensed under the Creative Commons License Attribution-ShareAlike 4.0
International."* HDT's adds the constraint: *"The annotation of the treebank is licensed under the
Creative Commons License Attribution-ShareAlike 4.0 International. The text can be distributed for
academic use."* Both are stamped `licenceVerified: true` in `sources.json` with the verbatim text in
their notes.

⚠️ **Do not add `UD_German-LIT`.** It is the obvious next German treebank and it is
**CC BY-NC-SA 4.0** — non-commercial. Adopting it would quietly make `lemmas.tsv` NC. Read
2026-07-30, catalogued in `catalog/corpora.json` so it gets rejected on evidence rather than tried
and reverted. The licence gate now has a non-commercial arm for exactly this.

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
that watches the check fire — alongside tests for the non-commercial arm, the no-derivatives arm,
and a typo'd licence id, which the original dash-splitting check read as permissive.

## The licensing position, stated once — founder decision, 2026-07-30

**The lists are open source and free for everyone. They also ship inside Luraty, which has paid
features.** Both halves are true at once, and which upstream terms are survivable follows from the
*second* half, not the first.

| Upstream term | Can Luraty ship it? | Why |
| --- | --- | --- |
| CC BY | ✅ yes | attribution only |
| **CC BY-SA** | ✅ **yes** | ⚠️ share-alike is **not** a commercial restriction. It governs how the data *file* is licensed onward, not whether it may earn money — paid features and all |
| **CC BY-NC** | ❌ **never** | see below |
| CC BY-ND | ❌ never | a frequency count is an adaptation |

### ⚠️ Why non-commercial cannot be worked around

Two tempting arguments. Both fail, and they fail for different reasons.

> *"I publish the list open source, so I am free to use my own list commercially."*

**NC binds the licensee.** On a list derived from an NC corpus you are the licensee, not the
licensor. Building the derivative grants no right the upstream never gave, and publishing it openly
lifts nothing — the restriction was never yours to lift. Dual-licensing works only for work you
wholly own: `builders/` (MIT) and `irregulars.tsv` (MIT). It does not reach anything derived from
someone else's corpus.

> *"The frequency list is free inside the app. Only other features are paid."*

**NC restricts the use, not the price tag on one component.** The test in the licence is whether the
use is *directed toward commercial advantage* — not whether that particular file is the thing being
sold. NC data underpinning a revenue-generating product is the case NC exists to prevent, and a
freemium app is the textbook example rather than an edge case.

⚠️ **Germany reads it harder still.** *OLG Köln, 2014 (Deutschlandradio)* held CC BY-NC to mean
strictly **private** use — excluding even a public broadcaster with no commercial motive. That is the
strictest mainstream reading of the term, and it is the jurisdiction a German-language pack is most
likely to be argued in.

⚠️ **This is a judgement, not a legal finding, and nobody here is a lawyer.** It is the cautious
reading, taken because a *published* dataset cannot be recalled — the same reasoning that makes the
gate exist at all. The cost of being cautious is currently near zero: the two NC treebanks are not
the only thing blocking their languages. If a qualified opinion ever says otherwise, the lever is the
`nonCommercial` flag in `builders/licences.mjs`, and the tests that watch it.

So `UD_Arabic-PADT` (CC BY-NC-SA 3.0) and `UD_German-LIT` (CC BY-NC-SA 4.0) are **out**, not
"blocked for the permissive list". `check-sources.mjs` enforces this from both directions: an NC
source cannot feed a non-NC output, and no output may be NC at all. There is a test for each.

### ⚠️ And you cannot publish everything under NC either

A blanket "open source, non-commercial" policy is not available to this repo. `lemmas.tsv` derives
from CC BY-SA 4.0 treebanks, and **CC BY-SA forbids adding restrictions** — including NC — to a
derivative. It must stay BY-SA. The output licences are decided by the upstreams, one artefact at a
time; that is why they live in `sources.json` per output rather than as one project-wide statement.

## Share-alike is NOT a problem — founder decision, 2026-07-28

**The language packs are open source.** CC BY-SA on `lemmas.tsv` is therefore fine, and the question
this spent two revisions worrying about is closed. Ship the attribution, keep the licence, move on.

⚠️ Reconfirmed 2026-07-30 against the commercial use above, because it is the obvious thing to doubt:
CC BY-SA still holds. Share-alike is not a commercial restriction. It obliges the *data file* to stay
BY-SA, and says nothing about revenue.

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

⚠️ **What this list is not.** It is built from news and web text, so it describes written German.
See `docs/METHODOLOGY.md` §1 for why that matters more than corpus size does, and `docs/ROADMAP.md`
item D for what closing it would cost. `make check` warns about it on every run.

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
