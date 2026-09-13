#!/usr/bin/env node
/**
 * `npm run try` — the engine, in German, driven by a real person.
 *
 * Not a simulation and not a test. Every other way of looking at this engine feeds it a fabricated
 * learner: `npm run demo` invents one, the suite asserts about ones it constructs. This one asks
 * YOU, and prints the reason for every decision it makes at the moment it makes it.
 *
 * That is the point. The engine's claims — "a claim is not proof", "answering right is worth less
 * than answering wrong costs", "a heritage speaker's gap is a REGISTER gap, not a level" — are all
 * checkable in about three minutes if you can watch them happen to your own answers.
 *
 * Usage:  npm run try            interactive
 *         npm run try -- --auto  a scripted run, for CI and for reading the output without typing
 *
 * @module
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const auto = process.argv.includes('--auto');

// ── Build ────────────────────────────────────────────────────────────────────────────────────────
// The pack and the engine are TypeScript source. esbuild bundles them the same way the Hermes lane
// does: no extra dependency, and the exact bytes that run here could be handed to another runtime.
const outDir = join(root, 'reports', 'try');
mkdirSync(outDir, { recursive: true });
const entry = join(outDir, 'entry.ts');
const bundle = join(outDir, 'api.js');
writeFileSync(
  entry,
  `export { de, vocabulary } from '../../src/index.js';\n` +
    `export { createProfile, day, effectiveStrength, learner } from '@luraty/engine';\n`,
);
execFileSync(
  'npx',
  [
    'esbuild',
    entry,
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { cwd: root, stdio: 'inherit' },
);
const { de, vocabulary, createProfile, day, effectiveStrength, learner } = await import(
  `file://${bundle}`
);

// ── The word list ────────────────────────────────────────────────────────────────────────────────
// Twelve words in two registers, and the frequency ranks are the argument. `verfügung` is the 271st
// commonest word in German — commoner than `haus` — and a heritage speaker raised in an
// English-speaking home has very likely never met it. That is the gap this product exists to find,
// and no single "German level" can express it.
const HOME = [
  ['Haus', 'house', 211],
  ['Wasser', 'water', 524],
  ['Mutter', 'mother', 748],
  ['essen', 'to eat', 752],
  ['Fenster', 'window', 1579],
  ['Schlüssel', 'key', 2311],
];
const OFFICE = [
  ['Verfügung', 'disposal / decree', 271],
  ['zuständig', 'responsible / in charge', 461],
  ['grundsätzlich', 'fundamentally', 553],
  ['Behörde', 'public authority', 624],
  ['ausschließlich', 'exclusively', 899],
  ['Verordnung', 'regulation', 1734],
];
const WORDS = [...HOME, ...OFFICE];
/**
 * Map a unit key back to its pretty German spelling.
 *
 * ⚠️ Keyed through `de.key`, NOT `toLowerCase` — the German pack transliterates umlauts, so
 * `Schlüssel` lives at `schluessel`. Getting this wrong here is cosmetic; getting it wrong when
 * WRITING evidence was a silent two-units-for-one-word bug that this demo is what found.
 */
const lower = (w) => de.key(w);
const PRETTY = new Map(WORDS.map(([w]) => [de.key(w), w]));
const show = (word) => PRETTY.get(word) ?? word;

// ── Terminal helpers ─────────────────────────────────────────────────────────────────────────────
const c = process.stdout.isTTY
  ? {
      dim: (s) => `\x1b[2m${s}\x1b[0m`,
      bold: (s) => `\x1b[1m${s}\x1b[0m`,
      green: (s) => `\x1b[32m${s}\x1b[0m`,
      red: (s) => `\x1b[31m${s}\x1b[0m`,
      cyan: (s) => `\x1b[36m${s}\x1b[0m`,
      yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    }
  : new Proxy({}, { get: () => (s) => s });

const say = (s = '') => process.stdout.write(`${s}\n`);
const rule = (title) => {
  say();
  say(c.cyan(`── ${title} ${'─'.repeat(Math.max(0, 72 - title.length))}`));
  say();
};
/** The engine's voice: why it just did what it did. Always indented, always dim. */
const why = (s) => say(c.dim(`   ${s}`));

const rl = auto ? undefined : createInterface({ input: process.stdin });
// Pulling from the async iterator rather than `rl.question`, because `question` stalls on a piped
// stdin — readline buffers the whole pipe before the first callback ever fires. This shape behaves
// identically for a real terminal and for `printf 'y\nn\n' | npm run try`, which is what makes the
// interactive path testable at all.
const lines = rl?.[Symbol.asyncIterator]();

