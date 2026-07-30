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

⚠️ This dataset contains the frequency list **only**. The matching lemma table is CC BY-SA, and
bundling it here would make this dataset share-alike too — which would defeat the purpose of
publishing a list anyone can use.

## Caveats worth knowing before you rely on this

- **A frequency list is a picture of its corpus.** {register_caveat}
- **Coverage is not the number you might assume.** Measured against held-out text, the top 10,000
  lemmas cover about **88% of news** and **82% of Wikipedia** running tokens. Literature figures
  near 98% are quoted for *word families* on other corpora with other tokenizers — not comparable,
  and not a shortfall.
- **Lemmatization is never perfect.** These lemmas come from human-annotated treebanks rather than
  suffix rules, because rules fail *silently* and plausibly. Errors that remain are mostly
  homographs resolved the wrong way.

## Part of Luraty

Built for [Luraty](https://github.com/younissk/lughaty), an adaptive language trainer for heritage
and uneven-intermediate speakers — people who grew up hearing a language, understand more than they
can say, and are bored by beginner courses. The lists are published separately because they are
useful on their own.
