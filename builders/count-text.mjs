#!/usr/bin/env node
/**
 * Count word frequencies in raw German text, emitting Leipzig's `rank <TAB> word <TAB> count`
 * format so the rest of the pipeline does not care where the numbers came from.
 *
 * Why build our own at all, when Leipzig already exists: **register**. Leipzig's German corpora are
 * news and web text, and this product is for someone reactivating a language they heard at home.
 * The words that matter to them are conversational, and news over-weights politics, sport and
 * economics while under-weighting everything anyone says out loud.
 *
 * Sources are weighted rather than concatenated, because a corpus contributes in proportion to its
 * size otherwise, and one 775,000-sentence source would simply drown the others.
 *
 * Usage:
 *   node packs/de/build/count-text.mjs --out counts.txt \
 *     tatoeba.tsv:3 book.txt:1 wikipedia.txt:1
 *
 * The `:N` suffix is the weight. A `.tsv` input is treated as Leipzig/Tatoeba shaped — the text is
 * whatever follows the last tab.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
const inputs = args.filter((a, i) => !a.startsWith('--') && i !== outIndex + 1);

if (out === undefined || inputs.length === 0) {
  console.error('usage: count-text.mjs --out <file> <path[:weight]>...');
  process.exit(2);
}

/** The pack's own tokenize pattern, so the counts describe tokens the pack can actually produce. */
const TOKEN = /[a-zA-ZäöüÄÖÜßẞ]+/g;

/**
 * Project Gutenberg wraps every book in a licence header and footer. Counting them would put
 * `gutenberg`, `ebook`, `license` and a lot of English into a German frequency list.
 */
function stripGutenberg(text) {
  const start = text.indexOf('*** START OF THE PROJECT GUTENBERG');
  const end = text.indexOf('*** END OF THE PROJECT GUTENBERG');
  if (start < 0 || end < 0 || end <= start) return text;
  return text.slice(text.indexOf('\n', start) + 1, end);
}

const counts = new Map();
const sources = new Map();

for (const spec of inputs) {
  const match = /^(.*?)(?::(\d+))?$/.exec(spec);
  const file = match?.[1] ?? spec;
  const weight = Number(match?.[2] ?? 1);

  let text = readFileSync(file, 'utf8');
  if (text.includes('PROJECT GUTENBERG')) text = stripGutenberg(text);
  if (file.endsWith('.tsv')) {
    text = text
      .split('\n')
      .map((line) => {
        const tab = line.lastIndexOf('\t');
        return tab >= 0 ? line.slice(tab + 1) : line;
      })
      .join('\n');
  }

  let tokens = 0;
  for (const m of text.matchAll(TOKEN)) {
    const word = m[0].toLowerCase();
    if (word.length < 2) continue;
    counts.set(word, (counts.get(word) ?? 0) + weight);
    tokens++;
  }
  sources.set(file, tokens);
  console.error(`  ${file.split('/').pop()}  weight ${String(weight)}  ${String(tokens)} tokens`);
}

const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
writeFileSync(
  out,
  ranked.map(([w, n], i) => `${String(i + 1)}\t${w}\t${String(n)}`).join('\n') + '\n',
);
console.error(`\n  ${String(ranked.length)} distinct forms -> ${out}`);
console.error(`  top 12: ${ranked.slice(0, 12).map(([w]) => w).join(' ')}`);
