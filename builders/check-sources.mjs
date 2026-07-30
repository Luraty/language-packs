#!/usr/bin/env node
/**
 * The licence gate.
 *
 * ⚠️ WHY THIS IS CODE AND NOT A PARAGRAPH IN A README.
 *
 * The German pack's attribution file already says, in prose: *"Confirm the current terms before
 * shipping."* Prose does not block a publish. Nobody re-reads a caveat they wrote themselves, and
 * this project has already had the Leipzig licence wrong **twice** — once as CC BY-NC, which was
 * treated as a blocker that killed the language, and once as unverified-but-assumed. A licence
 * mistake in a corpus is recoverable; a licence mistake in a *published dataset* has already
 * travelled.
 *
 * Two tiers, on purpose:
 *
 *   `check`   — structure and contamination. MUST be green today, or the gate becomes noise that
 *               everyone learns to skip.
 *   `--publish <lang>/<output>` — additionally demands a human verification stamp. Red until
 *               someone actually reads the upstream terms. That redness is the point.
 *
 * Usage:
 *   node builders/check-sources.mjs
 *   node builders/check-sources.mjs --publish de/out/frequency.txt
 *   node builders/check-sources.mjs --root builders/fixtures/contaminated   (tests)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const publishIndex = args.indexOf('--publish');
const publishTarget = publishIndex >= 0 ? args[publishIndex + 1] : undefined;
// `--root` exists so the gate can be pointed at fixture trees. A checker with no failing-case test
// is a checker nobody has ever seen say no.
const rootIndex = args.indexOf('--root');
const root =
  rootIndex >= 0
    ? resolve(args[rootIndex + 1])
    : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const languagesDir = join(root, 'languages');

const c = {
  red: '[31m',
  yel: '[33m',
  grn: '[32m',
  dim: '[2m',
  off: '[0m',
};

/** A licence id is share-alike if `SA` is one of its dash-separated parts. `CC-BY-SA-4.0` → yes. */
const isShareAlike = (licence) => String(licence).split('-').includes('SA');

const errors = [];
const warnings = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

if (!existsSync(languagesDir)) {
  console.error('no languages/ directory');
  process.exit(2);
}

const languages = readdirSync(languagesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(languagesDir, e.name, 'sources.json')))
  .map((e) => e.name)
  .sort();

if (languages.length === 0) {
  console.error('no languages/*/sources.json found');
  process.exit(2);
}

let publishAllowed = false;

for (const lang of languages) {
  const file = join(languagesDir, lang, 'sources.json');
  const where = `languages/${lang}/sources.json`;

  let doc;
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(where, `not valid JSON — ${String(error)}`);
    continue;
  }

  if (doc.language !== lang) {
    fail(where, `"language" is ${JSON.stringify(doc.language)} but the directory is ${lang}`);
  }

  const byId = new Map();
  for (const [index, source] of (doc.sources ?? []).entries()) {
    const at = `${where} sources[${String(index)}]`;

    for (const field of ['id', 'name', 'licence']) {
      if (typeof source[field] !== 'string' || source[field].length === 0) {
        fail(at, `"${field}" must be a non-empty string`);
      }
    }
    // Booleans, not truthy values. A missing field and an explicit `false` must not read the same —
    // "nobody filled this in" and "somebody checked and it is false" are different facts.
    for (const field of ['licenceVerified', 'redistributeDerived']) {
      if (typeof source[field] !== 'boolean') {
        fail(at, `"${field}" must be an explicit true or false, not ${JSON.stringify(source[field])}`);
      }
    }
    if (source.licenceVerified === true && typeof source.verifiedOn !== 'string') {
      fail(at, '"licenceVerified": true requires a "verifiedOn" date — a claim with no date rots silently');
    }
    if (source.licenceVerified === false && source.verifiedOn !== null) {
      fail(at, '"licenceVerified": false requires "verifiedOn": null');
    }

    if (typeof source.id === 'string') {
      if (byId.has(source.id)) fail(at, `duplicate source id ${JSON.stringify(source.id)}`);
      byId.set(source.id, source);
    }
  }

  for (const [path, output] of Object.entries(doc.outputs ?? {})) {
    const at = `${where} outputs["${path}"]`;

    if (typeof output.licence !== 'string') {
      fail(at, '"licence" must be a string');
      continue;
    }
    if (!existsSync(join(languagesDir, lang, path))) {
      warn(at, 'declared output does not exist on disk yet');
    }

    const from = output.derivedFrom ?? [];
    if (!Array.isArray(from) || from.length === 0) {
      fail(at, '"derivedFrom" must list at least one source id');
      continue;
    }

    const resolved = [];
    for (const id of from) {
      const source = byId.get(id);
      if (!source) {
        fail(at, `"derivedFrom" names ${JSON.stringify(id)}, which is not in "sources"`);
        continue;
      }
      resolved.push(source);
    }

    // ⚠️ THE CONTAMINATION CHECK — the one a human reviewer reliably misses.
    //
    // Hugging Face carries ONE licence field per dataset. Bundle a CC BY-SA input into a dataset
    // you publish as CC BY and the combined work is share-alike anyway: every downstream user is
    // now obliged to share alike, and a frequency list nobody can use permissively is not the
    // public good this repo exists to produce.
    if (!isShareAlike(output.licence)) {
      for (const source of resolved.filter((s) => isShareAlike(s.licence))) {
        fail(
          at,
          `declared "${output.licence}" but derives from ${source.id} which is "${source.licence}" — ` +
            `share-alike contaminates the output. Split the artefact or relicense it.`,
        );
      }
    }

    for (const source of resolved.filter((s) => s.redistributeDerived === false)) {
      fail(at, `derives from ${source.id}, whose "redistributeDerived" is false — this cannot ship`);
    }

    const unverified = resolved.filter((s) => s.licenceVerified !== true);
    const target = `${lang}/${path}`;

    if (publishTarget === target) {
      if (output.publish === null || output.publish === undefined) {
        fail(at, 'has no "publish" target but was requested for publication');
      } else if (unverified.length > 0) {
        fail(
          at,
          `PUBLISH BLOCKED — ${String(unverified.length)} source(s) unverified: ` +
            `${unverified.map((s) => s.id).join(', ')}. Read the upstream terms, then set ` +
            `"licenceVerified": true and "verifiedOn".`,
        );
      } else {
        publishAllowed = true;
      }
    } else if (unverified.length > 0 && output.publish) {
      warn(at, `${String(unverified.length)} unverified source(s) — cannot publish until stamped`);
    }
  }
}

for (const message of warnings) console.error(`  ${c.yel}WARN${c.off} ${message}`);
for (const message of errors) console.error(`  ${c.red}FAIL${c.off} ${message}`);

if (errors.length > 0) {
  console.error(`\n  ${c.red}${String(errors.length)} problem(s).${c.off}`);
  process.exit(1);
}

if (publishTarget !== undefined) {
  if (!publishAllowed) {
    console.error(`\n  ${c.red}No output matched ${publishTarget}.${c.off}`);
    process.exit(1);
  }
  console.error(`\n  ${c.grn}Publish allowed:${c.off} ${publishTarget}`);
} else {
  const plural = languages.length === 1 ? 'language' : 'languages';
  console.error(
    `\n  ${c.grn}Sources OK${c.off} ${c.dim}(${String(languages.length)} ${plural}: ${languages.join(', ')})${c.off}`,
  );
  if (warnings.length > 0) {
    console.error(`  ${c.dim}${String(warnings.length)} warning(s) — nothing is publishable yet.${c.off}`);
  }
}
