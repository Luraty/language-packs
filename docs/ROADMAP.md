# Roadmap

Every item traces to a numbered section of `docs/METHODOLOGY.md`, and every source it names is in
`catalog/corpora.json` with a probed download URL and a licence position.

Ordered by value per unit of risk, not by size. The first three need no new corpora and carry no new
licence exposure, which is why they come first.

| | Item | Methodology § | New corpus? | New licence risk? |
| --- | --- | --- | --- | --- |
| **C** | Validation harness | §8 | no | no |
| **A** | Publish counts and Zipf values | §5, §6 | no | no |
| **F** | Bigger Leipzig corpora | §2 | same source, larger | no |
| **B** | Dispersion / contextual diversity | §4 | same source, other files | no |
| **D** | A spoken register | §1 | **yes** | ⚠️ **yes — decision required** |
| **E** | The cleaning pipeline | §7 | no (needs a dictionary) | ⚠️ dictionary terms vary |
| **G** | Arabic | §3, §1 | yes | ⚠️ **blocked, see below** |
| **H** | Word families and coverage | §9 | no | no |

---

## C — Validation harness

**The most valuable missing piece, and for two reasons rather than one.**

The literature's reason: a list nobody correlated against an independent norm is a list nobody has
checked. Correlate against a published norm for the same language, and read the *large rank
discrepancies* — they are almost always names, typos or register artefacts.

This repo's own reason is sharper. `out/provenance.json` warns that a lemmatizer regression is
silent and plausible (`warten→waren`, `Ware→war`, `Seite→seit`, `Stärke→stark` — every one passed
the guard that was supposed to catch it), and concludes that the outputs must be **diffed by hand**
because nothing else will notice. A rank-discrepancy report against an independent norm is precisely
the automated detector that class of bug currently lacks.

**Build:** `builders/validate-frequency.mjs` → Spearman rank correlation against a baseline, plus a
top-50 discrepancy table. `make validate-de`.

**Baselines,** in order of preference:

| Source | Catalogue id | Status |
| --- | --- | --- |
| SUBTLEX-DE | `subtlex` | Gold standard for German. ⚠️ **Download location unresolved** — both known Ghent URLs 404'd on 2026-07-30. Find it first. |
| wordfreq | `wordfreq` | MIT, pip-installable, ships a Zipf scale. The pragmatic default. |
| Worldlex | `worldlex` | Covers German and Arabic, uniform cross-language pipeline. Terms unresolved. |

⚠️ A baseline is only ever a **comparison**, never an input. Correlating against a share-alike list
carries no licence obligation; deriving from one does. Keep that boundary in the code, not just in
your head.

## A — Publish counts and Zipf values

`out/frequency.txt` is bare words, one per line. The counts are computed during the build and
discarded at `writeFileSync`. A ranking answers "which is commoner"; it cannot answer "by how much",
which is what modelling or cross-corpus comparison needs.

**Build:** a sidecar `out/frequency.tsv` — `rank · lemma · count · corpora · zipf` — with Laplace
smoothing (§5) and the Zipf scale (§6).

⚠️ **Keep `frequency.txt` byte-identical.** `@luraty/pack-de` vendors that exact file and
`verify-provenance.mjs` checksums it. Adding a column to the existing file would break the seam
described in the README; adding a new file does not.

The new file needs its own entry in `languages/de/sources.json` under `outputs`, or the gate will
never look at it.

## F — Bigger Leipzig corpora

§2 puts the useful ceiling at 16–30M tokens per register. Two 300K-sentence corpora is roughly
10–12M. Leipzig ships 1M-sentence variants of both, catalogued and size-probed:

```
deu_news_2024_1M.tar.gz         218 MB
deu-de_web_2021_1M.tar.gz       189 MB
deu_mixed-typical_2011_1M.tar.gz 94 MB   ← register-balanced, and pre-2022
```

Change `DE_WORDS` in the Makefile, rebuild, **diff**, `make provenance-update`.

⚠️ Two things to decide while you are there, not after:

1. **`deu_news_2024` trips the AI-contamination warning** (§ AI-contamination). Leipzig ships
   pre-2022 German news. Switching is a real decision with a real cost — 2024 vocabulary is current
   vocabulary — so make it deliberately.
2. **Record the actual token count.** The 10–12M figure above is inferred from sentence counts.
   Nothing in the pipeline measures it, and §2 is a threshold you cannot claim to have crossed
   without a number.

## B — Dispersion / contextual diversity

§4. `build-frequency.mjs` tracks a `corpora` set per word but spends it on a boolean typo filter
(`corpora.size > 1 || total >= 20`) — with two inputs its maximum value is 2. That is not contextual
diversity.

Real document-level range comes from Leipzig's `*-sentences.txt`, not the `*-words.txt` the pipeline
currently reads: count how many *sentences* contain each word, then compute Gries's *DP*. Ship
`count` + `range` alongside each other, as TUBELEX does with `count`/`videos`/`channels`.

**Build:** `builders/build-dispersion.mjs`, feeding the item-A sidecar.

⚠️ While in there, fix the undocumented degradation: with a **single** input file the existing filter
silently becomes `total >= 20`, because `corpora.size` can never exceed 1. The first one-corpus
language gets a different filter and no warning.

## D — A spoken register ⚠️ needs a decision, not just code

