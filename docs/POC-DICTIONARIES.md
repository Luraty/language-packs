# Proof of concept: open dictionaries as a meaning layer

**2026-09-11. Throwaway experiment, not a design.** Licences deliberately ignored on the founder's
instruction — nothing here is published. Read the findings, not the code.

Asked: can open dictionaries give Luraty translations and meanings, can a second language and a
dialect be built, and can everything be joined through one linked table?

## What was built

| | what | size |
| --- | --- | --- |
| pack | `en` — English, Leipzig news 2024 + Wikidata Lexemes | 23,293-row lemma table, 10,000-word list |
| pack | `en-GB` — **same lexicon**, British ranking (ADR-0046's shape, on a second language) | 10,000-word list |
| dict | **WordNet 3.1** — curated, synset-based | 147,478 lemmas / 155,467 (lemma,pos) |
| dict | **Wiktionary EN** via Wiktextract — crowd-sourced | 1,355,265 lemmas / 1,491,730 records |
| dict | **Wiktionary DE** via Wiktextract | 371,255 entries |
| bridge | `ConceptLink` + directed `VarietyTransfer`, ADR-0047's exact shape | — |

## Findings

### 1. ⚠️ The lemma table silently makes variety decisions, and it is not consistent

248 US/GB spelling pairs exist in the English lemma table. What it does with them:

| behaviour | count | examples |
| --- | --- | --- |
| **GB folds into US** | 170 | `honour→honor`, `behaviour→behavior`, `centre→center`, `organise→organize` |
| **US folds into GB** | 29 | `favor→favour`, `labor→labour`, `rumor→rumour`, `gray→grey`, `program→programme` |
| **left unlinked entirely** | 16 | `colour` / `color` are two separate lemmas; `annualise` / `annualize` likewise |

**There is no rule. It is whatever Wikidata happened to record as that lexeme's lemma.** A British
learner who proves `organise` is credited under `organize`; one who proves `colour` gets a *different
unit* from `color`; an American who proves `gray` is credited under `grey`.

This is the strongest argument in the experiment for ADR-0047's core claim: **a variety relation must
be declared, never inherited from a lemma table.** The table is already making these calls, invisibly,
and getting them three different ways.

### 2. ✅ Meanings cluster variants for free — ❌ but no dictionary knows which variety they belong to

Grouping German words by their normalised first gloss, with no variety data at all:

```
chicken         Chicken Hendl Hinkel Huhn Hähnchen Hühnchen Hühnerfleisch Poulet
potato          Erdapfel Erdbirne Grumbeere Grundbirne Kartoffel
tomato          Paradeis Paradeiser Paradiesapfel Tomate
bicycle         Drahtesel Fahrrad Stahlross Velo
bread roll      Brötli Rundstück Semmel Weck Weckerl
drinking straw  Strohhalm Trinkhalm
```

40,830 such clusters. **1,178 have two or more members inside the German pack's own 10,000-word
vocabulary; 2,299 of those 10,000 words (23.0%) gain a same-meaning sibling.**

Now the other half. Of 371,255 German entries, the regional tags are: `regional` 984, `dialectal`
194, **`Swiss` 20, `Austrian` 5**. And checked by hand:

| word | gloss | tagged? |
| --- | --- | --- |
| Hendl | chicken, especially one that is young | **— none —** |
| Marille | apricot | **— none —** |
| Erdapfel | potato | **— none —** |
| Paradeiser | tomato | **— none —** |
| Jänner | synonym of Januar | **— none —** |
| Poulet | chicken (meat) | **— none —** |
| Velo | bicycle | **— none —** |

**The dictionary knows what the word MEANS. It does not know where it is SPOKEN.** So a bridge can be
bootstrapped from dictionaries for its `ConceptLink` half and *not* for its variety half — which is
the half that answers "is this Austrian?". That must come from a variety dictionary
(*Variantenwörterbuch*) or from corpus evidence (MADAR's generality-score approach).

⚠️ Caveat: this is **English** Wiktionary's German section. German Wiktionary may mark variety better;
untested.

### 3. ⚠️ Some links exist only in prose

4,142 German entries state the relation as *"synonym of X"* / *"alternative form of X"* inside the
gloss string rather than as structured data — `Jänner` → *"synonym of Januar"*. Recoverable by regex,
fragile by construction.

### 4. ⚠️ Two English dictionaries disagree by about 2×, and the tail is unusable

Measured on 7,037 shared lemmas: mean senses **WordNet 3.96 · Wiktionary 9.29**, median ratio
**2.0×**, Wiktionary larger on **83.8%**.

```
aa   +54      cap  +42      cat  +41      over +40      hack +39
```

**ADR-0028 shows a learner every reading. 41 readings for `cat` is not a picker, it is a menu nobody
reads.** A sense cutoff is required and it is a product decision, not a data one.

### 5. ✅ Between them the two English dictionaries cover essentially everything — but neither alone does

| | WordNet | Wiktionary | neither |
| --- | --- | --- | --- |
| top 1,000 | 79.9% | **100.0%** | 0.0% |
| top 5,000 | 75.5% | 99.9% | 0.1% |
| top 10,000 | 70.4% | 99.7% | 0.3% |
| top 20,000 | 62.7% | 98.4% | 1.6% |

**201 of the 1,000 commonest English words have no WordNet entry at all** — WordNet is content-words
only, so every pronoun, determiner, preposition and auxiliary is absent. All 201 are in Wiktionary
(as `pron` 32, `det` 21, `prep` 20, …). The six words in the top 5,000 that neither has are
`marketbeat jpmorgan tinubu ishares citigroup bancorp` — tickers and names, i.e. corpus noise rather
than a dictionary gap.

**Verdict: Wiktionary is the meaning layer. WordNet is worth keeping only for its synset structure**,
which is the thing Wiktionary lacks.

### 6. ⚠️ The lemma table's value is wildly language-dependent

Token coverage — the share of running tokens the form→lemma table actually resolves:

```
German    73.9%    83,361 rows
Arabic    36.9%   194,024 rows
English   13.8%    23,293 rows
```

English barely inflects, so most forms are already their own lemma. **For English the dictionary
carries nearly all the weight and the pack almost none; for German it is the reverse.** A single
"add a language" pipeline that assumes German's shape will badly misjudge English.

### 7. ⚠️ Comparing two corpora does not isolate a dialect

`en` (news, 2024) vs `en-GB` (web, 2002) share only 76.4% of their top 10,000. But the biggest
shifts are **genre and era, not dialect**:

```
"British"   specified documentation module consultancy timetable diploma seminar cheque browser
"General"   escalate ontario baseball justin ceo mom google ai ukraine spokesperson
```

`cheque` and `mom` are real dialect. `google`, `ai`, `ukraine` are 2024. **A frequency list measures
its corpus, not its variety** — so a dialect pack built from whatever corpus is available will encode
the corpus's subject matter as though it were the dialect's vocabulary. This applies directly to
building Palestinian from one source and MSA from another.

### 8. ⚠️ Raw translations need the pack's own `compare` before use

`dictionary` → Arabic yields `قَامُوس · مُعْجَم · قاموس · قاموس`: one duplicate, and two entries
differing only by vocalisation. Unnormalised translations carry near-duplicates into every concept.

## Method notes

- Both Wiktionary dumps are streamed (`curl | python`) — 3.0 GB and 1.0 GB never land on disk.
- **Regional tags are per SENSE, not per word.** A first pass unioned them onto the lemma and made
  `cat` "American" because one slang sense is. Applying that to a pack would have told a learner an
  ordinary word is regional.
- A first attempt at gloss-clustering stripped punctuation *before* splitting on it, losing every
  comma-delimited gloss. Fixing the order took shared-gloss clusters from 32,649 to 40,830 (+25%).

### 9. ⚠️ Translation coverage is an order of magnitude worse than gloss coverage

Only **8,838 of 1,355,265** English Wiktionary lemmas carry *any* translation — **0.65%**. And
weighted by how often a learner meets the word:

| | has a German translation | has an Arabic translation |
| --- | --- | --- |
| top 1,000 | 21.8% | 23.0% |
| top 5,000 | 15.0% | 14.2% |
| top 10,000 | 11.5% | 9.8% |

So: a gloss for ~100% of what she reads, a cross-language equivalent for ~1 word in 5. **The concept
spine cannot be built from Wiktionary translations alone.** Wikidata sense-links or an ILI mapping
would have to carry the rest.

### 10. ✅ The bridge works end to end — after the pack's own normalizer is applied

Built to ADR-0047's shape: **9,484 concepts, 39,993 links** across `en de fr es nl ar tr` plus
`en-US en-GB en-CA en-IE`.

Usable end-to-end, meaning *both* sides are in their pack's 10,000-word vocabulary:
**878 for en↔de, 100 for en↔ar.**

⚠️ **And that Arabic number is a normalization artefact, not a data limit.** Wiktionary writes Arabic
*vocalised* (`كَلِمَة`); the pack's lexicon is unvocalised (`كلمة`). Matching raw strings:

```
                          in 10k vocab      in 194k lexicon
as the dictionary gives    131   3.3%        226    5.7%
after pack normalize     1,350  34.2%      2,207   55.8%      ← 10x
```

**A dictionary must be passed through the pack's own `normalize` chain before any of its words can be
matched.** The same pass also collapses 274 near-duplicate spellings (`مَصْيَدَة` / `مِصْيَدَةٌ`),
removing 327 redundant links.

This is the repo's existing lesson in a new costume: the normalize chain and the lemma table are two
descriptions of one language, and nothing makes them agree except code that compares them.

## Verdict

**Yes to dictionaries, with three conditions.**

1. **Use Wiktionary for meaning, not WordNet.** 100% vs 79.9% on the first thousand words, and
   WordNet structurally cannot hold a preposition.
2. **Normalize through the pack before matching anything.** 10× on Arabic. Skipping this looks like
   "the dictionary doesn't have our words".
3. **Do not expect variety attribution.** 5 Austrian tags in 371,255 German entries. The concept
   clustering is free; the variety labels are not, and must come from a variety dictionary or from
   corpus evidence.

**And one thing to fix regardless of dictionaries:** the English lemma table is already deciding
US/GB variety questions three inconsistent ways (finding 1). That is live in the pack build today.
