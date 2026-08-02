#!/usr/bin/env node
/**
 * Tests for the licence gate.
 *
 * ⚠️ THE POINT IS THE FAILING CASES. A checker that has only ever been run against valid input is
 * a checker nobody has seen say no, and "it passed" then means nothing. Each fixture below exists
 * to make one specific arm fire — contamination, a dateless stamp, a non-boolean flag — and the
 * real languages/ tree is asserted green separately so the two claims cannot be confused.
 *
 * No test framework on purpose: node:test ships with node, and this repo installs nothing to run
 * its builders.
 *
 * Run: node --test builders/
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const gate = join(here, 'check-sources.mjs');

/** Run the gate and return { code, output }. stderr carries every message the gate emits. */
const run = (...args) => {
  const result = spawnSync(process.execPath, [gate, ...args], { encoding: 'utf8' });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
};

const fixture = (name) => join(here, 'fixtures', name);

test('the real languages/ tree passes', () => {
  const { code, output } = run();
  assert.equal(code, 0, output);
  assert.match(output, /Sources OK/);
});

test('share-alike contaminating a permissive output is rejected', () => {
  const { code, output } = run('--root', fixture('contaminated'));
  assert.equal(code, 1, output);
  assert.match(output, /share-alike contaminates the output/);
  assert.match(output, /share-alike/);
});

test('non-commercial contaminating a permissive output is rejected', () => {
  // The arm that did not exist. The old check split the licence id on dashes and looked for `SA`,
  // so `CC-BY-NC-4.0` read as entirely permissive — and NC is the term this project has already
  // been burned by once, when Leipzig was wrongly believed to carry it.
  const { code, output } = run('--root', fixture('noncommercial'));
  assert.equal(code, 1, output);
  assert.match(output, /non-commercial contaminates the output/);
});

test('an NC output is rejected even though nothing contaminates it', () => {
  // ⚠️ The loophole the contamination arm alone leaves open. Declaring the output NC silences the
  // NC-source check and yields an artefact this project can never ship: the lists are used
  // commercially in Luraty, and NC binds the LICENSEE — open sourcing a derivative does not lift a
  // restriction that was never ours to lift. Together the two arms mean an NC source is unusable
  // here, which is the intended reading for UD_Arabic-PADT and UD_German-LIT.
  const { code, output } = run('--root', fixture('ncoutput'));
  assert.equal(code, 1, output);
  assert.match(output, /There is no NC output this project can ship/);
});

test('share-alike is NOT treated as a commercial-use blocker', () => {
  // The inverse claim, and it matters as much as the NC one. CC BY-SA permits commercial use; it
  // constrains how the data file is licensed onward. The real lemmas.tsv is CC BY-SA 4.0 and must
  // stay shippable — if a future edit lumps SA in with NC, this fails.
  const { code, output } = run('--root', root);
  assert.equal(code, 0, output);
  assert.doesNotMatch(output, /no NC output this project can ship/);
});

test('no-derivatives is rejected even when the output declares the same licence', () => {
  // SA and NC are fixed by relicensing the output. ND is not: a frequency count is an adaptation,
  // and ND forbids distributing adaptations at all. So matching licences must NOT rescue it.
  const { code, output } = run('--root', fixture('noderivatives'));
  assert.equal(code, 1, output);
  assert.match(output, /no-derivatives forbids/);
});

test('a licence id with a missing dash is rejected, not read as permissive', () => {
  // ⚠️ THE REGRESSION TEST FOR THE HOLE. `CC-BY-SA4.0`.split('-') is ['CC','BY','SA4.0'], which
  // does not contain 'SA', so the original share-alike check classed a share-alike source as
  // permissive and let it contaminate a CC BY output in complete silence. A typo that disables the
  // licence check is the worst failure this gate can have.
  const { code, output } = run('--root', fixture('typo'));
  assert.equal(code, 1, output);
  assert.match(output, /unknown licence "CC-BY-SA4\.0"/);
});

test('a written-only source set warns but does not fail', () => {
  const { code, output } = run('--root', fixture('register'));
  assert.equal(code, 0, output);
  assert.match(output, /no spoken-proxy source/);
  assert.match(output, /may contain generative-AI output/);
});

test('the German list is flagged for having no spoken-proxy register', () => {
  // Live state, like the publish-blocked test below. German is built from news and web text only,
  // and this project is for someone reactivating a language they HEARD. When a spoken source is
  // added, this test flips — which is the moment to check the licence consequence was faced
  // rather than dodged. See docs/ROADMAP.md item D.
  const { output } = run();
  assert.match(output, /languages\/de\/sources\.json: no spoken-proxy source/);
});

test('a verified claim with no date is rejected', () => {
  const { code, output } = run('--root', fixture('unstamped'));
  assert.equal(code, 1, output);
  assert.match(output, /requires a "verifiedOn" date/);
});

test('a non-boolean licenceVerified is rejected, not coerced', () => {
  const { code, output } = run('--root', fixture('unstamped'));
  assert.equal(code, 1, output);
  assert.match(output, /"licenceVerified" must be an explicit true or false/);
});

test('a clean tree passes and its output may publish', () => {
  assert.equal(run('--root', fixture('clean')).code, 0);
  const { code, output } = run('--root', fixture('clean'), '--publish', 'xx/out/words.txt');
  assert.equal(code, 0, output);
  assert.match(output, /Publish allowed/);
});

test('publishing German is BLOCKED while Leipzig is unverified', () => {
  // Not a hypothetical: this is the live state of languages/de/sources.json. When someone reads the
  // Leipzig terms and stamps them, this test flips and must be updated deliberately — which is the
  // moment to check that the stamp was earned rather than typed.
  const { code, output } = run('--publish', 'de/out/frequency.txt');
  assert.equal(code, 1, output);
  assert.match(output, /PUBLISH BLOCKED/);
  assert.match(output, /leipzig-deu_news_2024_300K/);
});

test('the German lemma table declares share-alike and so is not contaminated', () => {
  // The inverse of the contamination fixture, on real data: lemmas.tsv derives from CC BY-SA
  // treebanks AND declares CC BY-SA, so the arm must NOT fire. Without this, a checker that
  // rejected everything would still pass the fixture above.
  const { code, output } = run('--root', root);
  assert.equal(code, 0, output);
  assert.doesNotMatch(output, /contaminates/);
});
