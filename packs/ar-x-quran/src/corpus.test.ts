import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { arQuran, vocabulary } from './index.js';

/**
 * ⚠️ **EVERY KEY THE PACK PRODUCES OVER THE WHOLE QUR'AN IS IN ITS OWN VOCABULARY.** This was a
 * separate tool in the app repository (`vocab:check`); it lives beside the pack now, so it runs in the
 * pack's own test lane and cannot be forgotten when the lemma table changes. Luraty/luraty#106: 1,252
 * keys — one Qur'anic word in ten — were once unlearnable while every other test passed.
 */
describe('the whole corpus', () => {
  const verses = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../corpus/verses.tsv'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => line.split('\t')[3] ?? '');

  it('is the full mushaf, not a fragment', () => {
    expect(verses.length).toBe(6348);
  });

  it('produces no key outside the vocabulary', () => {
    const have = new Set<string>(vocabulary);
    const missing = new Set<string>();
    for (const verse of verses) {
      for (const token of arQuran.split(verse)) {
        const key = arQuran.key(token);
        if (key !== '' && !have.has(key)) missing.add(key);
      }
    }
    expect([...missing].slice(0, 10)).toEqual([]);
  });
});