/** In `--auto`, answer HOME words yes and OFFICE words no — the heritage speaker's actual shape. */
const scripted = (tag) => !tag.includes('[office]');
const ask = async (prompt, tag = '') => {
  if (auto) return scripted(tag);
  process.stdout.write(`   ${prompt} ${c.dim('[y/n]')} `);
  const next = await lines.next();
  if (next.done === true) {
    say(c.dim('\n\n  (stdin ended — run without a pipe to answer interactively.)'));
    process.exit(0);
  }
  const answer = next.value.trim();
  // A terminal echoes the keystroke and the Enter; a pipe echoes nothing, so the transcript would
  // run every prompt onto one line. Echo it ourselves when there is no TTY to do it for us.
  if (!process.stdout.isTTY) say(answer);
  return answer.toLowerCase().startsWith('y');
};

// ── ACT 0 · who is this ──────────────────────────────────────────────────────────────────────────
say();
say(c.bold('  Luraty — German, in about three minutes.'));
say();
say('  The real 10,000-word German pack, your answers, and the engine printing');
say('  its reasoning after every decision it makes.');
if (auto) say(c.dim('\n  (--auto: answering as a heritage speaker would — home yes, office no.)'));

// `learner(...)` is the whole setup. The profile is a plain value; the handle just stops you
// passing pack/variety/direction to every call.
const d1 = day(1);
let me = learner(createProfile('de', d1), { pack: de, vocabulary });

// ── ACT 1 · placement ────────────────────────────────────────────────────────────────────────────
rule('ACT 1 · PLACEMENT — you claim, nobody checks');

say('  Twelve German words. Say whether you know each one.');
say(`  ${c.dim('Nothing is graded here. You are CLAIMING.')}`);
say();

