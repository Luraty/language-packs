// Build the data module for @luraty/dict-ar-en from the English Wiktionary artifact in
// `languages/fusha/out/`, re-keyed against the INSTALLED @luraty/pack-ar.
//
// Pure: reads files, returns the module text and the measurements. `generate.mjs` writes it;
// `src/data.test.ts` rebuilds it and asserts the checked-in module is byte-identical.
//
// ⚠️ **ONE SOURCE, ON PURPOSE.** Lane's Lexicon was built here and removed before the first publish
// (founder decision, 2026-09-13): its digital copy comes from a GPL-3.0 software repository that
// states no licence for the data. See ATTRIBUTION.md, "Deferred: Lane's Lexicon", and README.md for
// what the Lane build measured. Do not read `dictionary.lane.json` from here. `SOURCE_IDS` stays an
// array so a second source is an addition, not an API break.
//
// ⚠️ **THE JOIN TARGET IS `pack.key()`, NOT THE LEXICON THE ARTIFACT WAS FILTERED AGAINST.** The
// artifact was built against `languages/fusha/out/lemmas.tsv` (208,052 rows), which is not the
// table `@luraty/pack-ar@0.1.0` ships (192,255 rows). The app keys a tapped word with the pack it
// actually installed, so an entry is only reachable if its key is a key THAT pack produces.
//
// ⚠️ **WHAT WAS TRIED TO RAISE THE JOIN, AND WHY NONE OF IT IS HERE.** Measured 2026-09-13 against
// pack-ar 0.1.0 (see README.md for the numbers):
//
//   - pack-ar's own normalize chain over the dictionary keys: +0 entries. The artifact was already
//     normalized with the same strip, so there is nothing left for it to do.
//   - folding alef/hamza and ة/ى the way pack-ar's `compare` does, taking the unique match: +324
//     entries, and they are WRONG ONES — كأن→كان ("as if" filed under "was"),
//     أشعار→إشعار ("poems" under "notification"), أب→آب ("father" under "August"). `compare` folds those because
//     it grades a typed answer; `key` keeps them apart because they are different words. Rejected.
//   - `pack.key(dictionaryKey)` where it lands on a different reachable key AND `compare` says the two
//     are the same spelling: +77 entries, +0.0 points of coverage, and it files
//     علي ("Ali") under على ("on") and آثار ("traces") under أثار. Rejected.
//   - `pack.key(dictionaryKey)` alone: القاهرة ("Cairo") under قهر ("to subdue"). Rejected.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = join(here, '..');
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
const ARTIFACTS = join(REPO_ROOT, 'languages', 'fusha', 'out');

/** Source order is display order. */
export const SOURCE_IDS = ['wiktionary-en'];

/** Hand-written metadata. What the artifact itself records (provenance, built) is read from it. */
const SOURCE_META = {
  'wiktionary-en': {
    name: 'English Wiktionary (Arabic entries), extracted by Wiktextract via kaikki.org',
    licence: 'CC-BY-SA-4.0',
    url: 'https://en.wiktionary.org/',
    maxChars: 200,
  },
};

/** ≤5 per source per key, per the package contract. */
export const MAX_SENSES = 5;

/** Engine's `isArabicDiacritic` (U+064B–U+0655, U+0670, U+06D6–U+06ED) plus tatweel. */
const MARKS = /[ً-ٰٕـۖ-ۭ]/gu;
const normalize = (s) => s.replace(MARKS, '');

/** Collapse whitespace and cut at a word boundary, marking the cut. */
function trim(sense, maxChars) {
  let s = sense.replace(/\s+/g, ' ').trim();
  if (s.length <= maxChars) return s;
  s = s.slice(0, maxChars - 1);
  const space = s.lastIndexOf(' ');
  if (space > maxChars / 2) s = s.slice(0, space);
  return s.replace(/[\s,;:.·…=_-]+$/u, '') + '…';
}

function cleanSense(id, raw) {
  const s = raw.replace(/\s+/g, ' ').trim();
  // ⚠️ No Latin letter means no English: a sense that is only Arabic is not a meaning for this reader.
  if (!/[A-Za-z]/.test(s)) return undefined;
  return trim(s, SOURCE_META[id].maxChars);
}

/** Load the installed pack-ar and the set of keys it can produce for a word. */
export async function loadPack() {
  const packDir = join(PACKAGE_ROOT, 'node_modules', '@luraty', 'pack-ar');
  const { msa, vocabulary } = await import(join(packDir, 'dist', 'index.mjs'));
  const { version } = JSON.parse(readFileSync(join(packDir, 'package.json'), 'utf8'));
  const reachable = new Set(vocabulary);
  for (const line of readFileSync(join(packDir, 'lemmas.tsv'), 'utf8').split('\n')) {
    for (const lemma of line.split('\t').slice(1)) if (lemma) reachable.add(msa.key(lemma));
  }
  // A key is only an address if keying it again returns it. Measured 0 exceptions; enforced anyway.
  for (const k of reachable) if (msa.key(k) !== k) reachable.delete(k);
  return { msa, vocabulary, version, reachable };
}

