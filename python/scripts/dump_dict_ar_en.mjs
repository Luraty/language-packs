// Dumps the installed @luraty/dict-ar-en to src/luraty_packs/data/dict-ar-en/dictionary.json.
//
// The package ships only as generated JS and exports `lookup`, `sources` and `coverage`, but no way
// to enumerate its keys. So the key list is read from the package's own ROWS constant, and every
// meaning that lands in the dump comes back through the real `lookup`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const entry = join(here, 'node_modules/@luraty/dict-ar-en/dist/index.mjs');

const real = await import(pathToFileURL(entry).href);

const source = `${readFileSync(entry, 'utf8')}\nexport { ROWS as __ROWS };\n`;
const reopened = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const keys = new Set();
for (const line of reopened.__ROWS.split('\n')) {
  const [key, src, , ...senses] = line.split('\t');
  if (key === undefined || src === undefined || senses.length === 0) continue;
  keys.add(key);
}
const sorted = [...keys].sort();

if (sorted.length !== real.coverage.keys) {
  throw new Error(`expected ${real.coverage.keys} keys, found ${sorted.length}`);
}

const entries = sorted.map((key) => {
  const meanings = real.lookup(key);
  if (meanings.length === 0) throw new Error(`lookup returned nothing for a listed key: ${key}`);
  return JSON.stringify([key, meanings]);
});

const out = join(root, 'src/luraty_packs/data/dict-ar-en/dictionary.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `{"sources":${JSON.stringify(real.sources)},\n"coverage":${JSON.stringify(real.coverage)},\n"entries":[\n${entries.join(',\n')}\n]}\n`,
);
console.log(`dictionary.json: ${entries.length} keys`);
