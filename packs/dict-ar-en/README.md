# `@luraty/dict-ar-en` — Arabic → English, offline

A dictionary for reading your own Arabic text: tap a word, get its dictionary form from
[`@luraty/pack-ar`](https://www.npmjs.com/package/@luraty/pack-ar) and its English meanings from
here. Nothing leaves the device.

```ts
import { msa } from '@luraty/pack-ar';

// Load it when the reader opens — a host that never opens the reader never pays for it.
const { lookup, sources } = await import('@luraty/dict-ar-en');

const key = msa.key('وَالكِتَابِ'); // 'كتاب'
lookup(key);
// [
//   { source: 'wiktionary-en', senses: ['verbal noun of كَتَبَ …', …, 'book', …], pos: ['noun'] },
//   { source: 'lane',          senses: ['كِتَابٌ [inf. n. of 1, q. v. · as a subst.,] A thing in which …'] },
// ]
lookup('zzq'); // []
```

## API

```ts
type SourceId = 'wiktionary-en' | 'lane';

lookup(key: string): readonly { source: SourceId; senses: readonly string[]; pos?: readonly string[] }[];
sources: readonly { id; name; licence; url; provenance; built }[];   // for attribution in the UI
coverage: { pack; vocabulary; top; keys; sources: Record<SourceId, { entries; senses; vocabulary; top }>; any };
```

- **`lookup` takes a key, not a word.** Pass `msa.key(surface)`, or each of `msa.candidates(surface)`
  when a spelling has several readings. It normalizes nothing itself.
- Wiktionary first, then Lane. ≤5 senses per source, each ≤200 (Wiktionary) or ≤240 (Lane)
  characters, cut at a word boundary and marked `…`. `pos` only where the source gives one (Lane
  never does).
- **Attribute every meaning to its `source`.** Wiktionary is CC BY-SA 4.0. See
  [`ATTRIBUTION.md`](ATTRIBUTION.md).
- Machine-extracted and **unreviewed**.

## Coverage, against `@luraty/pack-ar@0.1.0`

Share of pack-ar's 10,000-word vocabulary (and its commonest 1,000) with at least one meaning.
"Before" is the dictionary artifacts joined to pack-ar's keys as they are; "after" is this package.

| | before · 10,000 | after · 10,000 | before · 1,000 | after · 1,000 | keys | senses |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `wiktionary-en` | 55.2% | **55.2%** | 91.0% | **91.0%** | 10,518 | 25,557 |
| `lane` | 31.7% | **28.9%** | 55.4% | **54.9%** | 6,408 | 9,801 |
| either | 58.4% | **57.6%** | 92.3% | **92.0%** | 11,951 | |

**Why the numbers did not go up, and why that is the honest result:**

- **Wiktionary: nothing legitimate to add.** Its headwords are already spelled the way pack-ar keys
  them. pack-ar's normalize chain added 0 matches. Folding hamza/ة/ى the way pack-ar's `compare`
  does added 324 entries — and they were wrong words: كأن "as if" under كان "was", أشعار "poems"
  under إشعار "notification", أب "father" under آب "August". `compare` folds these
  because it grades a typed answer; `key` keeps them apart because they are different words. Keying
  the dictionary headword through `pack.key()` added القاهرة "Cairo" under قهر "to subdue", and
  even restricted to same-spelling-up-to-folding it added علي "Ali" under على "on" for +0.0 points.
  All rejected.
- **Lane: re-keyed up, cleaned down.** The extract indexes Lane without hamzas, so إلى, أن, أرض,
  رأس had no Lane entry pack-ar could reach. Re-keying each sense by the headword Lane's own text
  opens with lifts the commonest 1,000 from 55.4% to **58.6%**. Then 3,999 senses that were only a
  bare headword or a cross-reference (`see أُدْمَةٌ`) are dropped, because on a tap they read as a
  meaning and are not one — that costs 3.0 points of the 10,000 and 3.7 of the 1,000. "Before"
  counted those pointers as coverage.

The remaining gap is mostly **pack-ar's morphology, not the dictionaries**: `أنه`, `فيها`, `بها`,
`المتحدة` are keys in pack-ar's vocabulary with a pronoun or the article still attached. See
[`docs/ARABIC-DICTIONARY-SOURCES.md`](https://github.com/Luraty/language-packs/blob/main/docs/ARABIC-DICTIONARY-SOURCES.md).

## Size

The data is one string in the compiled module, parsed into a `Map` on the first `lookup`.

| | raw | gzip |
| --- | ---: | ---: |
| `wiktionary-en` rows | 1.13 MB | 372 KB |
| `lane` rows | 2.32 MB | 797 KB |

Lane is two thirds of the weight for 2.4 points of coverage over Wiktionary alone. That is the lever
if the package needs to be smaller.

## Rebuilding

```bash
make dict-ar-en            # from the repo root; or: cd packs/dict-ar-en && npm run generate
```

`scripts/build.mjs` reads `languages/fusha/out/dictionary.{wiktionary-en,lane}.json` and the
installed `@luraty/pack-ar`, and writes `src/data.generated.ts`. `src/data.test.ts` rebuilds it and
fails on any drift — **including a pack-ar bump**, because the keys are a function of the pack.
