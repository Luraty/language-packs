#!/usr/bin/env node
/**
 * Build `packs/de/frequency.txt` from Leipzig Corpora word lists.
 *
 * Reproducible on purpose. A pack whose data cannot be rebuilt is a pack nobody can fix — and the
 * previous content pipeline in this repo was deleted precisely because it had drifted out of reach.
 *
 * Usage:
 *   node packs/de/build/build-frequency.mjs <words.txt> [more-words.txt...] --out packs/de/frequency.txt
 *
 * Input is Leipzig's `*-words.txt`: `rank <TAB> word <TAB> count`, one per line.
 * Get it with:
 *   curl -O https://downloads.wortschatz-leipzig.de/corpora/deu_news_2024_300K.tar.gz
 *   tar -xzf deu_news_2024_300K.tar.gz
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
const lemmaIndex = args.indexOf('--lemmas');
const lemmaFile = lemmaIndex >= 0 ? args[lemmaIndex + 1] : undefined;
const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 10000;
// ⚠️ The `>= 0` guards are not decoration. `indexOf` returns -1 for an absent flag, and -1 + 1 is
// 0 — which silently excluded the FIRST positional argument whenever `--lemmas` was omitted, so the
// script reported "usage:" on a perfectly good command line.
const valueIndices = new Set(
  [outIndex, limitIndex, lemmaIndex].filter((i) => i >= 0).map((i) => i + 1),
);
const inputs = args.filter((a, i) => !a.startsWith('--') && !valueIndices.has(i));

if (out === undefined || inputs.length === 0) {
  console.error('usage: build-frequency.mjs <words.txt>... --out <file> [--limit 10000]');
  process.exit(2);
}

/**
 * The pack's own tokenize pattern. A word the tokenizer could never produce has no business in the
 * list: `rank()` would be unreachable for it, and `onlyIfRemainderKnown` would consult an entry that
 * can never match.
 */
const GERMAN_WORD = /^[a-zA-ZäöüÄÖÜßẞ]+$/;

/**
 * ⚠️ PASS TWO. When a lemma table is supplied, every surface form's count is added to its LEMMA
 * instead of to itself.
 *
 * Ranking surface forms is what a first pass has to do — there is no lemma table yet — and it is
 * wrong in a way that shows up immediately: a word's frequency is SPLIT across its inflections, so
 * `vergangen`, `eigen` and `zweit` never make the top 10,000 while `vergangenen`, `eigenen` and
 * `zweiten` do. The list then contains forms whose own lemma it does not contain, and 750 of its
 * entries had an unrankable key.
 *
 * Summing onto the lemma is what "how common is this word" actually means. Run pass one, build the
 * lemmas from it, then run this.
 */
const lemmaOf = new Map();
if (lemmaFile !== undefined) {
  for (const line of readFileSync(lemmaFile, 'utf8').split('\n')) {
    const [form, lemma] = line.split('\t');
    if (form && lemma) lemmaOf.set(form.trim(), lemma.trim());
  }
  console.error(`  lemma table: ${String(lemmaOf.size)} rows`);
}

/** counts[lowercased word] = { total, corpora: Set } */
const counts = new Map();

for (const [index, file] of inputs.entries()) {
  let kept = 0;
  let skipped = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const word = parts[1];
    const count = Number(parts[2]);
    if (!word || !Number.isFinite(count)) continue;

    // Length 1 first: German has no single-letter words, and the ones Leipzig lists are
    // abbreviations and OCR noise.
    if (word.length < 2 || !GERMAN_WORD.test(word)) {
      skipped++;
      continue;
    }

    // ⚠️ LOWERCASED, and this is not a style choice. The pack's `normalize` starts with
    // `lowercase`, so `Die` and `die` are ONE key at lookup time. Keeping them apart here would
    // put two entries in the list that collapse to one at `key()`, and the second would be dead —
    // exactly the raw-vs-normalized mismatch that has now bitten this repo twice.
    //
    // It also merges sentence-initial capitals with the ordinary word, which is what makes the
    // counts mean anything in German.
    const surface = word.toLowerCase();
    const key = lemmaOf.get(surface) ?? surface;
    const entry = counts.get(key) ?? { total: 0, corpora: new Set() };
    entry.total += count;
    entry.corpora.add(index);
    counts.set(key, entry);
    kept++;
  }
  console.error(`  ${file}: ${String(kept)} kept, ${String(skipped)} skipped`);
}

// Typo and OCR filter. A real German word appears in more than one corpus, or a lot in one. This
// removes the long tail of `dassder`, `Beeitschaft` and scanner noise that would otherwise occupy
// slots in a 10k list and, worse, let `splitCompounds` accept nonsense parts.
const ranked = [...counts.entries()]
  .filter(([, v]) => v.corpora.size > 1 || v.total >= 20)
  .sort((a, b) => b[1].total - a[1].total || (a[0] < b[0] ? -1 : 1))
  .slice(0, LIMIT);

writeFileSync(out, ranked.map(([w]) => w).join('\n') + '\n');

console.error(`\n  ${String(counts.size)} distinct forms -> ${String(ranked.length)} written`);
console.error(`  top 10: ${ranked.slice(0, 10).map(([w]) => w).join(' ')}`);
const cut = ranked.at(-1);
if (cut) console.error(`  cut-off: "${cut[0]}" at ${String(cut[1].total)} occurrences`);
