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
