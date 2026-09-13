import { COVERAGE, ROWS, SOURCES } from './data.generated.js';

/**
 * An offline Arabic→English dictionary, keyed by `@luraty/pack-ar`.
 *
 * ```ts
 * import { msa } from '@luraty/pack-ar';
 * const { lookup } = await import('@luraty/dict-ar-en'); // lazily, when the reader opens
 *
 * lookup(msa.key('وَالكِتَابِ')); // [{ source: 'wiktionary-en', senses: [… 'book' …], pos: ['noun'] }]
 * ```
 *
 * ⚠️ **`lookup` TAKES A KEY, NOT A WORD.** It does no normalizing, stripping or lemmatizing of its
 * own: the dictionary was re-keyed at build time against `@luraty/pack-ar`'s `key()`, and a second
 * normalizer here would be a second answer to "which word is this" that could drift from the pack's.
 * Pass `pack.key(surface)` — or each of `pack.candidates(surface)` when a spelling is ambiguous.
 *
 * ⚠️ **EVERY SENSE IS MACHINE-EXTRACTED AND NOBODY HAS REVIEWED IT.** Attribute each meaning to its
 * `source`; `sources` carries the name, licence and URL a UI needs to do that. Wiktionary-derived
 * data is CC BY-SA 4.0 — see ATTRIBUTION.md before redistributing it.
 *
 * ⚠️ **NO RUNTIME DEPENDENCY ON THE ENGINE OR THE PACK.** A host that never opens the reader never
 * loads this package; one that does pays for one string and a Map built on the first lookup.
 *
 * @module
 */

/**
 * A dictionary this package draws on. One today; `lookup` returns a list of per-source meanings so a
 * second source is a widened union, not a changed return shape.
 */
export type SourceId = 'wiktionary-en';

/** What one source says about one key. */
export interface Meaning {
  readonly source: SourceId;
  /** At most five, each trimmed; a cut is marked with `…`. Never empty. */
  readonly senses: readonly string[];
  /** Parts of speech as the source labels them (`noun`, `verb`, `prep` …). Absent when it gives none. */
  readonly pos?: readonly string[];
}

/** Attribution metadata for one source. */
export interface Source {
  readonly id: SourceId;
  readonly name: string;
  /** SPDX identifier. */
  readonly licence: string;
  readonly url: string;
  /** How the data reached this package, as recorded on the build artifact. */
  readonly provenance: string;
  /** ISO date the artifact was extracted. */
  readonly built: string;
}

/** Counts measured at build time against the pack named in `pack`. */
export interface Coverage {
  /** The exact package version the keys were joined against. */
  readonly pack: string;
  /** Size of that pack's frequency vocabulary. */
  readonly vocabulary: number;
  /** Size of the "commonest words" band reported in `top`. */
  readonly top: number;
  /** Distinct keys with at least one meaning. */
  readonly keys: number;
  readonly sources: Readonly<
    Record<SourceId, { readonly entries: number; readonly senses: number; readonly vocabulary: number; readonly top: number }>
  >;
  /** Vocabulary words with a meaning from at least one source. */
  readonly any: { readonly vocabulary: number; readonly top: number };
}

/** The sources, in display order. */
export const sources: readonly Source[] = SOURCES;

/** How much of `@luraty/pack-ar`'s vocabulary has a meaning, per source and overall. */
export const coverage: Coverage = COVERAGE;

const NONE: readonly Meaning[] = Object.freeze([]);

let table: Map<string, readonly Meaning[]> | undefined;

/**
 * Parsed on the first lookup, not at import.
 *
 * ⚠️ A MAP, NOT AN OBJECT: `'constructor' in {}` is true, so an object would answer a lookup of
 * `constructor` or `__proto__` with something that is not a meaning. It also keeps clear of Hermes'
 * 196,607-property ceiling, which `@luraty/pack-ar` documents.
 */
function load(): Map<string, readonly Meaning[]> {
  const out = new Map<string, Meaning[]>();
  for (const line of ROWS.split('\n')) {
    const [key, source, pos, ...senses] = line.split('\t');
    if (key === undefined || source === undefined || senses.length === 0) continue;
    const meaning: Meaning =
      pos === undefined || pos === ''
        ? { source: source as SourceId, senses: Object.freeze(senses) }
        : { source: source as SourceId, senses: Object.freeze(senses), pos: Object.freeze(pos.split(',')) };
    const list = out.get(key);
    if (list === undefined) out.set(key, [Object.freeze(meaning)]);
    else list.push(Object.freeze(meaning));
  }
  for (const list of out.values()) Object.freeze(list);
  return out;
}

/**
 * Every meaning recorded for a `@luraty/pack-ar` key, one entry per source in `sources` order. `[]`
 * when there is none.
 */
export function lookup(key: string): readonly Meaning[] {
  table ??= load();
  return table.get(key) ?? NONE;
}
