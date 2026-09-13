// Regenerate src/data.generated.ts. See build.mjs for what it does and why.
//
// The generated module is checked in on purpose, as in every pack here: a consumer only runs
// `npm install`. `src/data.test.ts` rebuilds it and fails if it drifts from the artifacts or from the
// installed @luraty/pack-ar.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT, build } from './build.mjs';

const { module, coverage, stats } = await build();
writeFileSync(join(PACKAGE_ROOT, 'src', 'data.generated.ts'), module);

const pct = (n, of) => `${((100 * n) / of).toFixed(1)}%`;
for (const [id, s] of Object.entries(stats)) {
  console.log(
    `  ${id.padEnd(14)} ${String(s.entries).padStart(6)} keys ${String(s.senses).padStart(6)} senses` +
      `   top 10,000 ${pct(s.before.top10000, coverage.vocabulary)} → ${pct(s.top10000, coverage.vocabulary)}` +
      `   top 1,000 ${pct(s.before.top1000, coverage.top)} → ${pct(s.top1000, coverage.top)}` +
      `   (${s.droppedSenses} senses dropped)`,
  );
}
console.log(
  `  any            ${String(coverage.keys).padStart(6)} keys` +
    `                top 10,000 ${pct(coverage.any.vocabulary, coverage.vocabulary)}   top 1,000 ${pct(coverage.any.top, coverage.top)}` +
    `   against ${coverage.pack}`,
);
console.log(`  wrote src/data.generated.ts (${module.length.toLocaleString()} chars)`);
