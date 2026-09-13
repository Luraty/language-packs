import {
  checkPack,
  createPack,
  vocabularyOf,
  type LanguagePack,
  type Lemma,
  type PackConfig,
} from '@luraty/engine';

import { CONFIG, FREQUENCY, LEMMA_ROWS, SAMPLE } from './data.generated.js';

/**
 * German, already built.
 *
 * ```ts
 * import { de, vocabulary } from '@luraty/pack-de';
 * ```
 *
 * That is the whole setup. No file reading, no TSV parsing, no `createPack`, no result to unwrap.
 *
 * ⚠️ **WHY THIS IS A SEPARATE PACKAGE AND NOT PART OF THE ENGINE.** Two reasons, and both are hard
 * constraints rather than preferences.
 *
 * 1. **The engine holds no language.** Everything language-specific arrives as data through the
 *    four-function pack contract, which is what lets a language be added without a code change. A
 *    German word list inside the engine would end that.
 * 2. **435 KB of German should not ship to a French-only app.** The data is bundled here, so a host
 *    installs the languages it actually uses.
 *
 * @module
 */

/** The lemma table, parsed once at module load. */
function parseLemmas(rows: string): ReadonlyMap<string, string | readonly string[]> {
  // ⚠️ **A MAP, NOT A PLAIN OBJECT, AND THE REASON IS A HARD CEILING RATHER THAN TASTE.** A plain
  // object holds one own property per row and **Hermes caps that at 196,607** — measured,
  // engine/docs/guides/benchmarking.md. Hermes is the runtime React Native ships and the only one
  // where the limit exists, so crossing it builds fine, passes every lane here (they all run on
  // Node), and kills the app at module load. This table reached 192,159 rows during Luraty/luraty#206
  // and had to be held back by a frequency floor until `PackData.lemmas` accepted a Map
  // (Luraty/luraty#210). `createPack` copies into a Map anyway, so the object was always a transient.
  const out = new Map<string, string | readonly string[]>();
  for (const line of rows.split('\n')) {
    // ⚠️ **EVERY TAB, NOT THE FIRST ONE — AND TAKING EVERYTHING AFTER THE FIRST TAB WAS A SILENT
    // CORRUPTION WAITING FOR THE DATA TO ARRIVE.** This used to be `line.slice(tab + 1)`, so the
    // moment a row grew a second reading (Luraty/luraty#177, ADR-0028) the lemma became the literal
    // string `"كتب\tكتاب"` — one unit key containing a tab, addressing a word that does not exist,
    // and nothing would have thrown. The pack would have built, reported healthy, and filed every
    // ambiguous word under a nonsense address.
    //
    // ⚠️ A ONE-LEMMA ROW STAYS A BARE STRING rather than becoming a one-element array. Both are
    // legal `PackData.lemmas` values and `createPack` treats them identically, but 81,818 of the
    // 86,910 Arabic rows have exactly one reading and an array apiece is 81,818 allocations on the
    // cold-start path for no information.
    const parts = line.split('\t');
    const form = parts[0];
    if (form === undefined || form.length === 0 || parts.length < 2) continue;
    const readings = parts.slice(1).filter((r) => r.length > 0);
    if (readings.length === 0) continue;
    out.set(form, readings.length === 1 ? (readings[0] as string) : readings);
  }
  return out;
}

const built = createPack(CONFIG as unknown as PackConfig, {
  frequency: FREQUENCY,
  lemmas: parseLemmas(LEMMA_ROWS),
});

/**
 * ⚠️ **THIS THROWS AT MODULE LOAD IF THE PACK IS BROKEN, AND THAT IS THE DELIBERATE CHOICE.**
 *
 * The alternative is exporting a `Decoded<LanguagePack>` and making every host unwrap a failure that
 * cannot happen — the data is frozen in this package and `index.test.ts` asserts it builds and
 * passes `checkPack` before anything ships. A result type for an impossible failure is ceremony
 * charged to every consumer forever.
 *
 * The risk is real and worth naming, because this package has been bitten by it: a module that
 * throws at LOAD kills the whole importing test file before any test runs, and Stryker — which
 * scores from test results — recorded fifteen such mutants as *survived*. That is why the guarantee
 * is a test on frozen data rather than a hope.
 */
if (!built.ok) {
  throw new Error(`@luraty/pack-de is corrupt: ${built.error.message}`);
}

/** The pack. Pass it to `coverage()`, or to `learner()` as its `pack`. */
export const de: LanguagePack = built.value;

/** The raw frequency list, commonest first — for a host that wants to build its own order. */
export const frequency: string = FREQUENCY;

/**
 * Every distinct lemma, commonest first. Pre-computed, because every host needs it and computing it
 * means keying 10,000 words.
 *
 * This is what you pass as `learner(...)`'s `vocabulary`, or slice for a placement list.
 */
export const vocabulary: readonly Lemma[] = vocabularyOf(de, FREQUENCY);

/**
 * Run the engine's conformance checks against this pack's own data.
 *
 * Exported so a host can run it at load time if it wants, and so this package's own test can assert
 * the shipped data is healthy — which is what makes the throw above unreachable in practice.
 */
export function selfCheck(sampleText: string): ReturnType<typeof checkPack> {
  return checkPack(de, { text: sampleText });
}

/**
 * A short passage of real running text in this language.
 *
 * ⚠️ **IT IS THE CONFORMANCE FIXTURE AND THE CALIBRATION TEXT, AND THAT DUAL USE IS DELIBERATE.**
 * `check-packs.mjs` tokenizes it to prove the pattern covers the script; the app redacts it by rank
 * so a learner can judge where her vocabulary stops. Both need the same thing — ordinary prose that
 * this pack claims to handle — and one sample that fails either job is telling you something.
 */
export const sample: string = SAMPLE;
