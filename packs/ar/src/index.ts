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
 * Modern Standard Arabic.
 *
 * ```ts
 * import { msa, vocabulary } from '@luraty/pack-ar';
 * ```
 *
 * ⚠️ **THE FREQUENCY LIST DESCRIBES NEWSWIRE, NOT SPEECH.** It is counted from two Leipzig Arabic
 * news corpora, so "rank 40" means the fortieth commonest word *in written journalism*. That is a
 * good proxy for reading and a poor one for a taxi rank — the vocabulary of asking for directions
 * is not the vocabulary of a wire report, and this pack will rate a learner who can do the first and
 * not the second as a beginner.
 *
 * ⚠️ **`ar` AND `ar-x-quran` ARE SEPARATE VARIETIES AND MUST NEVER BE SUMMED.** Unit keys carry the
 * variety, so a word proven in the mushaf is not proven here. That is correct: knowing
 * `يُؤْمِنُونَ` from recitation says little about reading a news headline, and a single "Arabic
 * level" would hide exactly the unevenness this product exists to measure.
 *
 * ⚠️ **`normalizeArabicAlef` IS IN `compare` ONLY, NOT IN `normalize`, AND THE FIRST VERSION OF THIS
 * PACK GOT THAT WRONG.** Folding أ/إ/ا looks obviously right for unpointed newswire — I wrote a
 * paragraph arguing it was "what makes the lemma table join the corpus", and it was not verified.
 * `scripts/check-packs.mjs` refuted it in one line:
 *
 *     unstable-key — key() is not idempotent: "ماس" keys again to "ماساة"
 *
 * The lemma table was built stripping harakat, superscript alef and tatweel — **not** hamza-carrying
 * alefs (see `provenance.json`). Folding them in `normalize` made surface forms collide with table
 * keys the table never expected, so keying twice gave two different answers and one word would have
 * been tracked under two unit keys.
 *
 * ⚠️ **THE GENERAL SHAPE, FOR THE THIRD TIME IN THIS REPO: the normalize chain and the lemma table
 * are two descriptions of one language, and nothing makes them agree except a check that compares
 * them.** #106 was the same failure between the frequency list and `key()`. The fix is always to
 * make one derive from the other, or to assert they agree.
 *
 * It stays in `compare`, where it belongs: a learner typing a plain alef for a hamzated one is
 * right, and `compare` is about grading her answer rather than about identity.
 *
 * Sources: frequency from Leipzig newswire (`ara_news_2020_1M`, `ara_news_2022_1M`; Wikipedia
 * excluded on purpose — CC BY-SA upstream). Lemmatization from Wikidata Lexemes (CC0). See
 * `luraty-language-packs/languages/ar/out/provenance.json`.
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
 * ⚠️ **THIS THROWS AT MODULE LOAD IF THE PACK IS BROKEN, AND THAT IS THE DELIBERATE CHOICE**, the
 * same one `@luraty/pack-de` makes. The alternative is exporting a `Decoded<LanguagePack>` and making
 * every host unwrap a failure that cannot happen — the data is frozen in this package and
 * `index.test.ts` asserts it builds and passes `checkPack` before anything ships.
 */
if (!built.ok) {
  throw new Error(`@luraty/pack-ar is corrupt: ${built.error.message}`);
}

/** The pack. Pass it to `coverage()`, or to `learner()` as its `pack`. */
export const msa: LanguagePack = built.value;

/** The raw frequency list, commonest first — for a host that wants to build its own order. */
export const frequency: string = FREQUENCY;

/**
 * Every distinct lemma, commonest first. Pre-computed, because every host needs it and computing it
 * means keying ten thousand words.
 *
 * This is what you slice for a placement list, or pass as `learner(...)`'s `vocabulary`.
 */
export const vocabulary: readonly Lemma[] = vocabularyOf(msa, FREQUENCY);

/**
 * Run the engine's conformance checks against this pack's own data.
 *
 * ⚠️ Hand it REAL mushaf text, not a transliteration and not a modern-spelled paraphrase. The check
 * that matters here is whether the tokenizer survives Uthmani orthography, and only Uthmani input
 * exercises it.
 */
export function selfCheck(sampleText: string): ReturnType<typeof checkPack> {
  return checkPack(msa, { text: sampleText });
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
