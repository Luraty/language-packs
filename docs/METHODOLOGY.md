# How frequency lists are actually built

What the research literature says a frequency list needs, and — for each point — what this repo
does today. The gap between those two columns is `docs/ROADMAP.md`.

This exists because a frequency list is easy to build badly and the failure is invisible: a list
built from the wrong register, counted the wrong way, or cleaned with a regex still *looks* like a
frequency list. It ranks words. It has ten thousand rows. Nothing about reading it tells you it is
wrong. The checks below are how the field decided which lists to believe.

Distilled from Brysbaert & New (2009) and its successors — full citations at the bottom.

---

## 1. Register matters more than raw size

Frequencies from **TV and film subtitles predict human word recognition better than frequencies from
books** — gains of 4–15% of explained variance in lexical-decision reaction times, replicated across
French, English, Dutch and Chinese. Written corpora systematically miss common spoken words.

Paul Nation built the BNC/COCA lists on the same principle: the top 2,000 word families come from a
10M-word corpus deliberately weighted toward *spoken* material, not from the largest available
written corpus.

> **Here:** ⚠️ **The open gap.** German is built from Leipzig news (2024) and Leipzig web (2021).
> Both are writing. Luraty exists for someone reactivating a language they **heard** at home, so
> this is not a minor imbalance — it is the wrong register for the audience.
>
> `make check` now says so on every run, and `make candidates L=de` lists what would close it. The
> reason it is still open is not oversight: every obvious spoken source is share-alike or has
> unresolved terms, so closing it costs a licence decision. See **ROADMAP item D**.
>
> ⚠️ Note share-alike alone does **not** block that decision — CC BY-SA permits the commercial use
> Luraty makes of these lists. What it costs is borne downstream, by users who inherit the
> obligation. Non-commercial would block it outright.

## 2. Corpus size: enough is enough

Frequency estimates improve with corpus size up to roughly **16–30 million tokens per register**, and
barely afterwards. Low-frequency tail words are the exception — they keep benefiting.

So for a major language you do not need billions of tokens. You need ~20–30M tokens of the *right*
register, which is a very different shopping list.

> **Here:** two Leipzig 300K-sentence corpora, so roughly 10–12M tokens total — under the threshold,
> and split across two registers rather than concentrated in one. Leipzig ships 1M-sentence variants
> of both at ~200 MB each (catalogued, sizes probed). That is the cheapest real improvement
> available and it is blocked on nothing. **ROADMAP item F**.
>
> ⚠️ The token count is an estimate from sentence counts. Nothing in the pipeline currently records
> the actual figure, which is its own gap — you cannot report a threshold you never measured.

## 3. Word form vs. lemma — decide per language

In English, word-form frequencies performed as well as lemma frequencies, so plain forms suffice.
In morphologically rich languages they do not: raw forms fragment a word's count across its
inflections. TUBELEX publishes both variants rather than choosing for you.

> **Here:** decided correctly for German, and it is the thing the build is most careful about.
> `make de` runs two passes because one pass ranks surface forms and splits every word's frequency
> across its inflections — `vergangen`, `eigen` and `zweit` fall out of the top 10,000 while their
> inflected forms stay in.
>
> ⚠️ For Arabic this is not an optimisation, it is a precondition. Arabic fragments across clitics
> as well as inflections, so a surface-form Arabic list is close to meaningless — and the obvious
> lemma source is non-commercial. See `languages/ar/sources.json`, `lemmatizerBlocker`.

## 4. Use contextual diversity, not just raw count

Raw frequency conflates "used a lot everywhere" with "used obsessively in one place". A character
name in one long film outranks a common verb. The field's answer:

- **Contextual diversity (CD) / document frequency** — in how many *documents* (films, videos,
  channels) does the word appear? Brysbaert & New found CD outperforms raw frequency.
- **Dispersion measures** for finer control — range, Juilland's *D*, Gries's *DP*, Carroll's *D₂*,
  Average Reduced Frequency. Recent work validated dispersion as a predictor of lexical decision
  time, familiarity and complexity across five languages.

TUBELEX's practical shape is worth copying directly: publish `count`, `videos`, `channels`.

> **Here:** ⚠️ present in vestigial form only. `build-frequency.mjs` tracks a `corpora` set per word,
> but uses it as a **boolean typo filter** (`corpora.size > 1 || total >= 20`), not as a dispersion
> measure — and with two input files the maximum possible value is 2. That is not contextual
> diversity, it is a two-bit spam check wearing its name.
>
> Real document-level range would come from Leipzig's `*-sentences.txt` rather than its `*-words.txt`.
> **ROADMAP item B**.
>
> ⚠️ Second-order consequence, currently undocumented in the builder: with a **single** input file
> the filter degenerates to `total >= 20`, because `corpora.size` can never exceed 1. Anyone adding
> a one-corpus language gets a materially different filter without being told.

## 5. Handle zero frequencies with Laplace smoothing

For words absent from the corpus, the evidence-based choice is **Laplace smoothing**: add 1 to every
count and add the number of word *types* to the total token count.

    f(w) = (count + 1) / (tokens + types)

Brysbaert & Diependaele (2013) tested the common heuristics against lexical-decision data and
recommended exactly this. TUBELEX implements it.

> **Here:** not applicable yet, because no frequency *value* is published at all — only a ranking.
> It becomes relevant the moment ROADMAP item A ships counts.

## 6. Report frequencies on a log scale

Raw counts are Zipf-distributed, i.e. extremely skewed. Use log frequency, or the **Zipf scale**
(log₁₀ of frequency per billion words) on a human-friendly 0–8 range. Every validation study does.

