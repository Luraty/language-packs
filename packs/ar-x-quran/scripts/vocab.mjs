#!/usr/bin/env node
/**
 * Regenerate `frequency.txt` from the pack's own `key()` over the whole Qur'an.
 *
 * ⚠️ **THE WORD LIST IS DERIVED, NOT AUTHORED (Luraty/luraty#106).** Before this, 1,252 keys that
 * `key()` produced — 10.3% of running tokens — were absent from the vocabulary, and a word outside the
 * vocabulary can never be introduced, proven or known. Ranking the pack's own keys over the corpus
 * makes the two agree by construction. `src/corpus.test.ts` is the proof and runs with `npm test`.
 *
 *   npm run vocab:write && npm run generate && npm run check
 *
 * Bundled with esbuild first because the pack is TypeScript source with `.js` import specifiers.
 */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'pack-vocab-')), 'pack.mjs');
await build({ entryPoints: [join(root, 'src/index.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { arQuran } = await import(pathToFileURL(out).href);

const counts = new Map();
for (const line of readFileSync(join(root, 'corpus/verses.tsv'), 'utf8').trim().split('\n')) {
  const text = line.split('\t')[3];
  if (text === undefined) continue;
  for (const token of arQuran.split(text)) {
    const key = arQuran.key(token);
    if (key !== '') counts.set(key, (counts.get(key) ?? 0) + 1);
  }
}
// Ties broken by the key, so the list is identical however the corpus file happens to be ordered.
const ranked = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([key]) => key);

if (process.argv.includes('--write')) {
  writeFileSync(join(root, 'frequency.txt'), `${ranked.join('\n')}\n`, 'utf8');
  console.log(`wrote ${ranked.length} lemmas — now run: npm run generate && npm run check`);
} else {
  console.log(`${ranked.length} distinct keys over the corpus`);
}
