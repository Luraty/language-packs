// Build the data module for @luraty/dict-ar-en from the two dictionary artifacts in
// `languages/fusha/out/`, re-keyed against the INSTALLED @luraty/pack-ar.
//
// Pure: reads files, returns the module text and the measurements. `generate.mjs` writes it;
// `src/data.test.ts` rebuilds it and asserts the checked-in module is byte-identical.
//
// ⚠️ **THE JOIN TARGET IS `pack.key()`, NOT THE LEXICON THE ARTIFACTS WERE FILTERED AGAINST.** The
// artifacts were built against `languages/fusha/out/lemmas.tsv` (208,052 rows), which is not the
// table `@luraty/pack-ar@0.1.0` ships (192,255 rows). The app keys a tapped word with the pack it
// actually installed, so an entry is only reachable if its key is a key THAT pack produces.
//
// ⚠️ **WHAT WAS TRIED TO RAISE THE JOIN, AND WHY MOST OF IT IS NOT HERE.** Measured 2026-09-13 against
// pack-ar 0.1.0 (see README.md for the numbers):
//
//   - pack-ar's own normalize chain over the dictionary keys: +0 entries. The artifacts were already
//     normalized with the same strip, so there is nothing left for it to do.
//   - folding alef/hamza and ة/ى the way pack-ar's `compare` does, taking the unique match: +324
//     Wiktionary entries, and they are WRONG ONES — كأن→كان ("as if" filed under "was"),
//     أشعار→إشعار ("poems" under "notification"), أب→آب ("father" under "August"). `compare` folds those because
//     it grades a typed answer; `key` keeps them apart because they are different words. Rejected.
//   - `pack.key(dictionaryKey)` where it lands on a different reachable key AND `compare` says the two
//     are the same spelling: +77 Wiktionary entries, +0.0 points of coverage, and it files
//     علي ("Ali") under على ("on") and آثار ("traces") under أثار. Rejected.
//   - `pack.key(dictionaryKey)` alone: القاهرة ("Cairo") under قهر ("to subdue"). Rejected.
//
// The one re-keying that survives uses the SOURCE'S OWN SPELLING, not a fold of ours: see
// `laneHeadword` below.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = join(here, '..');
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
const ARTIFACTS = join(REPO_ROOT, 'languages', 'fusha', 'out');

/** Source order is display order: the modern learner's dictionary first. */
export const SOURCE_IDS = ['wiktionary-en', 'lane'];

/** Hand-written metadata. What the artifact itself records (provenance, built) is read from it. */
const SOURCE_META = {
  'wiktionary-en': {
    name: 'English Wiktionary (Arabic entries), extracted by Wiktextract via kaikki.org',
    licence: 'CC-BY-SA-4.0',
    url: 'https://en.wiktionary.org/',
    maxChars: 200,
  },
  lane: {
    name: "Edward William Lane, An Arabic-English Lexicon (1863–1893)",
    licence: 'public-domain',
    url: 'https://github.com/wizsk/arabic_lexicons',
    maxChars: 240,
  },
};

/** ≤5 per source per key, per the package contract. */
export const MAX_SENSES = 5;

/** Engine's `isArabicDiacritic` (U+064B–U+0655, U+0670, U+06D6–U+06ED) plus tatweel. */
const MARKS = /[\u064B-\u0655\u0670\u0640\u06D6-\u06ED]/gu;
const normalize = (s) => s.replace(MARKS, '');

/**
 * Lane's leading headword, normalized — or undefined when the sense does not open with one.
 *
 * ⚠️ **THE LANE ARTIFACT'S KEYS HAVE LOST THEIR HAMZAS, AND LANE'S OWN TEXT HAS NOT.** The SQLite
 * the extract came from indexes `أَرْضٌ` under `ارض`, so the artifact's key is a spelling pack-ar
 * does not produce for that word (`key('ارض')` is `رضا`). Every Lane article opens with its
 * vocalized headword, so each SENSE is re-keyed to the headword it states — and only when that
 * headword folds to the artifact's key under pack-ar's `compare`, which proves the parse picked up
 * the same word and not a stray Arabic phrase. This is the source's spelling, not a guess.
 */
function laneHeadword(sense) {
  // pack-ar's own tokenizer class, so the headword is exactly what `split` would cut.
  const m = /^[\u0620-\u065F\u066E-\u06D3\u06D5-\u06FF]+/u.exec(sense);
  return m ? normalize(m[0]) : undefined;
}

