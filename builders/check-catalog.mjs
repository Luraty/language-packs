#!/usr/bin/env node
/**
 * The corpus catalogue checker.
 *
 * ⚠️ WHY THE RESEARCH IS A JSON FILE AND NOT A DOCUMENT.
 *
 * `catalog/corpora.json` records where the next corpus comes from and what it costs. A markdown
 * page saying the same thing would rot in the ordinary way: somebody adds a source to
 * `languages/xx/sources.json` with a licence that contradicts the page, and nothing notices,
 * because a page cannot notice. This repo has already learned that lesson once — the German pack's
 * attribution file said "Confirm the current terms before shipping" in prose, and prose does not
 * block a publish.
 *
 * So the catalogue is checkable, and every source names the catalogue entry it came from:
 *
 *   - a `catalogId` that is not in the catalogue is an error
 *   - a source licence that disagrees with its catalogue entry is an error, in BOTH directions —
 *     whichever is wrong, they cannot both be right
 *   - a catalogue licence the gate does not recognise is an error, so the catalogue cannot record
 *     a source that could never be adopted
 *
 * The second arm is the one that earns the file. Reading `UD_Arabic-PADT`'s licence and finding
 * CC BY-NC-SA 3.0 is only useful if the finding survives contact with whoever later adds it to
 * `languages/ar/sources.json` as "CC-BY-SA-4.0, close enough".
 *
 * Usage:
 *   node builders/check-catalog.mjs
 *   node builders/check-catalog.mjs --candidates de   # what could fill this language's gaps
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KNOWN_LICENCES,
  LICENCES,
  REGISTERS,
  SPOKEN_PROXY,
  isTextRegister,
} from './licences.mjs';

const args = process.argv.slice(2);
const candidatesIndex = args.indexOf('--candidates');
const candidatesFor = candidatesIndex >= 0 ? args[candidatesIndex + 1] : undefined;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogFile = join(root, 'catalog', 'corpora.json');
const languagesDir = join(root, 'languages');

const c = { red: '[31m', yel: '[33m', grn: '[32m', dim: '[2m', off: '[0m' };

const errors = [];
const warnings = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

if (!existsSync(catalogFile)) {
  console.error('no catalog/corpora.json');
  process.exit(2);
}

const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
const entries = new Map();

for (const [index, entry] of (catalog.entries ?? []).entries()) {
  const at = `catalog/corpora.json entries[${String(index)}]`;

  for (const field of ['id', 'name', 'kind', 'homepage', 'verdict', 'note']) {
    if (typeof entry[field] !== 'string' || entry[field].length === 0) {
      fail(at, `"${field}" must be a non-empty string`);
    }
  }
  if (typeof entry.licenceVerified !== 'boolean') {
    fail(at, `"licenceVerified" must be an explicit true or false, not ${JSON.stringify(entry.licenceVerified)}`);
  }
  if (entry.licenceVerified === true && typeof entry.verifiedOn !== 'string') {
    fail(at, '"licenceVerified": true requires a "verifiedOn" date');
  }
  if (entry.licenceVerified === false && entry.verifiedOn !== null) {
    fail(at, '"licenceVerified": false requires "verifiedOn": null');
  }

  // `null` is a legitimate value and NOT the same as a guess. It means the terms are genuinely
  // unresolved — FrequencyWords is the live example: an MIT repository LICENSE that probably covers
  // the code, and a secondary claim of CC BY-SA on the content. Writing either one down would be
  // inventing a fact.
  if (entry.licence !== null && !(entry.licence in LICENCES)) {
    fail(at, `unknown licence ${JSON.stringify(entry.licence)}. Known: ${KNOWN_LICENCES}`);
  }

  if (!Array.isArray(entry.registers) || entry.registers.length === 0) {
    fail(at, '"registers" must list at least one register');
  } else {
    for (const register of entry.registers) {
      if (!REGISTERS.has(register)) {
        fail(at, `register ${JSON.stringify(register)} is not one of ${[...REGISTERS].join(', ')}`);
      }
    }
  }

  if (typeof entry.id === 'string') {
    if (entries.has(entry.id)) fail(at, `duplicate catalogue id ${JSON.stringify(entry.id)}`);
    entries.set(entry.id, entry);
  }
}

// ── cross-check against what the languages actually use ────────────────────────────────────────

const languages = readdirSync(languagesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(languagesDir, e.name, 'sources.json')))
  .map((e) => e.name)
  .sort();

/** catalogue id -> [language codes that use it]. Derived, never stored — a stored list drifts. */
const adopted = new Map();

