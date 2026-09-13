/**
 * The shipped data is healthy, and it works on REAL mushaf text.
 *
 * ⚠️ **THE FIXTURES ARE UTHMANI, WITH THEIR DIACRITICS.** A test written in modern spelling would
 * pass while the pack was useless for its only corpus — every decision in `pack.config.json` is
 * about surviving orthography that only appears in a mushaf. See the repo lesson about fixtures that
 * cannot exercise the transform they test.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import { arQuran, frequency, selfCheck, vocabulary } from './index.js';

/** Al-Fatiha 1–2 and al-Ikhlas 1, exactly as the mushaf writes them. */
const FATIHA_1 = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const FATIHA_2 = 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ';
const IKHLAS_1 = 'قُلْ هُوَ ٱللَّهُ أَحَدٌ';

describe('@luraty/pack-ar-x-quran', () => {
  it('builds, and is the variety it claims to be', () => {
    expect(arQuran.id).toBe('ar-x-quran');
  });

  it('passes the engine\'s own conformance checks on mushaf text', () => {
    // ⚠️ Real verses, not a contrived string. `checkPack` is the check that no unit test can
    // substitute for, because what breaks is the 90,000-row file rather than the code.
    expect(selfCheck([FATIHA_1, FATIHA_2, IKHLAS_1].join(' '))).toEqual([]);
  });

  it('does not split a word at a Qur\'anic recitation mark', () => {
    // ⚠️ THE REGRESSION, measured 2026-08-01. `هُدًۭى` in 2:2 carries U+06ED ARABIC SMALL LOW MEEM
    // BETWEEN the tanween and the alef maksura. A tokenize pattern stopping at U+06D3 splits it into
    // two fragments, neither of them a word, and the whole mushaf loses 2,933 tokens to the same
    // cause. Asserted through `split` AND `key`, because the pattern and the normalize chain have to
    // agree about the block for either to be useful.
    const word = 'هُدًۭى';
    expect(arQuran.split(`لَا رَيْبَ ${word}`)).toHaveLength(3);
    expect(arQuran.key(word)).toBe('هدى');
  });

  it('yields a token that keys to nothing for a standalone recitation sign', () => {
    // The cost of the wider class, named so nobody "fixes" it: `ۛ` stands alone between words. It
    // keys to the empty string, which is how `coverage()` already excludes it — but a caller doing
    // its own arithmetic over `split()` must filter, or every verse reads longer than it is.
    expect(arQuran.key('ۛ')).toBe('');
  });

  it('splits Uthmani text into words rather than into letters', () => {
    // ⚠️ THE BUG THIS PINS. Diacritics sit BETWEEN letters, so a token pattern that excludes them
    // shatters every word into single characters — measured, and it looked like a coverage problem
    // rather than a tokenizer one.
    expect(arQuran.split(FATIHA_2)).toHaveLength(4);
    expect(arQuran.split(IKHLAS_1)).toHaveLength(4);
  });

  it('keys inflected mushaf forms onto their lemma', () => {
    expect(arQuran.key('ٱلْعَٰلَمِينَ')).toBe('علم');
    expect(arQuran.key('رَبِّ')).toBe('رب');
    // ⚠️ THE WASLA ROW EARNING ITS KEEP. The mushaf writes `ٱ`, the frequency list holds `الله` with
    // a plain alef, and the bridge between them is a data row rather than a normalize step — worth
    // 17 points of corpus coverage on its own. See README.
    expect(arQuran.key('ٱللَّهِ')).toBe('الله');
    // And the same noun with the preposition attached is a DIFFERENT key. Asserted because it is the
    // pair most likely to be "fixed" into a single lemma by somebody tidying the table.
    expect(arQuran.key('لِلَّهِ')).toBe('لله');
  });

  it('ranks the commonest Qur\'anic words first', () => {
    expect(vocabulary[0]).toBe('من');
    expect(vocabulary[1]).toBe('الله');
    expect(arQuran.rank('رب')).toBeLessThan(100);
    // ⚠️ NOT `Infinity` for an unknown word — `JSON.stringify(Infinity)` is `null`, and a rank that
    // silently becomes null somewhere downstream is a bug nobody traces back to here.
    expect(arQuran.rank('zzzz')).toBeUndefined();
  });

  it('ships a frequency list and a vocabulary of the same order', () => {
    expect(vocabulary.length).toBeGreaterThan(9_000);
    expect(frequency.split('\n').length).toBeGreaterThan(9_000);
  });

  it('compares forgivingly, where normalising does not', () => {
    // A learner typing a plain alef for a hamzated one is right. The same fold inside `key()` would
    // merge أن with ان — two different words — which is why the two chains differ on purpose.
    expect(arQuran.compare('احد', 'أحد')).toBe(1);
    expect(arQuran.key('أن')).not.toBe(arQuran.key('ان'));
  });
});