const claimed = [];
for (const [word, gloss, rank] of WORDS) {
  const office = OFFICE.some(([w]) => w === word);
  const yes = await ask(
    `${c.bold(word.padEnd(16))} ${c.dim(`#${String(rank).padStart(4)} commonest`)}`,
    office ? '[office]' : '[home]',
  );
  if (auto) say(`   ${c.bold(word.padEnd(16))} ${c.dim(`#${String(rank).padStart(4)}`)}  ${yes ? 'y' : 'n'}`);
  if (yes) claimed.push(lower(word));
  void gloss;
}

// One call. A claim sets a flag and NOTHING else — no rung, no counter, no date that schedules.
me = me.claim(claimed, d1);

const placed = me.summary();
say();
say(`  claimed: ${c.bold(String(claimed.length))} of 12`);
say(`  known:   ${c.bold(c.yellow(String(placed.known)))}      unchecked: ${c.bold(String(placed.claimsStanding))}`);
why('known is 0 and that is CORRECT, not a bug. You said it; nobody checked.');
why('What the claim bought is that day one is not an empty screen.');

// ── ACT 2 · the session ──────────────────────────────────────────────────────────────────────────
rule('ACT 2 · THE SESSION — the engine picks, and says why');

const session = me.plan({ day: d1, maxItems: 6 });
say(`  maxItems: 6   ${c.dim('maxNew defaults to half the session — 3')}`);
say();
const LABEL = {
  verify: 'you SAID you know this — checking',
  new: 'never met, never claimed — teaching',
  relearn: 'asked before, never once right',
  review: 'proven before — ordinary review',
};
for (const item of session.items) {
  const word = item.unit.split(':')[2] ?? '';
  say(`  ${c.bold(show(word).padEnd(18))} ${c.cyan(item.why.padEnd(8))} ${c.dim(LABEL[item.why])}`);
}
if (session.content.newUnitsWanted > 0) {
  say();
  why(`It has ${String(session.content.newUnitsWanted)} new slots it cannot fill from your profile.`);
  why('The engine owns no word list and must not acquire one — the host feeds it.');
}

// ── ACT 3 · answering ────────────────────────────────────────────────────────────────────────────
rule('ACT 3 · ANSWERING — watch the rung move');

say('  Now prove it. Same words, but this time the answer counts.');
say(`  ${c.dim('right: +1 rung.  wrong: −2.  known at rung 2, ceiling 6.')}`);
why('That asymmetry puts break-even at 66.7%, so the rung means "do you know this"');
why('rather than "how often do you slip".');
say();

const UNMET_STATE = { strength: 0, lastProven: 0, prior: { kind: 'none' } };
const stateOf = (word) => me.profile.units[`recognise:de:${word}`] ?? UNMET_STATE;

let explainedBonus = false;
let explainedRefute = false;
for (const item of session.items) {
  const word = item.unit.split(':')[2] ?? '';
  const entry = WORDS.find(([w]) => lower(w) === word);
  const before = stateOf(word).strength;
  const office = entry !== undefined && OFFICE.some(([w]) => w === entry[0]);

  const correct = await ask(
    `${c.bold(show(word).padEnd(16))} ${c.dim(`= "${entry?.[1] ?? '?'}"  — did you get it?`)}`,
    office ? '[office]' : '[home]',
  );
  me = me.answer(word, correct ? 'known' : 'unknown', d1);

  // TWO numbers, because the engine really does carry two. `strength` is what the fold WROTE.
  // `effectiveStrength` adds a rung when a claim has since been proved — and it is computed here,
  // on read, never folded in. That is what keeps the claim path commutative: replaying the same
  // evidence in a different order (an offline queue landing late) cannot change the answer.
  const raw = stateOf(word).strength;
  const eff = effectiveStrength(stateOf(word));
  const mark = correct ? c.green('✓') : c.red('✗');
  const known = eff >= 2 ? c.green('  KNOWN') : c.dim('  not yet');
  const bonus = eff > raw ? c.yellow(` (+1 confirmed claim → ${String(eff)})`) : '';
  say(`   ${mark} ${show(word).padEnd(16)} rung ${String(before)} → ${c.bold(String(raw))}${bonus}${known}`);

  if (bonus !== '' && !explainedBonus) {
    explainedBonus = true;
    why('Two numbers, and the gap is the whole design. The LEDGER says rung 1 —');
    why('one correct answer, one rung. But you also claimed it, and a claim you');
    why('have now proved is a second signal, so it READS as 2 and counts as known.');
    why('Computed on read, never written down: that is what lets an offline answer');
    why('arrive late without changing the result.');
  }
  if (!correct && item.why === 'verify' && !explainedRefute) {
    explainedRefute = true;
    why('Claim refuted — and NOT erased. The engine keeps that you said it, so');
    why('"of your claims, N held and M did not" stays answerable forever.');
  }
}

const after = me.summary();
say();
say(
  `  known ${c.bold(c.green(String(after.known)))}   ` +
    `of your claims: ${c.bold(String(after.claimsConfirmed))} held, ` +
    `${c.bold(String(after.claimsRefuted))} did not, ` +
    `${c.bold(String(after.claimsStanding))} still unchecked`,
);

// ── ACT 4 · coverage ─────────────────────────────────────────────────────────────────────────────
rule('ACT 4 · CAN YOU READ THIS? — the 95–98% band');

const PASSAGE =
  'Der Mann geht am Morgen aus dem Haus und kauft Brot und Wasser. ' +
  'Die Mutter sitzt am Fenster und trinkt Kaffee, und das Kind sucht den Schlüssel. ' +
  'Am Nachmittag liest der Vater die Zeitung am Tisch in der Küche.';
say(`  ${c.dim(PASSAGE)}`);
say();

const cov = me.coverage(PASSAGE);
switch (cov.kind) {
  case 'measured':
    say(`  ${c.bold(cov.band)} — ${String(cov.knownTokens)}/${String(cov.runningTokens)} proven`);
    break;
  case 'unverified':
    say(`  proven says ${c.bold(cov.strict)}, believing your claims says ${c.bold(cov.withClaims)}`);
    why('Two readings come back because they DISAGREE, and the engine will not');
    why('pick for you. The unchecked words in this passage are tomorrow\'s drill list.');
    break;
  case 'too-short':
    say(`  needs ${String(cov.needsMoreTokens)} more running words to judge honestly`);
    break;
  case 'no-words':
    say('  wrong language for this pack');
    break;
}
why('Below 95% known, guessing from context stops working. Above 98%, there is');
why('nothing left to learn. In-band is the target — that is the whole sizing rule.');

// ── ACT 5 · tomorrow ─────────────────────────────────────────────────────────────────────────────
rule('ACT 5 · TOMORROW — and the day after');

for (const d of [2, 5]) {
  const s = me.plan({ day: day(d), maxItems: 6 });
  const counts = {};
  for (const i of s.items) counts[i.why] = (counts[i.why] ?? 0) + 1;
  const shape =
    Object.entries(counts)
      .map(([k, v]) => `${String(v)} ${k}`)
      .join(', ') || 'nothing due';
  say(`  day ${String(d).padEnd(2)}  ${shape}`);
}
why('Nothing you answered today comes back today — answering sets lastAsked,');
why('and the queue is ordered by how long a word has waited since it was ASKED.');
why('Scheduling on "seen" instead would bury everything you just read.');

// ── Save ─────────────────────────────────────────────────────────────────────────────────────────
const blob = me.save();
rule('AND THAT IS THE WHOLE ENGINE');
say(`  Your profile is ${c.bold(String(blob.length))} bytes of canonical JSON.`);
say(`  ${c.dim('Same state always produces the same string — safe to hash, diff and pin.')}`);
say();
say(`  ${c.dim('Read the code:')}  packs/de/src/example.test.ts   ${c.dim('(the same loop, commented per line)')}`);
say(`  ${c.dim('Read the why:')}   docs/adr/0006-*.md`);
say();

rl?.close();