for (const lang of languages) {
  const doc = JSON.parse(readFileSync(join(languagesDir, lang, 'sources.json'), 'utf8'));
  const where = `languages/${lang}/sources.json`;

  for (const [index, source] of (doc.sources ?? []).entries()) {
    const at = `${where} sources[${String(index)}]`;

    // A hand-written source has no upstream, so it has nothing to point at.
    if (source.register === 'hand-written') continue;

    if (source.catalogId === undefined) {
      warn(at, 'no "catalogId" — the source is not traceable to catalog/corpora.json');
      continue;
    }

    const entry = entries.get(source.catalogId);
    if (!entry) {
      fail(at, `"catalogId" is ${JSON.stringify(source.catalogId)}, which is not in catalog/corpora.json`);
      continue;
    }

    adopted.set(source.catalogId, [...(adopted.get(source.catalogId) ?? []), lang]);

    // ⚠️ THE ARM THAT EARNS THE FILE. Two records of one upstream's terms that disagree means one
    // of them is wrong, and neither file knows which. Stopping is the only honest response.
    if (entry.licence !== null && source.licence !== entry.licence) {
      fail(
        at,
        `licence ${JSON.stringify(source.licence)} disagrees with catalogue entry ` +
          `${JSON.stringify(entry.id)}, which records ${JSON.stringify(entry.licence)}. ` +
          `One of the two is wrong — read the upstream terms and fix both.`,
      );
    }

    if (entry.licence === null && source.licenceVerified === true) {
      fail(
        at,
        `claims verification, but catalogue entry ${JSON.stringify(entry.id)} records the terms as ` +
          `unresolved (licence: null). Settle the catalogue entry first.`,
      );
    }

    if (source.register !== undefined && !entry.registers.includes(source.register)) {
      warn(
        at,
        `register ${JSON.stringify(source.register)} is not among the catalogue entry's ` +
          `(${entry.registers.join(', ')}) — one of the two is mis-tagged`,
      );
    }
  }
}

// ── --candidates ───────────────────────────────────────────────────────────────────────────────

if (candidatesFor !== undefined) {
  const file = join(languagesDir, candidatesFor, 'sources.json');
  if (!existsSync(file)) {
    console.error(`no languages/${candidatesFor}/sources.json`);
    process.exit(2);
  }
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const have = new Set(
    (doc.sources ?? []).map((s) => s.register).filter((r) => isTextRegister(r)),
  );
  const used = new Set((doc.sources ?? []).map((s) => s.catalogId).filter(Boolean));

  console.error(`\n  ${doc.name ?? candidatesFor} — registers in use: ${[...have].sort().join(', ') || 'none'}`);
  if (![...have].some((r) => SPOKEN_PROXY.has(r))) {
    console.error(`  ${c.yel}No spoken-proxy register.${c.off} ${c.dim}That is the gap worth closing first.${c.off}`);
  }

  console.error(`\n  Catalogue entries that would add a register this language lacks:\n`);
  let shown = 0;
  for (const entry of entries.values()) {
    if (used.has(entry.id)) continue;
    const adds = entry.registers.filter((r) => isTextRegister(r) && !have.has(r));
    if (adds.length === 0) continue;
    shown++;

    const terms = entry.licence === null ? null : LICENCES[entry.licence];
    const cost =
      entry.licence === null
        ? `${c.yel}licence UNRESOLVED${c.off}`
        : terms.noDerivatives
          ? `${c.red}${entry.licence} — no-derivatives, unusable${c.off}`
          : terms.nonCommercial
            ? `${c.red}${entry.licence} — non-commercial, contaminates${c.off}`
            : terms.shareAlike
              ? `${c.yel}${entry.licence} — share-alike, contaminates a CC BY output${c.off}`
              : `${c.grn}${entry.licence}${c.off}`;

    console.error(`  ${entry.id}`);
    console.error(`    adds     ${adds.join(', ')}`);
    console.error(`    licence  ${cost}`);
    console.error(`    ${c.dim}${entry.verdict}${c.off}\n`);
  }
  if (shown === 0) console.error(`  ${c.dim}none — every catalogued register is already covered${c.off}\n`);
}

// ── report ─────────────────────────────────────────────────────────────────────────────────────

for (const message of warnings) console.error(`  ${c.yel}WARN${c.off} ${message}`);
for (const message of errors) console.error(`  ${c.red}FAIL${c.off} ${message}`);

if (errors.length > 0) {
  console.error(`\n  ${c.red}${String(errors.length)} problem(s).${c.off}`);
  process.exit(1);
}

const unread = [...entries.values()].filter((e) => !e.licenceVerified).length;
console.error(
  `\n  ${c.grn}Catalogue OK${c.off} ${c.dim}(${String(entries.size)} entries, ` +
    `${String(adopted.size)} adopted, ${String(unread)} with unread terms)${c.off}`,
);
