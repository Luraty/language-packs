# German pack (`de`)

A real language pack — **data, not code**. Nothing in `engine/` knows German exists.

```
pack.config.json   which named engine steps to apply
frequency.txt      10,000 LEMMAS, one per line, frequency-ordered — position IS the rank
lemmas.tsv         15,471 inflected form → lemma rows, tab-separated
sample.txt         real German prose, used by the conformance check and the demo
build/             the pipeline that produced all of it, and can again
```

Licensing and provenance: **[ATTRIBUTION.md](ATTRIBUTION.md)** — read it before shipping.
`frequency.txt` is CC BY (Leipzig); `lemmas.tsv` is **CC BY-SA** (Universal Dependencies), which is
share-alike.

Verify it, and watch it run:

```bash
node scripts/check-packs.mjs
cd engine && npm run demo -- de --pack ../packs/de compare
```

## What it does

Against `sample.txt`: **128 of 129 running tokens** resolve. The one miss is `regnet`.

- **10,000 lemmas, not surface forms.** Built in two passes: rank the surfaces, build the lemma
  table, then re-rank with every inflection's count summed onto its lemma. That is what "how common
  is this word" means, and pass one alone gets it wrong — 750 entries had an unrankable lemma
  because a word's frequency was split across its own inflections.
- **Lemmas come from human annotation**, not from suffix rules. `deutsche → deutsch`,
  `musste → müssen`, `häuser → haus`, `aufgebaut → aufbauen`.
- **Compounds decompose.** `Krankenversicherung`, `Großraumbüro`, `Straßenbahn`, `Bahnhofstraße`
  all resolve to their head. A split is accepted only if every part is a word the list contains.
- **Umlauts fold to two letters** (`ö→oe`), so `schön`/`schon` and `zählen`/`zahlen` stay apart.

## ⚠️ The measurement that matters, and it is not what the literature says

`build/coverage-curve.mjs` measures known-token coverage against **held-out** text — corpora the
frequency list was not built from:

| known lemmas | held-out news | held-out Wikipedia |
| ---: | ---: | ---: |
| 1,000 | 71% | 65% |
| 3,000 | 82% | 75% |
| 5,000 | 85% | 79% |
| 8,000 | 88% | 82% |
| **10,000** | **90%** | **84%** |

**ADR-0003 anchors invariant 1 on "~8,000 word families ≈ 98% written coverage." This pack reaches
88% at 8,000 — nowhere near it.** Three reasons, in order of size:

1. **A word family is not a lemma.** A family groups derivations (`Nation`, `national`,
   `Nationalität`); this table groups only inflections. 8,000 families cover far more surface
   vocabulary than 8,000 lemmas, so the two numbers were never comparable.
2. **The tail is proper nouns.** Of 4,389 unknown types in the news sample, **4,130 occur exactly
   once** — names, places, foreign words. No list of any size fixes that.
3. **Authentic news and Wikipedia are not learner text.** The literature's figures come from
   general prose, not from the hardest registers a corpus offers.

**The product consequence is concrete: the 95–98% band is unreachable on authentic news with a
10k-lemma pack.** Content has to be graded or simplified for the band to be usable at all — which
is exactly why Tatoeba and public-domain graded readers are in [PLAN.md](PLAN.md). This is the
measurement the plan said not to skip, and it changed the answer.

⚠️ **Read that sentence narrowly (added 2026-08-01,
ADR-0011 (Luraty app repository)).** "Unreachable" is a statement
about *this pack against authentic news*, and it is still true. It is NOT the more general claim it
was starting to be quoted as. The band is a **library-selection rule for extensive, unassisted
reading** — which of many texts can she get through on her own. It does not grade a fixed text
studied intensively with glosses on tap, and a corpus that fails it has not necessarily been shown
to be too hard. See ADR-0003's 2026-08-01 amendment for the three other things the band does not
say.

## What it still does not do

**1. Separable verbs.** `aufstehen` → `steht … auf` is one word split across a clause. The pack sees
two tokens and cannot rejoin them. UD annotates the particle with the full verb's lemma, which is
right in context and wrong as a global mapping, so those rows are filtered out.

**2. Capitalisation is discarded.** `normalize` starts with `lowercase`, so German's noun-capital
signal is gone and `Stärke` (strength) and `stärke` (I strengthen) are one form. Keeping case would
break every sentence-initial word instead. The lemma vote resolves most of it by majority.

**3. Derivational morphology.** See reason 1 above — this is the biggest single lever on the
coverage curve, and it is not a data-volume problem but a different kind of table.

**4. No native review yet.** Nobody who speaks German has read the top 500 or the lemma rows where
the form and lemma differ by more than a suffix. That is step 5 of the plan and it is unskippable.

## Where the missing 10% actually goes

`build/diagnose-gap.mjs` categorises every unknown token by **cause**, using the original
capitalisation before `normalize` throws it away:

| | held-out news | held-out Wikipedia |
| --- | ---: | ---: |
| capitalised mid-sentence (name or one-off noun) | **66%** of the gap | **68%** |
| unanalysed German word (lemma table gap) | 28% | 25% |
| acronym | 3% | 3% |
| single letter / initial | 3% | 5% |
| **lemma known, just outside the top 10k** | **0.1%** | **0.1%** |

**Growing the list past 10,000 buys essentially nothing — 0.1% of the gap.** That was not the
expected answer and it retires "ship a bigger list" as a strategy. The two levers are:

1. **Proper nouns (66%).** 2,860 of 2,988 unknown types in the news sample occur **exactly once**:
   `Toyota`, `Senegal`, `Carter`, `Aiwanger`. No list of any size covers them.
2. **The lemma table (28%).** `eintraf`, `ankam`, `zurückkam`, `mitverantwortlich`,
   `nachempfunden` — separable-verb pasts and derived adjectives. Fixable, and the single biggest
   thing that would move the curve.

### ⚠️ Excluding names moves EVERY register into the band

A learner is not blocked by `Toyota`. `CoverageQuery.ignore` now lets a caller mark surfaces as
not-vocabulary, and they leave the denominator the same way `unkeyableTokens` already does
(ADR-0004, amended). Measured through the engine at 10,000 lemmas:

| list | register | all tokens | names excluded |
| --- | --- | ---: | ---: |
| Leipzig | spoken | 92.9% too-hard | **96.6% in-band** |
| Leipzig | news | 89.6% too-hard | **96.7% in-band** |
| Leipzig | Wikipedia | 83.9% too-hard | **95.1% in-band** |
| ours | spoken | 96.0% in-band | 98.1% *too-easy* |
| ours | news | 89.3% too-hard | **96.8% in-band** |
| ours | Wikipedia | 84.1% too-hard | **95.3% in-band** |

**Every row lands in the band.** And the curve now tracks the literature closely: 95.5% at 8,000
lemmas against ADR-0003's cited ~98% at 8,000 word families — the remaining gap is the
family-vs-lemma difference, which is exactly what it should be.

**This makes the earlier "content must be graded" conclusion too pessimistic**, and that is recorded
in ADR-0003's amendment rather than quietly dropped. It was true of a denominator that counted names.

⚠️ The measurement uses a crude host-side heuristic (`--ignore-names`) that over-counts by design:
capitalised, not sentence-initial, not in the pack. A real NER pass would land somewhat lower. The
engine deliberately has no such rule — German capitalises every noun, so a pack-level version would
credit a learner for not knowing `Rezession`, and Arabic has no case at all.

## For scale: how big is a native speaker's vocabulary?

| | lemmas |
| --- | ---: |
| adult native German, all lemmas | ~73,000 |
| …of which monomorphemic | **~33,000** |
| adult native American English, age 20 | ~42,000 |

From [Brysbaert et al. 2016](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.01116/full),
reporting Segbers & Schroeder for German.

**The number that matters here is ~33,000, not 73,000.** German's higher total is largely its
single-word compounds — and this pack *decomposes* compounds, so the comparable figure is the
monomorphemic one.

So **10,000 lemmas is roughly 30% of a native's decomposed vocabulary, and it covers 95–97% of
running text.** That is Zipf, and it is the whole reason a frequency-ordered list is worth building:
the last 23,000 words a native knows buy the final few percent.

## Would our own frequency list be better than Leipzig's?

Yes — for this product's learner, measurably. `builders/count-text.mjs` in
[luraty-language-packs](https://github.com/Luraty/language-packs) builds a list from raw text, so
sources can be mixed and weighted. A blend of **Tatoeba ×4** (conversational, CC BY 2.0 FR), Leipzig
news + web ×1, and five public-domain Gutenberg books ×2, held out and compared at 10,000 lemmas:

| held-out register | Leipzig-built | ours (blended) |
| --- | ---: | ---: |
| **spoken (Tatoeba)** | 92.9% | **96.0% — in band** |
| news | 89.6% | 89.3% |
| Wikipedia | 83.9% | **84.1%** |

The two lists share 7,080 of 10,000 words. What ours has that the news list does not, in the top
1,200: `sag`, `hör`, `geh`, `nimm`, `kennst`, `hättest`, `würdest`, `könntest`, `tust`, `hasse`,
`wach`, `tasse`, `wörterbuch` — **imperatives, subjunctives and second-person forms**. News almost
never addresses anyone as *du*, and a heritage speaker's whole world is *du*.

**This is the first time any list has landed in the 95–98% band on real held-out text.** Register
turns out to matter more than corpus size.

⚠️ Tatoeba has an artefact worth filtering: `Tom` and `Mary` are its default example names and rank
absurdly high, along with `tatoeba` and `esperanto`. Currently unfiltered.