export function readArtifact(id) {
  return JSON.parse(readFileSync(join(ARTIFACTS, `dictionary.${id}.json`), 'utf8'));
}

const pctOf = (hit, list) => list.filter((k) => hit.has(k)).length;

/** Build everything. Returns the module text, the rows, and before/after measurements. */
export async function build() {
  const { vocabulary, version, reachable } = await loadPack();
  const top1000 = vocabulary.slice(0, 1000);

  /** key -> source -> { senses: string[], pos: string[] } */
  const table = new Map();
  const stats = {};
  const sources = [];

  for (const id of SOURCE_IDS) {
    const artifact = readArtifact(id);
    if (artifact.id !== id) throw new Error(`dictionary.${id}.json says it is "${artifact.id}"`);
    const baseline = new Set(Object.keys(artifact.entries).map(normalize));
    let droppedSenses = 0;

    for (const [key, entry] of Object.entries(artifact.entries)) {
      const target = normalize(key);
      if (!reachable.has(target)) continue;
      for (const raw of entry.senses) {
        const sense = cleanSense(id, raw);
        if (sense === undefined) {
          droppedSenses++;
          continue;
        }
        const bySource = table.get(target) ?? table.set(target, new Map()).get(target);
        const slot = bySource.get(id) ?? bySource.set(id, { senses: [], pos: [] }).get(id);
        if (slot.senses.length < MAX_SENSES && !slot.senses.includes(sense)) slot.senses.push(sense);
        for (const p of entry.pos ?? []) {
          // The row format separates parts of speech with a comma and fields with a tab.
          if (/[,\t\n]/.test(p)) throw new Error(`part of speech "${p}" for ${target} cannot be encoded`);
          if (p && !slot.pos.includes(p)) slot.pos.push(p);
        }
      }
    }

    const has = new Set([...table].filter(([, m]) => m.has(id)).map(([k]) => k));
    stats[id] = {
      entries: has.size,
      senses: [...has].reduce((n, k) => n + table.get(k).get(id).senses.length, 0),
      top10000: pctOf(has, vocabulary),
      top1000: pctOf(has, top1000),
      before: { top10000: pctOf(baseline, vocabulary), top1000: pctOf(baseline, top1000) },
      droppedSenses,
    };
    sources.push({
      id,
      name: SOURCE_META[id].name,
      licence: SOURCE_META[id].licence,
      url: SOURCE_META[id].url,
      provenance: artifact.provenance,
      built: artifact.built,
    });
  }

  const any = new Set(table.keys());
  const coverage = {
    pack: `@luraty/pack-ar@${version}`,
    vocabulary: vocabulary.length,
    top: top1000.length,
    keys: any.size,
    sources: Object.fromEntries(
      SOURCE_IDS.map((id) => [
        id,
        { entries: stats[id].entries, senses: stats[id].senses, vocabulary: stats[id].top10000, top: stats[id].top1000 },
      ]),
    ),
    any: { vocabulary: pctOf(any, vocabulary), top: pctOf(any, top1000) },
  };

  // One line per (key, source): key TAB source TAB pos,pos TAB sense TAB sense …
  // Sorted by key (code points) then source order, so a rebuild diffs cleanly.
  const rows = [];
  for (const key of [...table.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    for (const id of SOURCE_IDS) {
      const slot = table.get(key).get(id);
      if (!slot || slot.senses.length === 0) continue;
      rows.push([key, id, slot.pos.join(','), ...slot.senses].join('\t'));
    }
  }

  return { module: render(sources, coverage, rows), sources, coverage, stats, rows };
}

// Backticks, backslashes and `${` are the only sequences that can break a template literal.
const lit = (s) => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';

function render(sources, coverage, rows) {
  return `// GENERATED by scripts/generate.mjs — do not edit. Run \`npm run generate\` to rebuild from
// languages/fusha/out/dictionary.wiktionary-en.json. \`src/data.test.ts\` fails if this drifts.

export const SOURCES = ${JSON.stringify(sources, null, 2)} as const;

export const COVERAGE = ${JSON.stringify(coverage, null, 2)} as const;

/** key TAB source TAB pos,pos TAB sense TAB sense … — one line per (key, source). */
export const ROWS = ${lit(rows.join('\n'))};
`;
}
