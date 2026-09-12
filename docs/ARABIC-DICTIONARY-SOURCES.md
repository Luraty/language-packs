# Which Arabic dictionary should ship?

**2026-09-12.** Measurement before building, per the plan. Both candidate sources extracted and
scored against the pack a learner actually receives: `languages/fusha/out` — a 208,052-entry lexicon
and a 10,000-word vocabulary in frequency order.

## The answer

**Ship `ar→en` (English Wiktionary's Arabic section). Do not ship `ar→ar` as the primary.**

| | headwords | senses | top-10k covered | senses/word |
| --- | --- | --- | --- | --- |
| **ar→en** (kaikki, 495 MB) | **26,700** | **59,689** | **55.2%** | median 1, max 12 |
| ar→ar (ar.wiktionary, 14 MB) | 7,081 | 16,767 | 14.3% | median 2, max 12 |

Coverage by frequency band — the band is what a learner meets, so this matters more than the total:

| band | ar→en | ar→ar |
| --- | --- | --- |
| first 500 | **93.2%** | 40.4% |
| 500–1,000 | **88.8%** | 28.2% |
| 1,000–2,500 | **79.5%** | 23.5% |
| 2,500–5,000 | **60.4%** | 14.3% |
| 5,000–10,000 | **38.2%** | 7.5% |

## ⚠️ The monolingual dictionary adds 65 words

Of the top 10,000: `ar→en` covers 4,162 that `ar→ar` does not; **`ar→ar` covers 65 that `ar→en`
does not** — 0.65%. And some of those 65 are not definitions at all: `او` resolves to *"this is a
wrong way to write أو"*.

The union is **55.9%** against `ar→en`'s 55.2%. **Parsing raw MediaWiki wikitext bought half a
percentage point.** The parser works and is kept (`builders/dict_arwiktionary.py`) because it also
extracts المرادفات and الترجمات, but it is a second dictionary at best, not the one to build on.

⚠️ **The "83,176 articles" figure on ar.wiktionary is misleading.** 104,528 pages yielded 7,081
Arabic entries with definitions. The rest are other languages, stubs, and disambiguation pages —
`ماء` points at `مَاء` and carries no definition itself.

## ⚠️ Vocalisation, again, and it is not uniform

| | raw match | after pack normalize |
| --- | --- | --- |
| ar→ar headwords | **1.9%** | **14.3%** |
| ar→en headwords | 55.2% | 55.2% |
| ar→en *translations* (measured 2026-09-11) | 5.7% | 55.8% |

**ar.wiktionary files entries under vocalised headwords** (`مَاء`), so nothing matches until the
pack's `stripArabicDiacritics` runs — a 7.5× lift. kaikki's Arabic *headwords* are already plain,
but its *translation targets* are vocalised, which is why the bridge needed the same pass. **The
rule is unconditional: normalize through the pack before matching, whatever the source.**

## ⚠️ The 44% gap is mostly OUR morphology, not the dictionary's

4,477 of the top 10,000 have no `ar→en` entry. The commonest of them:

```
أنه  فيها  بها  المتحدة  الصحة  البلاد  وقالت  الوطنية  الدولية  به  فيه  منها
```

Those are words with the definite article, a conjunction or a pronoun still attached. **The pack's
frequency list treats `المتحدة` as a lemma in its own right** rather than as ال + متحدة.

Stripping clitics naively lifts coverage **55.2% → 70.1%**. ⚠️ **Naive stripping is wrong and must
not ship**: it also produces `بها → ها`, `فيه → يه`, `نادي → ناد`. The fix belongs in the
lemmatizer and must be lexicon-guided — ADR-0033, *never take apart a word the lexicon lists*.

**So ~15 points of dictionary coverage are available from fixing the pack, with no dictionary work
at all.** That is a better next move than hunting for a richer dictionary.

## Quality of what ships

`ar→en` handles exactly the words a content-only dictionary cannot:

```
في    prep   in, within; during, for a duration of
من    prep   having partitive effect: of, some of, parts of, one of; made of
على   prep   on, over; against
إلى   prep   to, towards; till, until
```

And sense counts are mild — median 1, max 12. **The 41-senses-for-`cat` problem is an English
artefact and barely exists in Arabic**, so the display cutoff matters far less here than assumed.

## Consequences for the plan

1. **Phase 1 ships `ar→en`.** 93% of the first 500 words is a learner tapping a word and getting an
   answer nearly every time, early, where it counts.
2. **The multi-dictionary design earns its keep immediately** — `ar→ar` is exactly the "second
   dictionary, learner's choice" case, and it can ship later without a migration.
3. **A new task, ahead of any dictionary work: clitic handling in the lemmatizer.** Worth ~15 points
   of coverage and it fixes the frequency list at the same time.
4. **"Meanings in the language itself" is not reachable from open data today** at a quality a
   learner could rely on. 14.3% overall, 40% of the commonest 500. Revisit with a classical
   dictionary (Lisān al-ʿArab) or LLM generation behind a QA gate.
