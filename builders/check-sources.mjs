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
 * The licence and register vocabularies live in `licences.mjs`, shared with `check-catalog.mjs` so
 * the two cannot disagree about what a licence id means. Read the comment there before adding one.
 *
 * Usage:
 *   node builders/check-sources.mjs
 *   node builders/check-sources.mjs --publish de/out/frequency.txt
 *   node builders/check-sources.mjs --root builders/fixtures/contaminated   (tests)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AI_CONTAMINATION_YEAR,
  CRAWLED,
  KNOWN_LICENCES,
  LICENCES,
  REGISTERS,
  SPOKEN_PROXY,
  isTextRegister,
} from './licences.mjs';

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

    // An unrecognised licence id is a FAILURE, not a shrug. Guessing at an id nobody has read is
    // how `CC-BY-SA4.0` would pass the old share-alike test.
    if (typeof source.licence === 'string' && !(source.licence in LICENCES)) {
      fail(
        at,
        `unknown licence ${JSON.stringify(source.licence)}. Read the upstream terms, then add the ` +
          `id to LICENCES in builders/licences.mjs. Known: ${KNOWN_LICENCES}`,
      );
    }

    // Register and snapshot year are WARNINGS, because every existing source predates the fields
    // and a gate that fails on day one is a gate people learn to skip. They are warnings that
    // should be closed, not decoration — see docs/METHODOLOGY.md.
    if (source.register === undefined) {
      warn(at, 'no "register" recorded — register predicts list quality more than corpus size does');
    } else if (!REGISTERS.has(source.register)) {
      fail(at, `"register" is ${JSON.stringify(source.register)}; expected one of ${[...REGISTERS].join(', ')}`);
    }

    // Only running-text sources need a collection date. An annotation layer or a hand-written table
    // is not a snapshot of anything, and warning about it would be noise the real warnings hide in.
    const datedRegister = isTextRegister(source.register);

    if (source.snapshotYear === undefined) {
      if (datedRegister) {
        warn(at, 'no "snapshotYear" recorded — the collection date is what decides AI contamination');
      }
    } else if (!Number.isInteger(source.snapshotYear)) {
      fail(at, `"snapshotYear" must be an integer year, not ${JSON.stringify(source.snapshotYear)}`);
    } else if (
      source.snapshotYear > AI_CONTAMINATION_YEAR &&
      CRAWLED.has(source.register)
    ) {
      warn(
        at,
        `${source.register} text collected in ${String(source.snapshotYear)} — after ${String(AI_CONTAMINATION_YEAR)}, ` +
          'so it may contain generative-AI output. Prefer an older snapshot where one exists.',
      );
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
    if (!(output.licence in LICENCES)) {
      fail(
        at,
        `unknown licence ${JSON.stringify(output.licence)}. Known: ${KNOWN_LICENCES}`,
      );
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

    // ⚠️ THE CONTAMINATION CHECKS — the ones a human reviewer reliably misses.
    //
    // Hugging Face carries ONE licence field per dataset. Bundle a restricted input into a dataset
    // you publish permissively and the combined work carries the restriction anyway: every
    // downstream user inherits an obligation nobody told them about, and a frequency list nobody
    // can use freely is not the public good this repo exists to produce.
    //
    // Each term is checked separately because they fail differently. A source can be NC without
    // being SA (`CC-BY-NC-4.0`), and the old dash-splitting check saw neither.
    const outputTerms = LICENCES[output.licence];

    // ⚠️ NON-COMMERCIAL IS FATAL HERE, AND THAT IS A PROJECT DECISION, NOT A PROPERTY OF THE
    // LICENCE. Recorded 2026-07-30.
    //
    // These lists are published free for everyone AND shipped inside Luraty, which has paid
    // features. Two ways of talking yourself past that, and both fail:
    //
    //   1. "I publish it open, so I can use my own list commercially."
    //      NC binds the LICENSEE. On a list derived from an NC corpus you are the licensee, not the
    //      licensor — building the derivative grants you no right the upstream never gave you. Open
    //      sourcing it changes nothing, because the restriction was never yours to lift.
    //
    //   2. "The list is free inside the app; only OTHER features are paid."
    //      NC restricts the USE, not the price tag on one component. The test is whether the use is
    //      directed toward commercial advantage, and NC data underpinning a revenue-generating
    //      product is the case NC exists to prevent — the list does not have to be the thing sold.
    //      Germany reads it harder still: OLG Köln (2014, Deutschlandradio) held CC BY-NC to mean
    //      strictly PRIVATE use, excluding even a public broadcaster. That is the jurisdiction a
    //      German-language pack is most likely to be argued in.
    //
    // So the two NC arms below close a loop rather than duplicate each other:
    //
    //   NC source → non-NC output   contamination, caught in the loop below
    //   NC source → NC output       policy, caught HERE
    //
    // Between them, an NC source cannot be used in this repo at all. That is the intended reading:
    // `UD_Arabic-PADT` and `UD_German-LIT` are not "blocked for the permissive list", they are out.
    //
    // ⚠️ SHARE-ALIKE IS NOT IN THIS CATEGORY and must not be lumped in with it. CC BY-SA permits
    // commercial use, paid features and all. It constrains how the DATA FILE is licensed onward,
    // not whether it may earn money — which is why lemmas.tsv is fine and PADT is not.
    //
    // ⚠️ This is a judgement, not a legal finding, and nobody here is a lawyer. If a qualified
    // opinion ever says otherwise, the lever is the `nonCommercial` flag in builders/licences.mjs.
    // Until then the position is the cautious one, because a published dataset cannot be recalled —
    // the same reasoning the header of this file gives for the gate existing at all.
    if (outputTerms.nonCommercial) {
      fail(
        at,
        `declared "${output.licence}", which is non-commercial. These lists ship inside Luraty, ` +
          `which has paid features — and NC restricts the USE, not the price tag on one component, ` +
          `so "the list itself is free" does not rescue it. NC also binds the licensee, so ` +
          `publishing openly lifts nothing that was never ours to lift. There is no NC output this ` +
          `project can ship. Drop the NC source instead; see languages/de/SOURCES.md.`,
      );
    }

    for (const source of resolved) {
      const terms = LICENCES[source.licence];
      if (!terms) continue; // already reported as an unknown id on the source itself

      if (terms.shareAlike && !outputTerms.shareAlike) {
        fail(
          at,
          `declared "${output.licence}" but derives from ${source.id} which is "${source.licence}" — ` +
            `share-alike contaminates the output. Split the artefact or relicense it.`,
        );
      }

      if (terms.nonCommercial && !outputTerms.nonCommercial) {
        fail(
          at,
          `declared "${output.licence}" but derives from ${source.id} which is "${source.licence}" — ` +
            `non-commercial contaminates the output. Publishing it as ${output.licence} would tell ` +
            `every downstream user they may sell what they may not. Split the artefact or relicense it.`,
        );
      }

      // ⚠️ No-derivatives has no output licence that rescues it. A frequency count IS an adaptation
      // of the corpus, so there is nothing to relicense — the source has to go.
      if (terms.noDerivatives) {
        fail(
          at,
          `derives from ${source.id} which is "${source.licence}" — no-derivatives forbids ` +
            `distributing an adaptation, and a frequency count is one. Drop the source.`,
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

  // ⚠️ THE REGISTER GAP, and it is currently open for German.
  //
  // Subtitle frequencies predict human word recognition better than book or news frequencies, by
  // 4–15% of explained variance across four languages (Brysbaert & New 2009). A list built only
  // from news and web text is a list of how people WRITE, and this project exists for someone
  // reactivating a language they HEARD at home. That is the wrong register for the audience.
  //
  // A warning rather than a failure: the German list is real and useful as it stands, and closing
  // this needs a licence decision (the obvious spoken sources are CC BY-SA), not a code change.
  // See docs/METHODOLOGY.md §1 and docs/ROADMAP.md item D.
  const textSources = (doc.sources ?? []).filter((s) => isTextRegister(s.register));
  if (Object.keys(doc.outputs ?? {}).length > 0 && textSources.length > 0) {
    if (!textSources.some((s) => SPOKEN_PROXY.has(s.register))) {
      warn(
        where,
        `no spoken-proxy source (${[...SPOKEN_PROXY].join('/')}) — the list describes written ` +
          `${doc.name ?? lang}, not spoken. See docs/METHODOLOGY.md §1.`,
      );
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