§1, and the largest quality gap in the repo. German is built entirely from writing; Luraty is for
someone reactivating a language they **heard**. `make check` warns about this on every run.

`make candidates L=de` ranks the options. The realistic one:

**`frequencywords`** — `de_50k.txt`, 650 KB, already counted from OpenSubtitles, no corpus
processing at all.

⚠️ **And its licence is genuinely unsettled.** The repository's own `LICENSE` file was fetched on
2026-07-30 and is plain MIT — but that is the standard GitHub repo licence and most plausibly covers
the generator code, not the derived counts, which secondary sources describe as CC BY-SA 4.0. The
catalogue records `licence: null` for exactly this reason: writing down a guess is the failure this
whole apparatus exists to prevent.

Three ways forward, and the choice is yours to make:

1. **Separate artefact.** `out/frequency-spoken.tsv`, licensed to match whatever the terms turn out
   to be, published as its own Hugging Face dataset. Keeps the main list permissive, gives users the
   better-register list beside it, and the gate already understands per-output licences. **Recommended.**
2. **Relicense the German list** to CC BY-SA and merge the registers. Simplest pipeline, and ⚠️ note
   it does **not** threaten Luraty's commercial use — BY-SA permits that. The cost is borne by
   downstream users, who inherit share-alike, which is what the README argues against at length.
3. **Stay written**, and use Leipzig's `deu_mixed-typical_2011` for balance rather than for speech.
   Honest, cheap, and does not actually close §1.

Whichever you pick: settle the FrequencyWords terms first and record them in `catalog/corpora.json`.
The gate will reject a source whose catalogue entry still says `null` but which claims verification.

## E — The cleaning pipeline

§7, using the Worldlex template. Present today: lowercasing (deliberate, documented), a tokenize
regex, and a count threshold. Missing:

- NFKC normalization before lowercasing
- Hunspell filtering — catalogue id `hunspell-dictionaries`. ⚠️ Per-dictionary licences vary and
  some are GPL. Using one as a *build-time filter* and shipping only the resulting word list is a
  different question from redistributing the dictionary — but it is still a question.
- Language ID per document
- **Proper-noun flagging.** Nearly free: the UD treebanks already carry `UPOS`, and
  `build-lemmas.mjs` already parses those files. §7 says decide about names explicitly; right now
  there is no decision, only a default.
- **`out/ignored.txt`, with counts preserved.** Today discarded words vanish silently. A filter you
  cannot inspect is a filter you can only trust — and this repo's whole argument is that trust is
  the thing that fails.

## G — Arabic ⚠️ blocked on a licence, not on code

Two questions were open. One is now answered; the other got worse.

**Answered — how to split MSA from dialect.** The register axis *is* the split. News and Wikipedia
(`register: news` / `encyclopedic`) are MSA; subtitles (`register: subtitles`) are heavily dialectal,
because dubbing and subtitling are done in Egyptian and Levantine rather than MSA. So the register
mix the methodology recommends for *any* language happens to be the same axis that separates the two
Arabics here. Build both from one pipeline, tag them, never sum them. Recorded in
`languages/ar/sources.json` under `registerDecision`.

**Worse — lemmatization.** §3 makes it mandatory for Arabic rather than merely advisable: a
surface-form Arabic list fragments across clitics *and* inflections and is close to meaningless. But
the licences read on 2026-07-30 say:

| Treebank | Licence | Verdict |
| --- | --- | --- |
| `UD_Arabic-PADT` | **CC BY-NC-SA 3.0** | Largest and most obvious, and **out permanently**. NC binds the licensee, so publishing a derived list open source does not buy commercial rights to it — see `languages/de/SOURCES.md`. The gate rejects it from both directions. |
| `UD_Arabic-PUD` | CC BY-SA 3.0 | Clean, but ~1,000 sentences. Nowhere near enough alone. |
| `UD_Arabic-NYUAD` | CC BY-SA 4.0 | Licence file is clean; the treebank ships **without word forms**. Reconstruction needs the Penn Arabic Treebank from the LDC, which is paid. |

**There is no free, commercially usable, large Arabic lemma source among the obvious three.** And
since these lists are used commercially in Luraty, "commercially usable" is a requirement, not a
preference — an NC-derived Arabic list could be published but never shipped in the app. The
most likely route around it is a morphological *analyser* rather than a treebank — catalogue id
`camel-tools`, MIT. ⚠️ Check its **databases'** licences separately from the toolkit's; the databases
are what actually lemmatize, and some carry their own restrictions.

Settle that before writing any Arabic pipeline code. Writing the counter first means discovering
this after the work.

## H — Word families and coverage targets

§9. `provenance.json` records 88% coverage at 10,000 lemmas and correctly warns that the
literature's ~98%-at-8,000 is for word *families* on other corpora with other tokenizers, and is not
comparable. Grouping into Bauer–Nation families would make it comparable, and would let the list be
built to a coverage target rather than a round number of rows.

⚠️ Partly blocked by the repo split: `coverage-curve.mjs` and `diagnose-gap.mjs` live in lughaty
because they bundle against the private engine. Measuring here needs either a local measurement path
or the engine going public.

⚠️ Also worth fixing while measuring: the current coverage figures are measured on the same
*registers* the list was built from, which flatters them. Held-out news against a news-built list is
the easy case.
