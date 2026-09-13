#!/usr/bin/env node
/**
 * Why does coverage stall at ~88%? Categorise every unknown token instead of guessing.
 *
 * The coverage curve says a 10,000-lemma pack covers 88% of held-out news and 82% of Wikipedia,
 * against a literature anchor of ~98%. "Proper nouns and rare words" is a plausible story; this
 * turns it into counts.
 *
 * Categories are decided on the ORIGINAL text, before the pack lowercases anything — capitalisation
 * is the only signal German gives you for proper nouns, and `normalize` throws it away.
 *
 * Usage:
 *   node packs/de/build/diagnose-gap.mjs <sentences.txt> [--pack packs/de] [--top 40]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const engineDir = join(root, 'engine');
const args = process.argv.slice(2);
const packDir = args.includes('--pack') ? args[args.indexOf('--pack') + 1] : join(root, 'packs/de');
const top = args.includes('--top') ? Number(args[args.indexOf('--top') + 1]) : 30;
const textFile = args.find((a) => !a.startsWith('--') && a !== packDir && a !== String(top));

if (!textFile || !existsSync(textFile)) {
  console.error('usage: diagnose-gap.mjs <held-out-text> [--pack packs/de]');
  process.exit(2);
}

const lines = readFileSync(textFile, 'utf8').split('\n');
const sentences = lines.map((line) => {
  const tab = line.indexOf('\t');
  return tab >= 0 ? line.slice(tab + 1) : line;
});

const config = JSON.parse(readFileSync(join(packDir, 'pack.config.json'), 'utf8'));
const frequency = readFileSync(join(packDir, 'frequency.txt'), 'utf8');
const lemmas = {};
for (const line of readFileSync(join(packDir, 'lemmas.tsv'), 'utf8').split('\n')) {
  const [form, lemma] = line.split('\t');
  if (form && lemma) lemmas[form.trim()] = lemma.trim();
}

const outDir = join(engineDir, 'reports', 'diagnose');
mkdirSync(outDir, { recursive: true });
const entry = join(outDir, 'diag.ts');

writeFileSync(
  entry,
  `import { createPack } from '../../src/index.js';\n` +
    `const CONFIG = ${JSON.stringify(config)} as never;\n` +
    `const FREQUENCY = ${JSON.stringify(frequency)};\n` +
    `const LEMMAS = ${JSON.stringify(lemmas)};\n` +
    `const SENTENCES = ${JSON.stringify(sentences)};\n` +
    `const built = createPack(CONFIG, { frequency: FREQUENCY, lemmas: LEMMAS });\n` +
    `if (!built.ok) throw new Error(built.error.message);\n` +
    `const pack = built.value;\n` +
    `const rows: string[] = [];\n` +
    `for (const sentence of SENTENCES) {\n` +
    `  const surfaces = pack.split(sentence);\n` +
    `  surfaces.forEach((surface, i) => {\n` +
    `    const key = pack.key(surface);\n` +
    `    const ranked = pack.rank(key) !== undefined;\n` +
    `    const analysed = Object.prototype.hasOwnProperty.call(LEMMAS, key) ? '1' : '0';\n` +
    `    rows.push([surface, key, ranked ? '1' : '0', i === 0 ? '1' : '0', analysed].join('\\u0001'));\n` +
    `  });\n` +
    `}\n` +
    `console.log(rows.join('\\n'));\n`,
);

const bundle = join(outDir, 'diag.js');
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning'],
  { cwd: engineDir, stdio: 'inherit' },
);
const raw = execFileSync(process.execPath, [bundle], { encoding: 'utf8', maxBuffer: 256e6 });

// ── Categorise ──────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ BY CAUSE, NOT BY SPELLING. A first version bucketed "lowercase with no umlaut" as "often
// English" and reported 20% of the gap that way. The examples were `eintraf`, `ankam`, `zurückkam`,
// `mitverantwortlich` — separable-verb pasts and derived adjectives, all plainly German. The label
// was wrong and it pointed at the wrong fix.
//
// What matters is whether the pack could have resolved the token and did not: is it a name (no list
// will ever hold it), or is it a German word whose LEMMA the table is missing (fixable)?
const buckets = new Map();
const examples = new Map();
let total = 0;
let known = 0;

function bucket(name, surface) {
  buckets.set(name, (buckets.get(name) ?? 0) + 1);
  const seen = examples.get(name) ?? new Map();
  seen.set(surface, (seen.get(surface) ?? 0) + 1);
  examples.set(name, seen);
}

for (const line of raw.split('\n')) {
  if (line.length === 0) continue;
  const [surface, , ranked, sentenceInitial, analysed] = line.split('\u0001');
  total++;
  if (ranked === '1') {
    known++;
    continue;
  }

  // Order matters: the first matching rule wins, most-certain first.
  if (surface.length === 1) bucket('single letter / initial', surface);
  else if (/^[A-ZÄÖÜ]{2,}$/.test(surface)) bucket('acronym (ALL CAPS)', surface);
  else if (analysed === '1')
    // The table HAS a lemma for this, and the lemma is not in the top 10k. Fixable by a longer list.
    bucket('lemma known, but outside the top 10k', surface);
  else if (/^[A-ZÄÖÜ]/.test(surface) && sentenceInitial === '0')
    // German capitalises every noun, so this is only a signal away from sentence start — and it
    // still catches ordinary nouns. It is an UPPER BOUND on proper nouns, not a count of them.
    bucket('capitalised mid-sentence (name or noun)', surface);
  else bucket('unanalysed German word (lemma table gap)', surface);
}

const unknown = total - known;
console.log('');
console.log(`  ${textFile.split('/').pop()} — ${String(total)} running tokens`);
console.log(`  known ${String(known)} (${((100 * known) / total).toFixed(1)}%), unknown ${String(unknown)}`);
console.log('');
console.log('  category                                    tokens   % of all   % of gap');
console.log('  ────────────────────────────────────────  ────────  ─────────  ─────────');
for (const [name, n] of [...buckets.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(
    `  ${name.padEnd(40)}  ${String(n).padStart(8)}  ${((100 * n) / total).toFixed(2).padStart(8)}%  ${((100 * n) / unknown).toFixed(1).padStart(8)}%`,
  );
}
console.log('');
for (const [name, seen] of examples) {
  const list = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  const once = [...seen.values()].filter((n) => n === 1).length;
  console.log(`  ${name} — ${String(seen.size)} types, ${String(once)} seen once`);
  console.log(`    ${list.map(([w, n]) => `${w}${n > 1 ? `·${String(n)}` : ''}`).join('  ')}`);
  console.log('');
}
