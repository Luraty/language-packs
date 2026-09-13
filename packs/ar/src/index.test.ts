import { describe, expect, it } from 'vitest';

import { FREQUENCY } from './data.generated.js';
import { msa, vocabulary } from './index.js';

/**
 * Examples for `@luraty/pack-ar`.
 *
 * ⚠️ **EVERY FIXTURE HERE MUST DIFFER FROM ITS OWN KEY.** A word that is identical to the lemma it
 * maps to cannot observe the transform — it is a fixed point, and a suite built from fixed points
 * passes whatever `key()` does. That mistake cost 432 green tests and two wrong units in this repo
 * once already.
 *
 * @module
 */

describe('@luraty/pack-ar', () => {
  it('is a real pack, not an empty one', () => {
    // ⚠️ 10,000, ONE PER SOURCE ROW. An earlier draft asserted 9,687 and explained the gap as the
    // alef fold merging spellings — a good explanation of a bug. With the fold moved out of
    // `normalize` there is no merge, and `vocabulary` is exactly the list.
    expect(vocabulary.length).toBe(10_000);
    expect(msa.id).toBe('ar');
  });

  it('produces no key that is missing from its own vocabulary', () => {
    // ⚠️ **THE #106 GUARD, GENERALISED.** In `ar-x-quran` the frequency list and the lemma table were
    // built at different times by different code and nothing compared them: 1,252 keys that `key()`
    // produced were absent from `vocabulary`, and since `plan()` introduces new units FROM the
    // vocabulary, one Qur'anic word in ten was permanently unlearnable while every test passed.
    //
    // This pack is clean — asserted rather than assumed, and asserted here so it stays that way.
    const known = new Set(vocabulary);
    const orphans = FREQUENCY.trim()
      .split('\n')
      .filter((word) => !known.has(msa.key(word)));
    expect(orphans).toEqual([]);
  });

  it('ranks the commonest MSA words first', () => {
    // From the Leipzig newswire counts. `في` (in) and `من` (from) top any Arabic corpus.
    expect(vocabulary.slice(0, 3)).toEqual(['في', 'من', 'على']);
    expect(msa.rank('في')).toBeLessThan(msa.rank('حكومة'));
  });

  it('does NOT fold the alef forms in key(), and that was a real bug', () => {
    // ⚠️ **THIS ASSERTION USED TO SAY THE OPPOSITE, AND IT WAS AN INVENTION.** The first version of
    // this pack put `normalizeArabicAlef` in the `normalize` chain and this test asserted
    // `key('إلى') === key('الى')`. The reasoning sounded good — unpointed newswire writes أ/إ/ا
    // interchangeably — and nothing had checked it against the lemma table, which was built WITHOUT
    // that fold. `scripts/check-packs.mjs` caught the consequence:
    //
    //     unstable-key — key() is not idempotent: "ماس" keys again to "ماساة"
    //
    // A non-idempotent `key` means one word tracked under two unit keys, silently.
    expect(msa.key(msa.key('إلى'))).toBe(msa.key('إلى'));
    expect(msa.key('إلى')).not.toBe(msa.key('الى'));
  });

  it('still forgives an alef spelling when GRADING an answer', () => {
    // The fold lives in `compare`, where it is about judging what she typed rather than about
    // identity. A learner writing a plain alef for a hamzated one is right.
    // ⚠️ `compare` returns a SIMILARITY in 0..1, not a boolean. 1 is an exact match after folding.
    expect(msa.compare('الى', 'إلى')).toBe(1);
    // And it is not blindly generous — a different word does not score 1.
    expect(msa.compare('الى', 'حكومة')).toBeLessThan(1);
  });

  it('strips diacritics, so a pointed text keys the same as an unpointed one', () => {
    // The fixture and its key differ — see the module header.
    expect(msa.key('مِنْ')).toBe('من');
    expect(msa.key('عَلَى')).toBe(msa.key('على'));
  });

  it('keys an inflected surface form onto its lemma', () => {
    // ⚠️ The point of the 86,910-row table. If this ever equals its own input, the lemma table is
    // not being consulted and every coverage number is counting surface forms.
    const inflected = 'الحكومة';
    expect(msa.key(inflected)).not.toBe(inflected);
  });

  it('never emits punctuation as a token in the first place', () => {
    // ⚠️ ASSERTED THROUGH `split`, NOT `key`. The first version of this called `key('،')` and expected
    // an empty string; it returns the comma unchanged. That is harmless and untestable-through-`key`,
    // because the tokenizer's range starts at U+0620 and the Arabic comma is U+060C — so `key` is
    // never handed one. Testing a path the code cannot take proves nothing about the path it does.
    expect(msa.split('في، البيت')).toEqual(['في', 'البيت']);
  });

  it('splits on the Arabic block and nothing else', () => {
    expect(msa.split('في البيت')).toEqual(['في', 'البيت']);
    expect(msa.split('hello')).toEqual([]);
  });
});

