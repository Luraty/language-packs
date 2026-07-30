#!/usr/bin/env node
/**
 * Build `packs/de/lemmas.tsv` from human-annotated Universal Dependencies treebanks.
 *
 * ⚠️ THIS FILE REPLACED A RULE-BASED VERSION, AND THE REASON IS WORTH KEEPING.
 *
 * The first attempt generated inflections from suffix rules, guarded by "only emit if both the form
 * and the lemma are in the frequency list" — the same trick the engine's affix stripper uses. That
 * guard is strong for affixes and far too weak here, because the frequency list is full of
 * inflected forms. The rules produced, among 3,275 rows:
 *
 *     warten -> waren      (to wait -> were)
 *     Ware   -> war        (goods -> was)
 *     Seite  -> seit       (page -> since)
 *     andere -> anderen    (an inflected form as the lemma)
 *     Stärke -> stark      (strength -> strong)
 *
 * Every one passed the guard, because the wrong target really is a common German word. German
 * morphology needs a lexicon or a tagger; suffix rules plus a word list is not enough, and the
 * failures are silent — a learner who proved `waren` would be credited with `warten`.
 *
 * So the lemmas come from UD treebanks, where a human annotated the lemma of each token in context.
 * Homographs are resolved by MAJORITY over that corpus, which is the closest thing to a POS tagger
 * available without adding one.
 *
 * Usage:
 *   node packs/de/build/build-lemmas.mjs packs/de/frequency.txt <treebank.conllu>... \
 *     --irregulars packs/de/build/irregulars.tsv --out packs/de/lemmas.tsv
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = flag('--out');
const irregularsFile = flag('--irregulars');
const positional = args.filter((a) => !a.startsWith('--') && a !== out && a !== irregularsFile);
const [frequencyFile, ...treebanks] = positional;

if (!frequencyFile || !out || treebanks.length === 0) {
  console.error('usage: build-lemmas.mjs <frequency.txt> <treebank.conllu>... --out <file>');
  process.exit(2);
}

const words = readFileSync(frequencyFile, 'utf8').split('\n').map((w) => w.trim()).filter(Boolean);
const known = new Set(words);

/** Rank, so a cycle can be broken at its commonest member. */
const rank = new Map(words.map((w, i) => [w, i]));

/** The pack's tokenize pattern. A form it could never produce cannot be looked up. */
const GERMAN_WORD = /^[a-zA-ZäöüÄÖÜßẞ]+$/;

/** These carry no lemma worth having, and PUNCT/NUM would only add noise. */
const SKIP_POS = new Set(['PUNCT', 'NUM', 'SYM', 'X']);

/**
 * Placeholder lemmas. HDT writes the literal string `unknown` where its annotation has no lemma,
 * and a first draft of this build happily mapped `auf`, `an`, `wie`, `ich` and every other common
 * function word onto it — one fake word swallowing a third of German.
 */
const PLACEHOLDER = new Set(['unknown', 'unbekannt', '_', '--', '@card@', 'x']);

/** form -> Map<lemma, count>. Counting is how homographs get resolved. */
const observed = new Map();
let tokens = 0;

for (const file of treebanks) {
  if (!existsSync(file)) {
    console.error(`  missing: ${file}`);
    continue;
  }
  let seen = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.length === 0 || line.startsWith('#')) continue;
    const cols = line.split('\t');
    if (cols.length < 4) continue;
    // Multi-word token ranges ("1-2") and empty nodes ("1.1") have no lemma of their own.
    if (!/^\d+$/.test(cols[0])) continue;

    const form = (cols[1] ?? '').toLowerCase();
    const lemma = (cols[2] ?? '').toLowerCase();
    const pos = cols[3] ?? '';
    if (SKIP_POS.has(pos)) continue;
    if (!GERMAN_WORD.test(form) || !GERMAN_WORD.test(lemma)) continue;
    if (PLACEHOLDER.has(lemma)) continue;

    // ⚠️ IDENTITY PAIRS ARE COUNTED, and leaving them out was the worst bug in the first draft.
    //
    // Skipping `form === lemma` here meant a word that is USUALLY its own lemma never got a vote
    // for itself — so one rare reading won unopposed. `mehr` (more) mapped to `mehren` (to
    // increase) off a handful of verb tokens, against thousands of adverb tokens that were being
    // thrown away before the count. The identity vote is what makes the majority mean anything.
    const byLemma = observed.get(form) ?? new Map();
    byLemma.set(lemma, (byLemma.get(lemma) ?? 0) + 1);
    observed.set(form, byLemma);
    seen++;
    tokens++;
  }
  console.error(`  ${file.split('/').pop()}: ${String(seen)} inflected tokens`);
}

