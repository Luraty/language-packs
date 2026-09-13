import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { msa, vocabulary } from '@luraty/pack-ar';
import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs build script, no declarations; tests are not typechecked by tsc.
import { MAX_SENSES, build, loadPack } from '../scripts/build.mjs';
import { COVERAGE, ROWS, SOURCES } from './data.generated.js';
import { coverage, lookup, sources, type SourceId } from './index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rows = ROWS.split('\n').map((line) => line.split('\t'));

describe('the generated data', () => {
  it('is exactly what a rebuild from languages/fusha/out produces', async () => {
    // ⚠️ Also fails when @luraty/pack-ar is bumped: the keys are a function of the installed pack.
    const { module } = await build();
    expect(readFileSync(join(root, 'src', 'data.generated.ts'), 'utf8') === module).toBe(true);
  }, 60_000);

  it('has no empty sense, no empty key, and at most five senses per source', () => {
    for (const [key, source, , ...senses] of rows) {
      expect(key).toBeTruthy();
      expect(source).toBeTruthy();
      expect(senses.length).toBeGreaterThan(0);
      expect(senses.length).toBeLessThanOrEqual(MAX_SENSES);
      for (const sense of senses) expect(sense.trim().length).toBeGreaterThan(0);
      expect(new Set(senses).size).toBe(senses.length);
    }
  });

  it('keys every entry by an address pack-ar itself produces', async () => {
    // ⚠️ THE #106 GUARD, for a third description of the language: a key nothing can reach is a
    // meaning no learner sees, and every test would stay green.
    const { reachable } = await loadPack();
    const unreachable = rows.map(([key]) => key as string).filter((k) => !reachable.has(k) || msa.key(k) !== k);
    expect(unreachable).toEqual([]);
  }, 60_000);

  it('uses every source in its metadata, and no other', () => {
    const inData = new Set(rows.map(([, source]) => source));
    expect([...inData].sort()).toEqual(SOURCES.map((s) => s.id).sort());
    expect(sources).toBe(SOURCES);
  });

  it('reports coverage that equals a recount through lookup()', () => {
    const top = vocabulary.slice(0, COVERAGE.top);
    const count = (list: readonly string[], source?: SourceId) =>
      list.filter((k) => lookup(k).some((m) => source === undefined || m.source === source)).length;
    expect(coverage.vocabulary).toBe(vocabulary.length);
    for (const s of sources) {
      const own = rows.filter(([, source]) => source === s.id);
      expect(coverage.sources[s.id]).toEqual({
        entries: own.length,
        senses: own.reduce((n, r) => n + r.length - 3, 0),
        vocabulary: count(vocabulary, s.id),
        top: count(top, s.id),
      });
    }
    expect(coverage.any).toEqual({ vocabulary: count(vocabulary), top: count(top) });
    expect(coverage.keys).toBe(new Set(rows.map(([key]) => key)).size);
  });

  it('keeps sense text on one line with no tab, so the row format cannot split a sense', () => {
    expect(ROWS.includes('\r')).toBe(false);
    for (const r of rows) expect(r.length).toBeGreaterThanOrEqual(4);
  });
});
