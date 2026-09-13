import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { de, frequency, selfCheck, vocabulary } from './index.js';
import { FREQUENCY, LEMMA_ROWS } from './data.generated.js';

/**
 * ⚠️ THE TEST THAT MAKES THE MODULE-LOAD THROW UNREACHABLE.
 *
 * `index.ts` throws if `createPack` fails, rather than exporting a `Decoded<>` that every host must
 * unwrap for a failure that cannot happen. "Cannot happen" is only true if something checks — and a
 * module that throws at LOAD is exactly the failure this repo already learned about the hard way
 * (fifteen mutants scored as *survived* because a fixture threw before any test ran).
 *
 * So: this file asserts the shipped data builds, passes the engine's own conformance checks, and is
 * still in sync with the source files it was generated from.
 *
 * @module
 */

describe('the shipped pack', () => {
  it('builds — if this fails, importing the package throws', () => {
    expect(de.id).toBe('de');
    expect(vocabulary.length).toBeGreaterThan(9000);
    expect(frequency.length).toBeGreaterThan(90_000);
  });

  it('passes the engine conformance checks on real German', () => {
    expect(selfCheck(readFileSync(new URL('../sample.txt', import.meta.url), 'utf8'))).toEqual([]);
  });

  it('keys inflections back to their lemma', () => {
    expect(de.key('Häuser')).toBe(de.key('Haus'));
    expect(de.key('ging')).toBe(de.key('gehen'));
  });

  it('orders the vocabulary commonest first', () => {
    // `die` is absent because it KEYS to `der` — the dedup is by lemma, not by surface, which is
    // the whole point of the canonical form.
    expect(vocabulary.slice(0, 3)).toEqual([de.key('der'), de.key('und'), de.key('ein')]);
    expect(de.key('die')).toBe(de.key('der'));
    expect(new Set(vocabulary).size).toBe(vocabulary.length);
  });

  it('is still in sync with the source data files', () => {
    // The generated module is checked in so `npm install` is the only step a consumer runs. That is
    // only safe if drift is caught — otherwise the package silently ships yesterday's German.
    expect(FREQUENCY).toBe(readFileSync(new URL('../frequency.txt', import.meta.url), 'utf8').trim());
    expect(LEMMA_ROWS).toBe(readFileSync(new URL('../lemmas.tsv', import.meta.url), 'utf8').trim());
  });
});