const table = new Map();
let outOfList = 0;
let ambiguous = 0;
let thin = 0;

for (const [form, byLemma] of observed) {
  // ⚠️ The FORM does not have to be in the frequency list, and requiring it was a real bug.
  //
  // After the second pass the list holds LEMMAS — `der`, not `die`/`den`/`dem` — because that is
  // what "how common is this word" means once inflections are summed onto their lemma. So no
  // inflected form is in the list, and requiring membership dropped every row the table exists for:
  // 4,141 rows collapsed to 1,871 and `die` stopped keying to `der`.
  //
  // The form is whatever a tokenizer pulls out of real text. The LEMMA is the thing that has to be
  // rankable.

  // Majority vote. Ties break on the alphabetically first lemma so the build is deterministic.
  const sorted = [...byLemma.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const [lemma, count] = sorted[0];
  const total = sorted.reduce((sum, [, n]) => sum + n, 0);

  // A form seen once or twice is annotation noise, not evidence.
  if (total < 3) {
    thin++;
    continue;
  }
  // The majority says this word is its own lemma. Nothing to map.
  if (lemma === form) continue;

  // ⚠️ A genuinely ambiguous form is DROPPED, not guessed. If the corpus cannot agree on the lemma
  // of `sein` by a clear margin, neither can this build — and a wrong lemma silently merges two
  // words into one unit, which is worse than leaving the form unmapped.
  if (count / total < 0.85) {
    ambiguous++;
    continue;
  }

  // ⚠️ An out-of-list lemma is KEPT, and that is a deliberate reversal of the first draft.
  //
  // Dropping the row leaves the inflected form as its OWN unit, permanently separate from every
  // other form of the same word — which is the exact defect this table exists to prevent. Keeping
  // it costs only that `rank()` returns undefined for that lemma, which affects the affix guard and
  // the diagnostics, not whether coverage is correct. Unification is worth more than rankability.
  if (!known.has(lemma)) outOfList++;

  table.set(form, lemma);
}

// Hand-written irregulars last, so they win. These are the forms a corpus may simply not contain,
// and they were checked by hand.
let irregular = 0;
if (irregularsFile && existsSync(irregularsFile)) {
  for (const line of readFileSync(irregularsFile, 'utf8').split('\n')) {
    const [surface, lemma] = line.split('\t');
    if (!surface || !lemma) continue;
    const s = surface.trim().toLowerCase();
    const l = lemma.trim().toLowerCase();
    if (s === l || !known.has(l)) continue;
    table.set(s, l);
    irregular++;
  }
}

// ⚠️ IDEMPOTENCY, which `checkPack` caught before this existed: it reported `key()` is not
// idempotent because `ein` mapped to `eine`, which mapped onward again. A lemma table with chains
// files one word under two keys depending on how many times `key()` happens to be applied.
//
// Resolve every chain to its endpoint. A cycle is broken at its commonest member, because that is
// the form a learner is most likely to meet and the one `rank()` can resolve.
let rewritten = 0;
let cycles = 0;
for (const form of [...table.keys()]) {
  const path = [form];
  let current = table.get(form);
  while (current !== undefined && table.has(current)) {
    if (path.includes(current)) {
      // A cycle. Elect the commonest member and point everything else at it.
      const root = path
        .concat(current)
        .sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9))[0];
      for (const member of path.concat(current)) {
        if (member === root) table.delete(member);
        else table.set(member, root);
      }
      cycles++;
      current = undefined;
      break;
    }
    path.push(current);
    current = table.get(current);
  }
  if (current !== undefined && current !== table.get(form)) {
    table.set(form, current);
    rewritten++;
  }
}

const rows = [...table.entries()]
  .sort((a, b) => (a[0] < b[0] ? -1 : 1))
  .map(([form, lemma]) => `${form}\t${lemma}`);

writeFileSync(out, rows.join('\n') + '\n');

console.error(`\n  ${String(tokens)} annotated tokens -> ${String(rows.length)} rows`);
console.error(`    kept with a lemma outside the list: ${String(outOfList)}`);
console.error(`    dropped, corpus disagrees:      ${String(ambiguous)}`);
console.error(`    dropped, too few observations:  ${String(thin)}`);
console.error(`    hand-written irregulars:        ${String(irregular)}`);
console.error(`    chains resolved:                ${String(rewritten)}`);
console.error(`    cycles broken:                  ${String(cycles)}`);
if (args.includes('--samples')) {
  const sample = rows.slice(0, 400).filter((_, i) => i % 25 === 0);
  console.error(`\n  sample: ${sample.map((r) => r.replace('\t', '>')).join('  ')}`);
}
