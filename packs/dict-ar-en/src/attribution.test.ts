import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sources } from './index.js';

/**
 * ⚠️ **THE DATA'S LICENCE TRAVELS WITH THE PACKAGE, OR IT DOES NOT TRAVEL AT ALL.** Every sense from
 * Wiktionary is CC BY-SA 4.0: attribution, a note of what was changed, and share-alike. `pack-ar`
 * once shipped without its ATTRIBUTION.md, and a missing file is invisible by nature.
 */
describe('attribution', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const text = readFileSync(join(root, 'ATTRIBUTION.md'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { files: string[]; license: string };

  it('publishes ATTRIBUTION.md and README.md', () => {
    for (const file of ['ATTRIBUTION.md', 'README.md', 'dist']) expect(pkg.files).toContain(file);
  });

  it('names every source, its licence and its URL', () => {
    for (const s of sources) {
      expect(text).toContain(s.url);
      expect(s.licence).toBe('CC-BY-SA-4.0');
      expect(text).toContain('CC BY-SA 4.0');
    }
  });

  it('states the share-alike obligation, the changes, and that nothing was reviewed', () => {
    expect(text).toMatch(/share-alike/i);
    expect(text).toMatch(/creativecommons\.org\/licenses\/by-sa\/4\.0/);
    expect(text).toMatch(/re-keyed/i);
    expect(text).toMatch(/truncated/i);
    expect(text).toMatch(/unreviewed/i);
  });

  it('records why Lane is not shipped, so the next build does not quietly add it back', () => {
    expect(text).toMatch(/Deferred: Lane's Lexicon/);
    expect(text).toMatch(/GPL-3\.0/);
  });

  it('declares the data licence in package.json, not only the code licence', () => {
    expect(pkg.license).toBe('MIT AND CC-BY-SA-4.0');
  });
});
