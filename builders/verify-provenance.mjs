#!/usr/bin/env node
/**
 * Check every generated file under a language's `out` directory against the checksum recorded in
 * its `provenance.json`.
 *
 * ⚠️ WHY THIS MATTERS MORE THAN IT LOOKS. Two copies of these bytes exist on purpose: this repo
 * generates them, and the private Luraty repo vendors them into `@luraty/pack-de` (a pack cannot
 * ship as `.txt` — React Native has no `fs`). A one-way vendoring relationship is fine right up
 * until somebody hand-edits the copy, at which point the two diverge silently and the frequency
 * list a learner is scored against stops being the one published here.
 *
 * A recorded checksum turns that from silent into loud. It also catches the likelier accident: a
 * lemmatizer change regenerating the outputs without anyone diffing them, which is exactly how
 * `warten→waren` survived once already.
 *
 * Usage:
 *   node builders/verify-provenance.mjs
 *   node builders/verify-provenance.mjs --update   # after a DELIBERATE rebuild
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const languagesDir = join(root, 'languages');
const update = process.argv.includes('--update');

const c = { red: '[31m', yel: '[33m', grn: '[32m', dim: '[2m', off: '[0m' };

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const problems = [];
let checked = 0;
let updated = 0;

const languages = readdirSync(languagesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

for (const lang of languages) {
  const provenanceFile = join(languagesDir, lang, 'out', 'provenance.json');
  if (!existsSync(provenanceFile)) continue;

  const provenance = JSON.parse(readFileSync(provenanceFile, 'utf8'));
  let dirty = false;

  for (const [name, recorded] of Object.entries(provenance.files ?? {})) {
    const file = join(languagesDir, lang, 'out', name);
    const where = `languages/${lang}/out/${name}`;

    if (!existsSync(file)) {
      problems.push(`${where}: recorded in provenance.json but missing on disk`);
      continue;
    }

    const buffer = readFileSync(file);
    const actual = sha256(buffer);
    const rows = readFileSync(file, 'utf8').trimEnd().split('\n').length;
    checked++;

    if (actual === recorded.sha256 && rows === recorded.rows && buffer.length === recorded.bytes) {
      continue;
    }

    if (update) {
      provenance.files[name] = { sha256: actual, rows, bytes: buffer.length };
      dirty = true;
      updated++;
      console.error(
        `  ${c.yel}UPDATED${c.off} ${where} ${c.dim}${String(recorded.rows)}→${String(rows)} rows${c.off}`,
      );
      continue;
    }

    problems.push(
      `${where}: does not match provenance.json\n` +
        `      recorded  sha256 ${recorded.sha256.slice(0, 16)}…  ${String(recorded.rows)} rows  ${String(recorded.bytes)} bytes\n` +
        `      on disk   sha256 ${actual.slice(0, 16)}…  ${String(rows)} rows  ${String(buffer.length)} bytes\n` +
        `      If this was a deliberate rebuild, DIFF IT FIRST, then: make provenance-update`,
    );
  }

  if (dirty) writeFileSync(provenanceFile, `${JSON.stringify(provenance, null, 2)}\n`);
}

for (const problem of problems) console.error(`  ${c.red}FAIL${c.off} ${problem}`);

if (problems.length > 0) {
  console.error(`\n  ${c.red}${String(problems.length)} file(s) diverged.${c.off}`);
  process.exit(1);
}

if (checked === 0) {
  console.error(`  ${c.yel}WARN${c.off} no provenance.json found — nothing was verified`);
} else if (update) {
  console.error(`\n  ${c.grn}Provenance updated${c.off} ${c.dim}(${String(updated)} of ${String(checked)} file(s))${c.off}`);
} else {
  console.error(`\n  ${c.grn}Provenance OK${c.off} ${c.dim}(${String(checked)} file(s))${c.off}`);
}