/**
 * A Lane sense that is only a pointer elsewhere — `أَدْمٌ : see أُدْمَةٌ`, `اَتَّمَ 2 see 4`. Every
 * Latin word in it is navigation vocabulary. It is not a meaning a learner can read, and on a tap it
 * would read as one.
 */
const XREF_WORDS = new Set(
  (
    'see art and also in one two three four five places place the next preceding following follows ' +
    'first second third last signification significations what here q v voce under above below ' +
    'paragraph word its this that of end near respecting'
  ).split(' '),
);
function isCrossReference(sense) {
  const words = sense.match(/[A-Za-z]+/g) ?? [];
  return words.length > 0 && words.some((w) => w.toLowerCase() === 'see') && words.every((w) => XREF_WORDS.has(w.toLowerCase()));
}

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
  let s = raw.replace(/\s+/g, ' ').trim();
  if (id === 'lane') {
    // The extract's sub-entry separators. Punctuation only; no words change.
    s = s.replace(/\s*(?:===|___)\s*/g, ' · ').replace(/\s+…$/u, '…');
    if (isCrossReference(s)) return undefined;
  }
  // ⚠️ No Latin letter means no English: Lane rows like `كتب` or `بيت` are a bare headword.
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
  const { msa, vocabulary, version, reachable } = await loadPack();
  const top1000 = vocabulary.slice(0, 1000);

  /** key -> source -> { senses: string[], pos: string[] } */
  const table = new Map();
  const stats = {};
  const sources = [];

  for (const id of SOURCE_IDS) {
    const artifact = readArtifact(id);
    if (artifact.id !== id) throw new Error(`dictionary.${id}.json says it is "${artifact.id}"`);
    const baseline = new Set(Object.keys(artifact.entries).map(normalize));
    let rekeyed = 0;
    let droppedSenses = 0;

    // Exact-key senses first, re-keyed ones after, so a word's own entry leads its list.
    const passes = [[], []];
    for (const [key, entry] of Object.entries(artifact.entries)) {
      for (const raw of entry.senses) {
        let target = normalize(key);
        let moved = false;
        if (id === 'lane') {
          const head = laneHeadword(raw);
          if (head !== undefined && head !== target && msa.compare(head, target) === 1) {
            target = head;
            moved = true;
          }
        }
        if (!reachable.has(target)) continue;
        const sense = cleanSense(id, raw);
        if (sense === undefined) {
          droppedSenses++;
          continue;
        }
        passes[moved ? 1 : 0].push([target, sense, entry.pos ?? []]);
        if (moved) rekeyed++;
      }
    }

    for (const [target, sense, pos] of [...passes[0], ...passes[1]]) {
      const bySource = table.get(target) ?? table.set(target, new Map()).get(target);
      const slot = bySource.get(id) ?? bySource.set(id, { senses: [], pos: [] }).get(id);
      if (slot.senses.length < MAX_SENSES && !slot.senses.includes(sense)) slot.senses.push(sense);
      for (const p of pos) {
        // The row format separates parts of speech with a comma and fields with a tab.
        if (/[,\t\n]/.test(p)) throw new Error(`part of speech "${p}" for ${target} cannot be encoded`);
        if (p && !slot.pos.includes(p)) slot.pos.push(p);
      }
    }

    const has = new Set([...table].filter(([, m]) => m.has(id)).map(([k]) => k));
    stats[id] = {
      entries: has.size,
      senses: [...has].reduce((n, k) => n + table.get(k).get(id).senses.length, 0),
      top10000: pctOf(has, vocabulary),
      top1000: pctOf(has, top1000),
      before: { top10000: pctOf(baseline, vocabulary), top1000: pctOf(baseline, top1000) },
      rekeyedSenses: rekeyed,
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
// languages/fusha/out/dictionary.{wiktionary-en,lane}.json. \`src/data.test.ts\` fails if this drifts.

export const SOURCES = ${JSON.stringify(sources, null, 2)} as const;

export const COVERAGE = ${JSON.stringify(coverage, null, 2)} as const;

/** key TAB source TAB pos,pos TAB sense TAB sense … — one line per (key, source). */
export const ROWS = ${lit(rows.join('\n'))};
`;
}