describe('alternate readings — Luraty/luraty#177, ADR-0028', () => {
  it('offers more than one reading where the lemma table records one', () => {
    // ⚠️ **AGAINST THE REAL 86,910-ROW TABLE, NOT A FIXTURE.** The engine's own suite proves
    // `candidates` works on hand-written packs that are correct by construction; this proves the
    // shipped Arabic data actually carries alternates and that `parseLemmas` hands them over
    // intact. 5,092 rows have them.
    const offered = msa.candidates('آخذ');
    expect(offered.length).toBeGreaterThan(1);
    expect(offered).toContain('أخذ');
  });

  it('leads every reading list with exactly what key returns', () => {
    // The ADR-0028 invariant, spot-checked on real rows of both arities. `checkPack` asserts it
    // over the sample text; this names words a human can read back.
    for (const word of ['آخذ', 'آتت', 'الحكومة', 'سوق', 'zzq']) {
      expect(msa.candidates(word)[0]).toBe(msa.key(word));
    }
  });

  it('still returns ONE reading for the ordinary word, which is 94% of the table', () => {
    // ⚠️ A multi-column format must not turn every word into a choice. 81,818 of 86,910 rows have a
    // single reading, and a picker on all of them would be a UI that means nothing.
    expect(msa.candidates('الحكومة')).toEqual(['حكومة']);
  });

  it('parses a multi-column row without corrupting the lemma', () => {
    // ⚠️ THE REGRESSION THIS FILE EXISTS FOR. `parseLemmas` took everything after the FIRST tab, so
    // a three-column row produced the lemma `"أخذ\tمؤاخذ"` — a unit key containing a tab, addressing
    // a word that does not exist, with nothing thrown and the pack reporting healthy.
    for (const word of ['آخذ', 'آتت', 'آتي']) {
      for (const reading of msa.candidates(word)) {
        expect(reading).not.toContain('\t');
        expect(reading.length).toBeGreaterThan(0);
      }
    }
  });

  it('offers only canonical readings, so any pick is a stable address', () => {
    // `candidates-not-canonical`: a reading that keys onward files the learner's own answer under
    // an address no other route to that word produces.
    for (const word of ['آخذ', 'آتت', 'آتي', 'آث']) {
      for (const reading of msa.candidates(word)) {
        expect(msa.key(reading)).toBe(reading);
      }
    }
  });
});

describe('proclitics — Luraty/luraty#206, ADR-0033', () => {
  it('does not take the relative pronoun apart', () => {
    // ⚠️ **THE DEFECT THIS ISSUE IS NAMED FOR, ASSERTED FROM THE CONSUMER SIDE.** `الذي`
    // (152,834x) was stripped to `ذي` — a rare form of `ذو`, 2,236x — which absorbed all of it
    // and sat at RANK 16 of the frequency list while `الذي` was absent from it entirely. The
    // feminine `التي` happened to have no row and sat correctly at rank 8, which is exactly why
    // the asymmetry went unnoticed.
    expect(msa.key('الذي')).toBe('الذي');
    expect(vocabulary.indexOf('الذي')).toBeGreaterThanOrEqual(0);
    expect(vocabulary.indexOf('الذي')).toBeLessThan(100);
    expect(vocabulary.indexOf('ذي')).toBeGreaterThan(1_000);
  });

  it('joins a proclitic to the word it is stuck to', () => {
    // و ب ل ف attach like ال and were never joined, so `وقال` and `قال` ranked separately and a
    // learner met the same verb twice as two units.
    expect(msa.key('وقال')).toBe('قال');
    expect(msa.key('بشكل')).toBe('شكل');
    expect(msa.key('والتي')).toBe('التي');
  });

  it('prefers the strip whose stem is commonest, not the longest clitic', () => {
    // Longest-first reads `والذي` as وال+ذي and lands back on the rare `ذي`.
    expect(msa.key('والذي')).toBe('الذي');
  });

  it('leaves ordinary words whose first letter looks like a proclitic alone', () => {
    // ⚠️ Arabic roots are three consonants, so almost any 2-3 letter remainder is also a word:
    // a naive strip reads `كان` (was) as ك+ان and `فقط` (only) as ف+قط. Measured at 12 of 20
    // controls destroyed before the lexicon guard.
    // ⚠️ The claim is "not taken apart", NOT "unmapped". `بيت` keys to `بات` through the lemma
    // table, which is a different decision and out of scope here — asserting `key(w) === w`
    // would quietly test the tiebreak instead of the join.
    for (const word of ['كان', 'لجنة', 'فقط', 'بحث', 'وقت', 'كبير', 'بيت', 'بلد']) {
      const key = msa.key(word);
      expect(key.length === word.length || !word.endsWith(key)).toBe(true);
    }
  });
});
