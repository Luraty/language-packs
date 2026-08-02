/**
 * The licence and register vocabularies, shared by the source gate and the catalogue checker.
 *
 * They live in one file so the two cannot drift. A catalogue that recognised a licence id the gate
 * rejected — or the reverse — would be a place to record a source that can never be adopted, which
 * is worse than not recording it.
 */

/**
 * ⚠️ A WHITELIST, NOT A PARSER — and the parser this replaced was a live hole.
 *
 * The old test was `String(licence).split('-').includes('SA')`: read the id as dash-separated
 * flags, look for `SA`. Anything that does not match that exact shape is silently classed as
 * permissive.
 *
 *     CC-BY-SA-4.0   → ['CC','BY','SA','4.0']  → share-alike ✓
 *     CC-BY-SA4.0    → ['CC','BY','SA4.0']     → NOT share-alike ✗   one missing dash
 *     CC BY-SA 4.0   → ['CC BY','SA 4.0']      → NOT share-alike ✗   spaces instead of dashes
 *
 * A typo in a licence id that silently disables the licence check is the worst failure this gate
 * can have, because every downstream report then says green. So an unknown id is a hard error, and
 * the properties are looked up rather than inferred.
 *
 * It also missed NON-COMMERCIAL completely, which is not a hypothetical gap here:
 *
 *   - `UD_Arabic-PADT`, the obvious lemma source for Arabic, is **CC BY-NC-SA 3.0**.
 *   - `UD_German-LIT`, an obvious way to widen the German literary register, is **CC BY-NC-SA 4.0**.
 *   - Leipzig was once *believed* to be NC, and that belief killed a language for a while.
 *
 * NC feeding a permissive output has to be exactly as loud as share-alike is.
 *
 * NO-DERIVATIVES is louder still: a frequency count is an adaptation of the corpus, so an ND source
 * cannot produce a shippable output at all, whatever the output declares.
 *
 * Add an id here only after reading the actual terms. That reading is the work; this table is just
 * where the answer is written down.
 */
export const LICENCES = {
  'CC0-1.0': { shareAlike: false, nonCommercial: false, noDerivatives: false },
  'PD': { shareAlike: false, nonCommercial: false, noDerivatives: false },
  'MIT': { shareAlike: false, nonCommercial: false, noDerivatives: false },
  'Apache-2.0': { shareAlike: false, nonCommercial: false, noDerivatives: false },
  'ODC-BY-1.0': { shareAlike: false, nonCommercial: false, noDerivatives: false },
  'CC-BY-3.0': { shareAlike: false, nonCommercial: false, noDerivatives: false },
  'CC-BY-4.0': { shareAlike: false, nonCommercial: false, noDerivatives: false },
  'ODbL-1.0': { shareAlike: true, nonCommercial: false, noDerivatives: false },
  'CC-BY-SA-3.0': { shareAlike: true, nonCommercial: false, noDerivatives: false },
  'CC-BY-SA-4.0': { shareAlike: true, nonCommercial: false, noDerivatives: false },
  'CC-BY-NC-3.0': { shareAlike: false, nonCommercial: true, noDerivatives: false },
  'CC-BY-NC-4.0': { shareAlike: false, nonCommercial: true, noDerivatives: false },
  'CC-BY-NC-SA-3.0': { shareAlike: true, nonCommercial: true, noDerivatives: false },
  'CC-BY-NC-SA-4.0': { shareAlike: true, nonCommercial: true, noDerivatives: false },
  'CC-BY-ND-4.0': { shareAlike: false, nonCommercial: false, noDerivatives: true },
  'CC-BY-NC-ND-4.0': { shareAlike: false, nonCommercial: true, noDerivatives: true },
};

export const KNOWN_LICENCES = Object.keys(LICENCES).sort().join(', ');

/**
 * Registers, in the sense the frequency-list literature uses the word. Which register a corpus
 * belongs to predicts how well the resulting list matches how people actually use the language —
 * more than corpus size does past ~16–30M tokens. See `docs/METHODOLOGY.md`.
 *
 * `annotation` and `hand-written` are not registers of the language; they mark inputs that supply
 * structure (lemmas, irregulars) rather than running text, so they are excluded from the
 * spoken-proxy check.
 */
export const REGISTERS = new Set([
  'spoken',
  'subtitles',
  'social',
  'news',
  'web',
  'literary',
  'encyclopedic',
  'mixed',
  'annotation',
  'hand-written',
]);

/** Registers that stand in for everyday speech. A list with none of these is a list of writing. */
export const SPOKEN_PROXY = new Set(['spoken', 'subtitles']);

/** Registers built by scraping whatever the internet said that year. */
export const CRAWLED = new Set(['web', 'social', 'news', 'mixed']);

/** Registers that describe running text, as opposed to a structural layer over someone else's. */
export const isTextRegister = (register) =>
  register !== undefined && register !== 'annotation' && register !== 'hand-written';

/**
 * ⚠️ Text collected after this year may contain generative-AI output, which shifts frequencies.
 * This is why `wordfreq` stopped shipping updates rather than publish numbers its author no longer
 * believed. A warning, not a failure — a 2024 news corpus is still usable, it just is not a clean
 * observation of how humans write. Prefer an older snapshot where one exists.
 */
export const AI_CONTAMINATION_YEAR = 2021;
