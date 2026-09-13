import { msa } from '@luraty/pack-ar';
import { describe, expect, it } from 'vitest';

import { coverage, lookup, sources, type Meaning } from './index.js';

/**
 * Lookups the way the app makes them: a surface form from a pasted text, keyed by `@luraty/pack-ar`.
 *
 * ⚠️ **EVERY FIXTURE DIFFERS FROM ITS OWN KEY.** Diacritics, a proclitic, the article. A word that
 * is already its own key cannot tell a suite that looks it up raw from one that goes through
 * `pack.key()` — that is how 432 green tests once missed two wrong units in this project.
 */
const tap = (surface: string): readonly Meaning[] => {
  const key = msa.key(surface);
  expect(key).not.toBe(surface);
  return lookup(key);
};
const from = (meanings: readonly Meaning[], source: string) => meanings.find((m) => m.source === source);

describe('@luraty/dict-ar-en', () => {
  it('finds في through its diacritics', () => {
    const wikt = from(tap('فِي'), 'wiktionary-en');
    expect(wikt?.senses[0]).toBe('in, within');
    expect(wikt?.pos).toContain('prep');
  });

  it('finds من through a proclitic and diacritics', () => {
    const meanings = tap('وَمِنْ');
    expect(from(meanings, 'wiktionary-en')?.senses.join(' ')).toMatch(/\bof\b/);
    expect(from(meanings, 'wiktionary-en')?.pos).toContain('prep');
  });

  it('finds على through its diacritics', () => {
    expect(from(tap('عَلَى'), 'wiktionary-en')?.senses[0]).toBe('on, over');
  });

  it('finds كتاب through the article and a conjunction', () => {
    const meanings = tap('وَالكِتَابِ');
    expect(meanings.map((m) => m.source)).toEqual(['wiktionary-en']);
    expect(from(meanings, 'wiktionary-en')?.senses).toContain('book');
  });

  it('returns [] for a common word the dictionary lacks, rather than something near it', () => {
    // طارئ ("emergency, arising unexpectedly") is rank 779 in pack-ar and has no English Wiktionary
    // entry in the artifact. It had one only from Lane, which is not shipped (see README.md).
    const meanings = tap('الطَّارِئ');
    expect(meanings).toEqual([]);
    expect(Object.isFrozen(meanings)).toBe(true);
  });

  it('finds إلى and أرض under the hamza spelling pack-ar keys them by', () => {
    expect(from(tap('إِلَى'), 'wiktionary-en')?.senses[0]).toBe('to, towards');
    expect(from(tap('الأَرْض'), 'wiktionary-en')?.senses[0]).toBe('earth, land');
  });

  it('does NOT file a word under a different word that compare() happens to fold onto it', () => {
    // كأن ("as if") folds to كان ("was") under pack-ar's compare chain. That fold was measured and
    // rejected: no sense of كان may be "as if".
    const was = lookup('كان').flatMap((m) => m.senses);
    expect(was.length).toBeGreaterThan(0);
    expect(was.some((s) => /\bas if\b/i.test(s))).toBe(false);
  });

  it('returns an empty, frozen list for a key it does not have', () => {
    expect(lookup('zzq')).toEqual([]);
    expect(lookup('')).toEqual([]);
    expect(lookup('constructor')).toEqual([]);
    expect(lookup('__proto__')).toEqual([]);
    expect(Object.isFrozen(lookup('zzq'))).toBe(true);
  });

  it('does not normalize for you — a surface form is not a key', () => {
    expect(lookup('فِي')).toEqual([]);
  });

  it('hands back frozen meanings, so one caller cannot corrupt another', () => {
    const [first] = lookup('في');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first?.senses)).toBe(true);
  });

  it('names its one source with a licence and a URL', () => {
    expect(sources.map((s) => s.id)).toEqual(['wiktionary-en']);
    expect(sources.find((s) => s.id === 'wiktionary-en')?.licence).toBe('CC-BY-SA-4.0');
    for (const s of sources) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.built).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.provenance.length).toBeGreaterThan(0);
    }
  });

  it('says which pack its coverage was measured against', () => {
    expect(coverage.pack).toMatch(/^@luraty\/pack-ar@\d+\.\d+\.\d+$/);
    expect(coverage.vocabulary).toBe(10_000);
  });
});
