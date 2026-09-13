# `@luraty/pack-ar` — Modern Standard Arabic

A language pack for [`@luraty/engine`](https://www.npmjs.com/package/@luraty/engine): the 10,000
commonest words of written Arabic, and a map from 192,255 spellings to the word each belongs to.

```ts
import { msa, vocabulary } from '@luraty/pack-ar';

msa.key('بكتابه'); // the word this spelling belongs to
vocabulary[0];     // the commonest word
```

- **Frequency** — two Leipzig Corpora Collection newswire corpora (`ara_news_2020_1M`,
  `ara_news_2022_1M`), CC BY 4.0.
- **Lemmas** — Wikidata Lexemes, CC0, built by `builders/build_lemmas_wikidata.py` in this repository.
- **Newswire, not speech, and no dialect.** 6,758 spellings carry more than one candidate reading;
  the first is the most frequent, and a host should let the learner choose.

See [`ATTRIBUTION.md`](ATTRIBUTION.md) for the licence of each file and
[`languages/ar/SOURCES.md`](../../languages/ar/SOURCES.md) for how the sources were chosen.
