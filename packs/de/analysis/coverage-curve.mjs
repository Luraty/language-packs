#!/usr/bin/env node
/**
 * Measure the coverage curve: what fraction of running tokens does a learner who knows the top N
 * lemmas actually understand?
 *
 * ⚠️ THIS IS THE STEP THAT IS EASY TO SKIP AND SHOULD NOT BE.
 *
 * ADR-0003 invariant 1 anchors on "~4,000–5,000 word families ≈ 95% written coverage, ~8,000 ≈ 98%"
 * — from the literature, on somebody else's corpus, with somebody else's definition of a word
 * family. Nobody has ever checked it against THIS pack, THIS tokenizer and THIS lemma table. Until
 * someone does, the band the whole engine is calibrated against is a number we inherited.
 *
 * The test text must be HELD OUT — text the frequency list was not built from — or this measures
 * memorisation rather than coverage.
 *
 * Usage:
 *   node packs/de/build/coverage-curve.mjs <sentences.txt> [--pack packs/de]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const engineDir = join(root, 'engine');
const args = process.argv.slice(2);
const packDir = args.includes('--pack') ? args[args.indexOf('--pack') + 1] : join(root, 'packs/de');
const textFile = args.find((a) => !a.startsWith('--') && a !== packDir);

if (!textFile || !existsSync(textFile)) {
  console.error('usage: coverage-curve.mjs <held-out-text> [--pack packs/de]');
  process.exit(2);
}

// Leipzig sentence files are `id <TAB> sentence`. Plain text works too.
const text = readFileSync(textFile, 'utf8')
  .split('\n')
  .map((line) => {
    const tab = line.indexOf('\t');
    return tab >= 0 ? line.slice(tab + 1) : line;
  })
  .join(' ');

const config = JSON.parse(readFileSync(join(packDir, 'pack.config.json'), 'utf8'));
const frequency = readFileSync(join(packDir, 'frequency.txt'), 'utf8');
const lemmas = {};
for (const line of readFileSync(join(packDir, 'lemmas.tsv'), 'utf8').split('\n')) {
  const [form, lemma] = line.split('\t');
  if (form && lemma) lemmas[form.trim()] = lemma.trim();
}

/**
 * A HOST-SIDE guess at which surfaces are not vocabulary.
 *
 * ⚠️ It lives here and not in the engine, and that placement is the point. German capitalises EVERY
 * noun, so "capitalised and unknown" catches `Rezession` as readily as `Toyota` — a pack-level rule
 * would hand a learner credit for not knowing ordinary German. Arabic settles the argument: it has
 * no letter case at all, so no token-level rule exists there even in principle.
 *
 * A real host uses an editor or an NER pass. This is a crude stand-in whose only job is to put a
 * NUMBER on the question, and its bias is stated: it over-counts, because a capitalised German noun
 * outside the top 10k really might be vocabulary.
 */
function guessNotVocabulary(text, isKnown) {
  const found = new Set();
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const tokens = [...sentence.matchAll(/[A-Za-zÄÖÜäöüß]+/g)];
    tokens.forEach((m, i) => {
      const w = m[0];
      if (w.length === 1) return found.add(w);
      if (/^[A-ZÄÖÜ]{2,}$/.test(w)) return found.add(w);
      // Capitalised, NOT sentence-initial, and not a word the pack knows.
      if (i > 0 && /^[A-ZÄÖÜ]/.test(w) && !isKnown(w)) found.add(w);
    });
  }
  return [...found];
}

const words = frequency.split(/\s+/).filter(Boolean);
const ignoreNames = args.includes('--ignore-names');
const SIZES = [500, 1000, 2000, 3000, 5000, 8000, 10000].filter((n) => n <= words.length);

// The pack's own lexicon, as a plain set, so the host-side guess can ask "does the pack know this?"
// without needing the engine.
const lexicon = new Set(words);
const lemmaOf = new Map(Object.entries(lemmas));
const packKnows = (w) => {
  const lower = w.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  return lexicon.has(lower) || lexicon.has(lemmaOf.get(lower) ?? '');
};
const ignoreList = ignoreNames ? guessNotVocabulary(text, packKnows) : [];
if (ignoreNames) console.error(`  treating ${String(ignoreList.length)} surfaces as not-vocabulary`);

const outDir = join(engineDir, 'reports', 'coverage-curve');
mkdirSync(outDir, { recursive: true });
const entry = join(outDir, 'curve.ts');

writeFileSync(
  entry,
  `import { createPack, coverage, record, createProfile, unitKey, variety } from '../../src/index.js';\n` +
    `import type { Evidence, Day } from '../../src/index.js';\n` +
    `const CONFIG = ${JSON.stringify(config)} as never;\n` +
    `const FREQUENCY = ${JSON.stringify(frequency)};\n` +
    `const LEMMAS = ${JSON.stringify(lemmas)};\n` +
    `const TEXT = ${JSON.stringify(text)};\n` +
    `const SIZES = ${JSON.stringify(SIZES)};\n` +
    `const IGNORE: string[] = ${JSON.stringify(ignoreList)};\n` +
    `const built = createPack(CONFIG, { frequency: FREQUENCY, lemmas: LEMMAS });\n` +
    `if (!built.ok) throw new Error(built.error.message);\n` +
    `const pack = built.value;\n` +
    `const v = variety('de');\n` +
    `if (v === undefined) throw new Error('bad variety');\n` +
    `const words = FREQUENCY.split(/\\s+/).filter((w: string) => w.length > 0);\n` +
    `for (const size of SIZES) {\n` +
    `  const evidence: Evidence[] = [];\n` +
    `  for (const w of words.slice(0, size)) {\n` +
    `    const unit = unitKey('recognise', v, pack.key(w));\n` +
    `    evidence.push({ unit, outcome: 'known', tested: true, day: 0 as Day });\n` +
    `    evidence.push({ unit, outcome: 'known', tested: true, day: 1 as Day });\n` +
    `  }\n` +
    `  const profile = record(createProfile('de', 2 as Day), evidence);\n` +
    `  const c = coverage(profile, pack, { text: TEXT, variety: v, direction: 'recognise', ignore: IGNORE });\n` +
    `  if (c.kind !== 'measured') { console.log(JSON.stringify({ size, kind: c.kind })); continue; }\n` +
    `  console.log(JSON.stringify({ size, tokens: c.runningTokens, known: c.knownTokens, ignored: c.ignoredTokens, band: c.band, pct: (100 * c.knownTokens) / c.runningTokens }));\n` +
    `}\n`,
);

const bundle = join(outDir, 'curve.js');
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning'],
  { cwd: engineDir, stdio: 'inherit' },
);

const out = execFileSync(process.execPath, [bundle], { encoding: 'utf8', maxBuffer: 64e6 });

console.log('');
console.log('  known lemmas    coverage of held-out text        band');
console.log('  ────────────  ──────────────────────────────  ──────────');
for (const line of out.trim().split('\n')) {
  if (!line) continue;
  const r = JSON.parse(line);
  if (r.pct === undefined) {
    console.log(`  ${String(r.size).padStart(6)}        ${r.kind}`);
    continue;
  }
  const filled = Math.round((r.pct / 100) * 22);
  console.log(
    `  ${String(r.size).padStart(6)}        ${'█'.repeat(filled)}${'·'.repeat(22 - filled)} ` +
      `${r.pct.toFixed(1)}%   ${r.band}`,
  );
}
console.log('');
console.log(`  held-out text: ${textFile.split("/").pop()}`);
