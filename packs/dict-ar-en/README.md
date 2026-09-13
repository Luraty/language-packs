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
// ]
lookup(msa.key('الطَّارِئ')); // [] — a common word English Wiktionary has no entry for
```

## API

```ts
type SourceId = 'wiktionary-en';

lookup(key: string): readonly { source: SourceId; senses: readonly string[]; pos?: readonly string[] }[];
sources: readonly { id; name; licence; url; provenance; built }[];   // for attribution in the UI
coverage: { pack; vocabulary; top; keys; sources: Record<SourceId, { entries; senses; vocabulary; top }>; any };
```

- **`lookup` takes a key, not a word.** Pass `msa.key(surface)`, or each of `msa.candidates(surface)`
  when a spelling has several readings. It normalizes nothing itself.
- **One source today, and the return is still a list of per-source meanings.** A second dictionary
  widens `SourceId` and appends to the list; it does not change the shape a caller reads.
- ≤5 senses per source, each ≤200 characters, cut at a word boundary and marked `…`. `pos` only
  where the source gives one.
- **Attribute every meaning to its `source`.** Wiktionary is CC BY-SA 4.0. See
  [`ATTRIBUTION.md`](ATTRIBUTION.md).
- Machine-extracted and **unreviewed**.

## Coverage, against `@luraty/pack-ar@0.1.0`

Share of pack-ar's 10,000-word vocabulary (and its commonest 1,000) with at least one meaning.

| | 10,000 | top 1,000 | keys | senses |
| --- | ---: | ---: | ---: | ---: |
| `wiktionary-en` | **55.2%** | **91.0%** | 10,518 | 25,557 |

**Why the number is the artifact's own join, unchanged:** Wiktionary's headwords are already spelled
the way pack-ar keys them, and nothing legitimate was found to add. pack-ar's normalize chain added 0
matches. Folding hamza/ة/ى the way pack-ar's `compare` does added 324 entries — and they were wrong
words: كأن "as if" under كان "was", أشعار "poems" under إشعار "notification", أب "father" under آب
"August". `compare` folds these because it grades a typed answer; `key` keeps them apart because they
are different words. Keying the dictionary headword through `pack.key()` added القاهرة "Cairo" under
قهر "to subdue", and even restricted to same-spelling-up-to-folding it added علي "Ali" under على "on"
for +0.0 points. All rejected.

The remaining gap is mostly **pack-ar's morphology, not the dictionary**: `أنه`, `فيها`, `بها`,
`المتحدة` are keys in pack-ar's vocabulary with a pronoun or the article still attached. See
[`docs/ARABIC-DICTIONARY-SOURCES.md`](https://github.com/Luraty/language-packs/blob/main/docs/ARABIC-DICTIONARY-SOURCES.md).

## Rejected for now: Lane's Lexicon

A second source, Lane's *Arabic-English Lexicon* (1863–1893), was built and measured, then removed
before the first publish. **The reason is its licence, not its quality:** the only digital copy the
build can read comes from a GPL-3.0 software repository that states no licence for the data, and an
EU database right may attach to the digitization even though the text is public domain. See
[`ATTRIBUTION.md`](ATTRIBUTION.md#deferred-lanes-lexicon).

What the build had learned, so it does not have to be re-learned if a clean copy turns up:

- **It would add 2.4 points of the 10,000 and 1.0 of the top 1,000** (either source 57.6% / 92.0%,
  against Wiktionary alone at 55.2% / 91.0%), for 797 KB gzipped — twice Wiktionary's weight.
- **The extract indexes Lane without hamzas** (`أَرْضٌ` under `ارض`), which pack-ar keys as a
  different word, so إلى, أن, أرض, رأس were unreachable. Re-keying each sense by the vocalized
  headword Lane's own text opens with — only when it equals the index key up to hamza/ة/ى under
  pack-ar's `compare` — moved 206 senses and lifted Lane's top 1,000 from 55.4% to 58.6%.
- **3,999 senses were only a bare headword or a cross-reference** (`أَدْمٌ : see أُدْمَةٌ`). On a tap
  they read as a meaning and are not one; dropping them cost 3.0 points of the 10,000 and 3.7 of the
  1,000, which the raw join had been counting as coverage.
- Lane's English is nineteenth-century and scholarly (`(S, M, K)`, "inf. n.", "q. v."); a UI would
  have to label it as a classical reference, not a gloss.

The removed build is in git history: `git show 87ddbd3:packs/dict-ar-en/scripts/build.mjs`.

## Size

The data is one string in the compiled module, parsed into a `Map` on the first `lookup`.

| | raw | gzip |
| --- | ---: | ---: |
| rows (`wiktionary-en`) | 1.13 MB | 372 KB |

## Rebuilding

```bash
make dict-ar-en            # from the repo root; or: cd packs/dict-ar-en && npm run generate
```

`scripts/build.mjs` reads `languages/fusha/out/dictionary.wiktionary-en.json` and the installed
`@luraty/pack-ar`, and writes `src/data.generated.ts`. `src/data.test.ts` rebuilds it and fails on any
drift — **including a pack-ar bump**, because the keys are a function of the pack.
