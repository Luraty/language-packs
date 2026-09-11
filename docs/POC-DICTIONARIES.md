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
| dict | **Wiktionary EN** via Wiktextract — crowd-sourced | streaming, 3.0 GB source |
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

### 4. ⚠️ Two English dictionaries disagree by about 2×

On shared lemmas, Wiktionary carries roughly **twice** the senses of WordNet, and more on **88%** of
them. `bank` is +23. **ADR-0028 shows a learner every reading — 23 readings is not a picker, it is a
menu nobody reads.** A sense cutoff is required, and it is a product decision, not a data one.

### 5. ⚠️ WordNet misses exactly the words a learner meets first

Of the 1,000 commonest English words, **~18% are in neither dictionary** in the partial run — and they
are `to of for that was from his this they`. WordNet is content-words only: no prepositions, pronouns,
articles, auxiliaries. A WordNet-only meaning layer has nothing to say about the first page of
anything. (Wiktionary does cover them; final numbers pending.)

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
