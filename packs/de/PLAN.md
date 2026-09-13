# Getting `de` to production

> Status: **STEPS 1–4 BUILT**, 2026-07-28. Only step 5 (native review) is outstanding, and it is
> yours. What follows is the original plan, kept as written, with the outcome of each step recorded
> against it — including the one that came back with an answer nobody wanted.
>
> Original status line: **plan**, 2026-07-28. Nothing here is built. Written because the engine cannot be
> meaningfully tested against an 844-word pack, and every remaining engine question — placement,
> the coverage band, selection — needs a real one to be answerable.

## ⚠️ First: a correction

An earlier note in this repo said **Leipzig is CC BY-NC and therefore unusable in a paid product.**
That appears to be wrong. Leipzig's word lists are published under **CC BY** (3.0 on the word-list
pages, 4.0 on the RDF datasets) — attribution, no non-commercial clause.

That matters because it was being treated as a blocker and it is not one. It should still be
confirmed against the download page's own terms before anything ships; the site is behind
bot-protection and could not be read directly here.

## The sources, and what each one is actually for

Three different problems, three different sources. Conflating them is why "get a frequency list"
sounds like one task and is three.

| need | source | licence | notes |
| --- | --- | --- | --- |
| **frequency list** | [Leipzig Corpora](https://wortschatz-leipzig.de/en/download) | CC BY 3.0/4.0 | 10k–1M German lists, same shape as the Arabic already on disk |
| | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) | CC BY-SA 4.0 | OpenSubtitles-derived — **spoken** register, which is the one that matters here |
| **inflection table** | [MucLex](https://aclanthology.org/2020.lrec-1.572.pdf) | CC BY-SA 3.0 | 100k lemmas, **670k word forms** — this is the answer to the 50k-forms problem |
| | [wiktionary-de-parser](https://pypi.org/project/wiktionary-de-parser/) | code MIT, data CC BY-SA | extracts flexion tables from the German Wiktionary dump |
| | [DWDSmor](https://github.com/zentrum-lexikographie/dwdsmor) | check | SMOR-based analyser, handles compounds |
| **graded text** | [Projekt Gutenberg-DE](https://www.gutenberg.org/ebooks/bookshelf/38) | public domain | classics; too hard raw, fine as a corpus |
| | [Tatoeba](https://tatoeba.org/en/downloads) | CC BY 2.0 FR | **sentence-level, graded by length** — the best fit for drills |
| | [Hagboldt, *Graded German Readers*](https://archive.org/details/gradedgermanread0000pter) | US public domain | literally graded readers, 1930s vocabulary |

**Note the share-alike.** CC BY-SA (FrequencyWords, MucLex, Wiktionary) requires derivatives to
carry the same licence. Whether a `frequency.txt` *derived from* a SA corpus makes the pack file SA
is a real question and a lawyer's, not mine. **Leipzig's plain CC BY has no such clause**, which is
the practical argument for starting there.

**Tatoeba is the sleeper.** It is CC BY 2.0 FR, sentence-level, and already human-written for
learners. It solves content, not vocabulary — but content is the next wall after this one.

## The plan

Five steps. Only step 3 is engine work; the rest is data.

### 1. Frequency list — Leipzig German, top 10,000 ✅ DONE

> **Built.** 10,000 lemmas from `deu_news_2024_300K` + `deu-de_web_2021_300K`, via
> `build/build-frequency.mjs`. It needed TWO passes, which the plan did not anticipate: ranking
> surface forms splits a word's frequency across its own inflections, so `vergangen` and `zweit`
> never make the top 10k while `vergangenen` and `zweiten` do. Pass one ranks surfaces, the lemma
> table is built from it, then pass two re-ranks with every inflection summed onto its lemma.

Same pipeline as the Arabic already on disk. Filter to alphabetic tokens, drop proper nouns by
casing heuristic, keep the rank order. **Ship 10k, not 50k**: ADR-0003 puts ~8,000 word families at
98% written coverage, and past ~20k the only information left is "rare".

Deliverable: `frequency.txt`, ~10k lines. Replaces the 844 hand-written ones.

### 2. Lemma table — from Universal Dependencies ✅ DONE

> **Built, from a different source than planned.** 15,471 rows from the human-annotated UD German
> GSD + HDT treebanks (CC BY-SA 4.0), via `build/build-lemmas.mjs`.
>
> A rule-based version was tried first and thrown away. Guarded by "only emit if both the form and
> the lemma are in the list" — the same trick the affix stripper uses — it still produced
> `warten → waren`, `Ware → war`, `Seite → seit` and `Stärke → stark`. Every one passed the guard,
> because the wrong target really is a common German word. Suffix rules plus a word list is not
> enough for German morphology, and the failures are silent.

670k forms is far more than needed; intersect with the 10k list and keep the forms that actually
occur. Expect ~60–80k rows.

This **replaces** the generated adjective declension in the current pack, which was a stopgap and
is honest only because the vocabulary is small.

Deliverable: `lemmas.tsv`.

### 3. Compound splitting — the one engine change ✅ DONE

> **Built**, as optional `CompoundConfig` on the pack contract rather than a `NormalizeStep` —
> a normalize step is a pure string transform and compound splitting needs the word list.
> `Krankenversicherung`, `Großraumbüro`, `Straßenbahn` and `Bahnhofstraße` all resolve.
> Both predicted edge cases were real: `minPartLength` has to be 4, and the linkers matter.

German's defining problem and the only item here that touches `engine/`. `Bahnhofstraße` is not in
any list and never will be; today it reads as an unknown word, so **coverage understates a German
learner's real comprehension**, which is the exact direction of error the product must not make.

Shape it like the existing affix guard: longest-match cut, accepted **only if every part is in the
frequency list**. That is the same `onlyIfRemainderKnown` idea, and it is what makes it safe without
a morphological analyser. A new `NormalizeStep`, one implementation, available to every language
after that — Dutch and the Nordics have the same problem.

⚠️ Needs a minimum part length (2 chars is too short — `Ur-` and `-ei` will match everything) and a
guard against Fugen-s (`Bahnhof**s**straße`). Both are cheap; both are where it will go wrong.

### 4. Coverage curve ✅ DONE — **and it changed the answer**

> **Measured, and it does not match the literature.** Against held-out corpora:
> 88% at 8,000 lemmas on news, 82% on Wikipedia — against ADR-0003's cited ~98% at 8,000 word
> families. Three reasons, in `README.md`; the largest is that a word FAMILY groups derivations
> while this table groups only inflections, so the two numbers were never comparable.
>
> **The product consequence: the 95–98% band is unreachable on authentic news with a 10k-lemma
> pack.** Content has to be graded for the band to be usable — which moves Tatoeba and the
> public-domain graded readers from "next wall" to "prerequisite".

Take real German text at several levels. Plot known-token coverage against list size at 1k, 3k, 5k,
10k. **Does 8k actually give 98%?** ADR-0003 cites that from the literature; nobody has checked it
for this pack, this tokenizer and this lemma table.

If the curve is flatter than the literature says, the fault is the lemma table or compounds — and
this is the measurement that tells you which. Without it, invariant 1 is calibrated against numbers
from someone else's corpus.

Deliverable: a number in `packs/de/README.md`, and a `check-packs.mjs` lane that fails if it
regresses.

### 5. Native review ⬜ OUTSTANDING — yours

You. The top 500 by rank, plus every lemma row where the surface and the lemma differ by more than
a suffix. That is where an automated extraction puts its garbage, and it is the only part of this
nobody else can do.

## What this unblocks

Not the pack — the **engine**. Every open question needs a real pack to be answerable:

- **Placement** cannot be designed against 844 words. How many questions to place a heritage
  speaker within ±500 words is an empirical question about a real distribution.
- **The coverage band** is currently reachable only because the demo passage is small. Whether real
  text at 10k words lands in the band is step 4.
- **`PROMOTE_AFTER_SUCCESSES` and `DEFAULT_REVIEW_GAP_DAYS`** are both provisional and unswept.
  Sweeping them needs a simulated learner over a realistic pool, which needs a realistic pool.

## What the estimates got wrong

| step | estimated | actual |
| --- | --- | --- |
| 1 · frequency list | a day | right, but it is a TWO-pass pipeline, not one |
| 2 · lemma table | a few days | the rule-based shortcut failed outright; UD replaced it |
| 3 · compounds | a day, edge cases are the day | right — `minPartLength` and linkers were the day |
| 4 · coverage curve | half a day, may invalidate step 1 | it invalidated the INVARIANT, not step 1 |
| 5 · native review | yours | still yours |

The estimate that mattered was step 4's parenthetical. It did not invalidate the list size; it
invalidated the coverage target the engine is calibrated against.
