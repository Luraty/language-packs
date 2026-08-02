---
license: {license_id}
language:
  - {language_code}
pretty_name: {pretty_name}
size_categories:
  - {size_category}
task_categories:
  - text-classification
tags:
  - word-frequency
  - frequency-list
  - lemmas
  - {language_code}
  - linguistics
  - language-learning
configs:
  - config_name: default
    data_files: data/*.parquet
---

# {pretty_name}

The **{rows:,} commonest {language_name} lemmas**, ranked by frequency in {corpus_summary}.

Ranked by **lemma**, not by surface form. `gehe`, `gehst`, `ging` and `gegangen` all count toward
`gehen`, so rank 1 is the commonest *word*, not the commonest *string*. That distinction is the
whole point of the list — a surface-form ranking splits a word's frequency across its inflections
and pushes common lemmas out of the top N entirely.

## Usage

```python
from datasets import load_dataset

ds = load_dataset("{repo_id}")
print(ds["train"][0])     # {{'rank': 1, 'lemma': '...'}}
```

Or just read the plain list: [`frequency.txt`](./frequency.txt), one lemma per line, commonest
first.

## How it was built

{method}

Full recipe, and the code: **<https://github.com/younissk/luraty-language-packs>**

## Provenance

| | |
| --- | --- |
| Rows | {rows:,} |
| Built | {generated_on} |
| SHA-256 | `{sha256}` |
| Builder | [`luraty-language-packs`](https://github.com/younissk/luraty-language-packs) @ `{commit}` |

Regenerating from the same corpus snapshot should reproduce that checksum. If it does not, something
in the pipeline changed and the difference is worth reading before trusting the new list.

## Source and licence

{attribution}

**Licence: {license_name}.**

This dataset contains the frequency list **only**. The matching form→lemma table is published
separately — Hugging Face carries one licence field per dataset, and keeping them apart is what
guarantees this list stays usable under its stated licence no matter what a future lemma source
turns out to require.

## Caveats worth knowing before you rely on this

- **A frequency list is a picture of its corpus.** {register_caveat}
- **No coverage figure is published, on purpose.** An earlier one measured a different pipeline and
  is no longer true; nobody has re-run it. Figures near 98% quoted in the literature are for *word
  families* on other corpora with other tokenizers and are not comparable in any case.
- **Lemmatization is never perfect.** The lemmas come from [Wikidata
  Lexemes](https://www.wikidata.org/wiki/Wikidata:Lexicographical_data) (CC0) rather than suffix
  rules, because rules fail *silently* and plausibly — an earlier rule-based version produced
  `warten→waren` ("to wait"→"were"), which no guard caught because the wrong answer is itself a
  common word. Remaining errors are mostly homographs resolved the wrong way, decided by corpus
  frequency where the lexicon offers more than one candidate.

## Part of Luraty

Built for [Luraty](https://github.com/younissk/lughaty), an adaptive language trainer for heritage
and uneven-intermediate speakers — people who grew up hearing a language, understand more than they
can say, and are bored by beginner courses. The lists are published separately because they are
useful on their own.