> **Here:** ⚠️ `out/frequency.txt` is **bare words, one per line**. The counts exist in memory during
> the build and are thrown away at write time (`build-frequency.mjs`, the final `writeFileSync`).
>
> A ranking answers "which is commoner"; it cannot answer "by how much", which is what any modelling
> or cross-corpus comparison needs. Rank 500 and rank 5,000 differ by more than an order of
> magnitude and the file cannot say so. **ROADMAP item A** — and it is nearly free, since the data is
> already computed.

## 7. Clean ruthlessly — this is where amateur lists fail

The Worldlex pipeline is the published template:

- Unicode normalization (NFKC) and an explicit case policy
- **Spell-checker filtering** (Hunspell/Aspell) to remove typos and foreign-language contamination —
  the paper calls this "important"
- **Language detection** per document (FrequencyWords added this after contaminated files were
  reported)
- Document deduplication
- Proper tokenization per script — word segmentation for Chinese and Japanese, where spaces do not
  delimit words
- **Decide about names and proper nouns explicitly.** They inflate subtitle counts badly. Flag or
  filter, but decide.

> **Here:** partial, and honest about it. Lowercasing is deliberate and well documented (it has to
> match the pack's `normalize`). A tokenize-pattern regex drops non-German characters. A
> `corpora > 1 || total >= 20` heuristic removes the OCR and typo tail.
>
> ⚠️ Missing: NFKC normalization, spell-check filtering, language ID, and any decision at all about
> proper nouns — even though the UD treebanks already carry the `UPOS` column that would flag them,
> and `build-lemmas.mjs` already parses those files.
>
> ⚠️ Also missing: the discarded words are **discarded silently**. FrequencyWords keeps an
> "ignored words" file with counts preserved, which is what makes a filter correctable rather than
> merely trusted. **ROADMAP item E**.

## 8. Validate against human data

The field's quality test is correlation with behavioural data: lexical-decision reaction times
(English/British/French/Dutch Lexicon Projects), word-familiarity ratings, lexical-complexity
annotations.

The lightweight version, available to anyone: **correlate your list against an existing published
norm for the same language.** High correlation on shared vocabulary is a sanity check; the value is
in the *large rank discrepancies*, which are almost always names, typos or register artefacts.

> **Here:** ⚠️ **nothing.** No correlation against SUBTLEX-DE, Worldlex or wordfreq has ever been
> run, and no target exists to run one.
>
> This is the most valuable missing piece, and not only for the reason the literature gives.
> `provenance.json` warns that a lemmatizer regression is *silent and plausible* — `warten→waren`,
> `Ware→war`, `Seite→seit` — and that the outputs must be diffed by hand because nothing else will
> catch it. A rank-discrepancy report against an independent norm is exactly the automated detector
> that class of bug currently lacks. **ROADMAP item C**.

## 9. For learners, think in coverage and word families

Learner-oriented lists are built to **coverage targets**: ~3,000 word families give ~95% coverage of
film and TV, ~6,000–7,000 give ~98%. Group inflections and derivatives into **word families**
(Bauer–Nation levels) rather than bare forms, and complete semantic sets — days, months, numbers —
even where a member falls below the rank cutoff.

> **Here:** measured and correctly caveated. `provenance.json` records 88% coverage of held-out news
> and 82% of Wikipedia at 10,000 lemmas, with an explicit warning that the literature's ~98%-at-8,000
> is for word *families* on other corpora with other tokenizers and is **not comparable**.
>
> ⚠️ That non-comparability is itself the gap: families would make the numbers comparable. Note the
> coverage figures are also measured on the same *registers* the list was built from, which flatters
> them. **ROADMAP item H**.

---

## The AI-contamination problem, which post-dates most of the above

`wordfreq` stopped shipping updates in 2024 — by decision, not neglect. Its author's position:
generative-AI text has polluted web-crawl sources, and *"I don't think anyone has reliable
information about post-2021 language usage by humans."*

Two consequences for any list built now:

1. **Prefer older snapshots for crawled registers.** CC-100's frozen January–December 2018 Common
   Crawl is an *advantage*, not staleness. So is Leipzig's `deu_mixed-typical_2011`.
2. **Record the collection year, and treat it as a property of the data.** A 2024 news corpus is
   still usable; it is simply not a clean observation of how humans write.

> **Here:** now enforced as a warning. Every source carries `snapshotYear` and `register`, and
> `check-sources.mjs` warns when a crawled register was collected after 2021.
>
> ⚠️ **It currently fires on `deu_news_2024_300K`** — the larger of the two German inputs. Leipzig
> ships pre-2022 German news; whether to switch is a real decision, not a formality.

---

## Citations

- Brysbaert, M., & New, B. (2009). *Moving beyond Kučera and Francis: A critical evaluation of
  current word frequency norms.* Behavior Research Methods, 41, 977–990.
- Brysbaert, M., & Diependaele, K. (2013). *Dealing with zero word frequencies.* Behavior Research
  Methods.
- van Heuven, W. J. B., et al. (2014). *SUBTLEX-UK: A new and improved word frequency database for
  British English.* Quarterly Journal of Experimental Psychology.
- Gimenes, M., & New, B. (2016). *Worldlex: Twitter and blog word frequencies for 66 languages.*
  Behavior Research Methods, 48, 963–972.
- Nohejl, A., et al. (2025). *Beyond Film Subtitles: Is YouTube the Best Approximation of Spoken
  Vocabulary?* COLING 2025.
- Nohejl, A., et al. (2025). *Dispersion Measures as Predictors of Lexical Decision Time, Word
  Familiarity, and Lexical Complexity.*
- Gries, S. Th. (2020). *Analyzing dispersion.* In *A Practical Handbook of Corpus Linguistics.*
- Nation, I. S. P. (2016). *Making and Using Word Lists for Language Learning and Testing.*
  John Benjamins.
