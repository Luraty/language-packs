import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * ⚠️ **THE DATA'S LICENCE TRAVELS WITH THE PACKAGE, OR IT DOES NOT TRAVEL AT ALL.** `frequency.txt`
 * derives from CC BY sources, and attribution is the one thing CC BY asks for. The app repository
 * used to fail a pack with no `ATTRIBUTION.md` (`scripts/check-packs.mjs`, found after `pack-ar`
 * shipped without one); that check went with the packs when they moved here, so it lives here now.
 */
describe('attribution', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');

  it('has a non-empty ATTRIBUTION.md that names a licence', () => {
    const text = readFileSync(join(root, 'ATTRIBUTION.md'), 'utf8');
    expect(text).toMatch(/CC BY|CC0/);
  });

  it('publishes ATTRIBUTION.md and the data files it describes', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { files: string[] };
    for (const file of ['ATTRIBUTION.md', 'frequency.txt', 'lemmas.tsv']) expect(pkg.files).toContain(file);
  });
});
