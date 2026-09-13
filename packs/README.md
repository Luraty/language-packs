# `@luraty/pack-*`

Language packs for [`@luraty/engine`](https://www.npmjs.com/package/@luraty/engine).

| Package | Language | Words ranked | Forms mapped | Data licence |
| --- | --- | ---: | ---: | --- |
| [`@luraty/pack-ar`](ar/) | Modern Standard Arabic | 10,000 | 192,255 | CC BY 4.0 + CC0 |
| [`@luraty/pack-ar-x-quran`](ar-x-quran/) | Qur'anic Arabic | 10,850 | 90,549 | CC0 |
| [`@luraty/pack-de`](de/) | German | 10,000 | 15,471 | CC BY 4.0 + **CC BY-SA 4.0** |

```ts
import { createProfile } from '@luraty/engine';
import { msa, vocabulary } from '@luraty/pack-ar';
```

Each package's `ATTRIBUTION.md` says which licence attaches to which file. Code is MIT.

Every package runs the same lane: `npm run check` — typecheck, tests (including that the generated
module matches the data files beside it), build, publint, and importing the built package in plain
Node. `@luraty/pack-ar-x-quran` also proves every word its `key()` produces over the whole Qur'an is in
its vocabulary.
