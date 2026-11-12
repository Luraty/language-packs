// Writes input-to-output fixtures to tests/parity/ by running the REAL @luraty packages.
//
//   UPDATE_PARITY=1 node scripts/generate_parity_vectors.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (process.env.UPDATE_PARITY !== '1') {
  console.error('refusing to regenerate: set UPDATE_PARITY=1');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'tests/parity');
// The published npm packages, pinned in scripts/package.json: `npm ci --prefix scripts` first.
const pkg = (p) => join(here, 'node_modules/@luraty', p);
const load = (p) => import(pathToFileURL(pkg(p)).href);

const E = await load('engine/dist/index.mjs');
const AR = await load('pack-ar/dist/index.mjs');
const QU = await load('pack-ar-x-quran/dist/index.mjs');
const DICT = await load('dict-ar-en/dist/index.mjs');

let total = 0;
// Only the fixtures this repo keeps are rewritten; the engine's own live in Luraty/engine.
const write = (name, value, count) => {
  if (!existsSync(join(out, `${name}.json`))) return;
  writeFileSync(join(out, `${name}.json`), `${JSON.stringify(value)}\n`);
  total += count;
  console.log(`${name}: ${count}`);
};

// ── Deterministic randomness ────────────────────────────────────────────────────────────────────
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
  };
}
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const everyNth = (xs, n) => xs.filter((_, i) => i % n === 0);

// Values JSON cannot carry.
const enc = (v) => {
  if (v === undefined) return { $: 'undefined' };
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { $: 'NaN' };
    if (v === Infinity) return { $: 'Infinity' };
    if (v === -Infinity) return { $: '-Infinity' };
    if (Object.is(v, -0)) return { $: '-0' };
  }
  return v;
};
const attempt = (fn) => {
  try {
    const v = fn();
    return { value: v === undefined ? null : v };
  } catch (e) {
    return { throws: e.constructor.name };
  }
};

// ── Shared inputs ───────────────────────────────────────────────────────────────────────────────
const LONG = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.repeat(12);
const ADVERSARIAL = [
  '', ' ', '  ', 'a', 'A', 'Z', 'É', 'é', 'İ', 'I', 'ı', 'ß', 'ẞ', 'Σ', 'ΑΣ', 'ΑΣ Β', 'ΑΣΑ', "Α'Σ", 'ΑΣ\'', 'Ǆ', 'ǅ', 'ﬁ', 'Ω', 'K', 'Å',
  'ـ', 'ـــ', 'كـــتاب', 'كِتَابٌ', 'الكِتَابُ', 'وَالكِتَابِ', 'ٱلْحَمْدُ', 'هُدًۭى', 'ۖ', '۞', 'ۛ', 'أحمد', 'إسلام', 'آمن', 'ٱسم', 'مدرسة', 'مستشفى', 'كتب', 'ذهب', 'ولد', 'في',
  '٪', '،', '؛', '؟', '۔', '١٢٣', 'abc123', 'مرحبا123', '123', '1.', 'x:y', ':', '::',
  '😀', '👍🏽', '𝔘𝔫𝔦𝔠𝔬𝔡𝔢', 'a😀b', 'كتاب😀', '😀كتاب', '\ud83d', '\ude00', 'a\ud83db', '\ude00\ud83d', '\ud83d-\ude00', '\ud83dـ\ude00', 'a\ud83dً\ude00b', '\ud83d.\ud83d.\ude00', '�', '￿', '\u{10ffff}',
  'hello مرحبا Привет 你好', 'Hello, World!', "l'automne", "L'Automne", "j'ai", "qu'il", '‘quoted’', '“double”', '«guillemets»', '„low“', '–dash—', 'a-b_c/d\\e|f@g#h$i%j^k&l*m+n=o~p',
  'Straße', 'STRASSE', 'Äpfel', 'ÖL', 'Übung', 'schön', 'schon', 'zählen', 'zahlen', 'Bahnhofstraße', 'Café', 'naïve', 'œuvre', 'æther', 'ñandú', 'ÿ', 'Ÿ', 'Ç', 'Œ', 'Æ', 'Ø', 'ø',
  'constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty',
  'a b', ' a ', '﻿a', 'a﻿', 'a​b', ' x ', 'a\tb\nc\r\nd', '\x00', 'a\x00b', '\x1c\x1d\x1e\x1fx', '\x85x\x85', '᠎x', '　x　', ' x', ' x ', '  ',
  '...', '!!!', '?', '"', '`', "'", "''", '\\', 'ءا', 'ءَ', 'ٮ', 'ۓ', 'ۓۓ', 'ې', '٠', '٩', '۰', '۹', 'ﷺ', 'ﻻ',
  LONG, 'ا'.repeat(100), 'a'.repeat(50),
];

const FR_CONFIG = {
  id: 'fr',
  tokenize: { strategy: 'regex', pattern: "[a-zA-Zà-öø-ÿ']+" },
  normalize: ['lowercase', 'stripPunctuation', 'foldLatinDiacritics'],
  affixes: { prefixes: ["l'", "d'", "j'", "n'", "qu'", "s'", "c'", "m'", "t'"], onlyIfRemainderKnown: true },
  compare: ['lowercase', 'stripPunctuation', 'foldLatinDiacritics'],
};
const FR_DATA = {
  frequency: 'de la le et les des en un une du que est il pour dans qui ne sur se pas plus par je avec tout faire son mettre autre on mais nous comme ou si leur y dire elle avant deux mots automne marche marché pain vendre acheter maison eau',
  lemmas: { vais: 'aller', vas: 'aller', va: 'aller', allons: 'aller', allez: 'aller', vont: 'aller', suis: 'etre', es: 'etre', est: 'etre', sommes: 'etre' },
};
const ARF_CONFIG = {
  id: 'ar-msa',
  tokenize: { strategy: 'regex', pattern: '[\\u0600-\\u06FF]+' },
  normalize: ['stripArabicDiacritics', 'stripTatweel', 'normalizeArabicAlef', 'normalizeArabicFinals'],
  affixes: { prefixes: ['ال', 'لل', 'و', 'ب', 'ل', 'ف', 'ك'], onlyIfRemainderKnown: true },
  compare: ['stripPunctuation', 'stripArabicDiacritics', 'stripTatweel', 'normalizeArabicAlef', 'normalizeArabicFinals'],
};
const ARF_DATA = {
  frequency: 'في من على أن إلى عن مع هذا التي كان قد لا ما هو كل بعد بين حول عند سوق كتاب مدرسة بيت ماء خبز شارع مطار طبيب قطار جريدة حكومة ولد وقت مدينة كتب مدرس',
  lemmas: { كتب: ['كتب', 'كتاب'], مدرسة: ['مدرسة', 'مدرس'] },
};
const DE_CONFIG = {
  id: 'de',
  tokenize: { strategy: 'regex', pattern: '[a-zA-ZäöüÄÖÜßẞ]+' },
  normalize: ['lowercase', 'stripPunctuation', 'foldGermanUmlauts', 'foldLatinDiacritics'],
  affixes: { prefixes: ['ge'], onlyIfRemainderKnown: true },
  compounds: { minPartLength: 4, linkers: ['', 's', 'n', 'en', 'es'] },
  compare: ['lowercase', 'stripPunctuation', 'foldGermanUmlauts', 'foldLatinDiacritics'],
};
const DE_DATA = {
  frequency: 'der die und in den von zu das mit sich haus stadt land wasser brot markt strasse bahnhof arzt zeitung regierung schule buch tuer fenster garten baum blume himmel sonne mond stern gehen kommen machen sagen sehen geben nehmen finden kaufen laufen fahren schoen topf',
  lemmas: { geht: 'gehen', gegangen: 'gehen', gekauft: 'kaufen', zählt: 'zählen', zahlt: 'zahlen', läuft: 'laufen', fährt: 'fahren' },
};

const unwrap = (r) => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const FR = unwrap(E.createPack(FR_CONFIG, FR_DATA));
const ARF = unwrap(E.createPack(ARF_CONFIG, ARF_DATA));
const DE = unwrap(E.createPack(DE_CONFIG, DE_DATA));

// ── Normalize steps ─────────────────────────────────────────────────────────────────────────────
{
  const STEPS = ['lowercase', 'stripPunctuation', 'stripArabicDiacritics', 'stripTatweel', 'normalizeArabicAlef', 'normalizeArabicFinals', 'foldLatinDiacritics', 'foldGermanUmlauts'];
  const packFor = (normalize) => unwrap(E.createPack({ id: 'x', tokenize: { strategy: 'regex', pattern: '[a]+' }, normalize, compare: normalize }, { frequency: '' }));
  const strings = [
    ...ADVERSARIAL,
    ...everyNth(AR.frequency.split('\n'), 97),
    ...everyNth(QU.frequency.split('\n'), 97),
  ];
  const r = rng(11);
  const POOL = [...'aAéÉßẞäÄöÖüÜΣσς .,!-كتابأإآٱةىـًٌٍَُِّْٰ۟ۖ😀𝔘', '\ud83d', '\ude00', 'İ', 'ۭ'];
  for (let i = 0; i < 400; i++) {
    let s = '';
    for (let j = r.int(0, 14); j > 0; j--) s += r.pick(POOL);
    strings.push(s);
  }
  const changed = {};
  const outputs = {};
  let count = 0;
  for (const step of STEPS) {
    const p = packFor([step]);
    const table = {};
    for (let c = 0; c < 0x110000; c++) {
      const s = c >= 0xd800 && c <= 0xdfff ? String.fromCharCode(c) : String.fromCodePoint(c);
      const o = p.key(s);
      if (o !== s) table[c] = o;
    }
    changed[step] = table;
    outputs[step] = strings.map((s) => p.key(s));
    count += 0x110000 + strings.length;
  }
  const chain = [...STEPS, ...[...STEPS].reverse()];
  const chained = (() => {
    const p = packFor(chain);
    return strings.map((s) => p.key(s));
  })();
  count += strings.length;

  const lower = packFor(['lowercase']);
  const h = createHash('sha256');
  for (let c = 0; c < 0x110000; c++) {
    if (c >= 0xd800 && c <= 0xdfff) continue;
    const x = String.fromCodePoint(c);
    h.update(`${lower.key(`AΣ${x}`)}|${lower.key(`${x}Σ`)}|${lower.key(`A${x}Σ`)}|${lower.key(`AΣ${x}B`)}\n`, 'utf8');
  }
  count += 4 * (0x110000 - 0x800);
  write('normalize', { steps: STEPS, changed, strings, outputs, chain, chained, sigmaDigest: h.digest('hex') }, count);
}

// ── Whitespace, the two definitions the engine relies on ────────────────────────────────────────
{
  const identity = unwrap(E.createPack({ id: 'x', tokenize: { strategy: 'regex', pattern: '[a]+' }, normalize: [], compare: [] }, { frequency: '' }));
  const split = [];
  const trim = [];
  for (let c = 0; c < 0x10000; c++) {
    const ch = String.fromCharCode(c);
    if (E.vocabularyOf(identity, `a${ch}b`).length === 2) split.push(c);
    if (ch !== 'a' && identity.compare(`${ch}a${ch}`, 'a') === 1) trim.push(c);
  }
  write('whitespace', { split, trim }, 0x20000);
}

// ── The real packs ──────────────────────────────────────────────────────────────────────────────
function packVectors(name, pack, mod, dir, texts) {
  const rows = readFileSync(pkg(`${dir}/lemmas.tsv`), 'utf8').trim().split('\n');
  const forms = rows.map((l) => l.split('\t')[0]);
  const readings = rows.flatMap((l) => l.split('\t').slice(1));
  const freq = mod.frequency.split(/\s+/);
  const sampled = [...ADVERSARIAL, ...everyNth(forms, 67), ...everyNth(readings, 211), ...everyNth(freq, 7)];
  const surfaces = sampled.map((s) => ({ s, key: pack.key(s), candidates: pack.candidates(s), rank: pack.rank(s) ?? null, rankOfKey: pack.rank(pack.key(s)) ?? null }));

  const digest = createHash('sha256');
  for (const s of [...forms, ...readings, ...freq]) digest.update(`${s}\t${pack.key(s)}\t${pack.candidates(s).join('|')}\t${pack.rank(pack.key(s)) ?? ''}\n`, 'utf8');

  const splits = [...texts, ...ADVERSARIAL, ADVERSARIAL.join(' ')].map((t) => ({ t, tokens: pack.split(t) }));
  const r = rng(23);
  const compareInputs = [...ADVERSARIAL, ...everyNth(freq, 500), ...everyNth(forms, 5000)];
  const compares = [];
  for (let i = 0; i < 1500; i++) {
    const a = r.pick(compareInputs);
    const b = r.next() < 0.4 ? a : r.pick(compareInputs);
    compares.push({ a, b, r: pack.compare(a, b) });
  }
  for (const a of everyNth(freq, 100)) compares.push({ a: `  ${a} `, b: a, r: pack.compare(`  ${a} `, a) });

  write(name, {
    id: pack.id,
    frequencySha: sha(mod.frequency),
    frequencyLength: mod.frequency.length,
    sample: mod.sample,
    vocabularySha: sha(JSON.stringify(mod.vocabulary)),
    vocabularyLength: mod.vocabulary.length,
    vocabularyHead: mod.vocabulary.slice(0, 100),
    selfCheck: [mod.sample, 'bonjour le monde', '', ...texts].map((t) => ({ t, problems: mod.selfCheck(t) })),
    surfaces,
    allDigest: digest.digest('hex'),
    allCount: forms.length + readings.length + freq.length,
    splits,
    compares,
  }, surfaces.length + forms.length + readings.length + freq.length + splits.length + compares.length);
}
packVectors('pack_ar', AR.msa, AR, 'pack-ar', [AR.sample, QU.sample]);
packVectors('pack_ar_x_quran', QU.arQuran, QU, 'pack-ar-x-quran', [QU.sample, AR.sample]);

// ── Dictionary ──────────────────────────────────────────────────────────────────────────────────
{
  const keys = JSON.parse(readFileSync(join(root, 'src/luraty_packs/data/dict-ar-en/dictionary.json'), 'utf8')).entries.map((e) => e[0]);
  const hits = everyNth(keys, 5).map((k) => ({ k, meanings: DICT.lookup(k) }));
  const misses = ['', ' ', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'nope', 'كِتَاب', '😀', ...everyNth(AR.vocabulary, 37).filter((v) => DICT.lookup(v).length === 0)].map((k) => ({ k, meanings: DICT.lookup(k) }));
  const digest = createHash('sha256');
  for (const k of keys) digest.update(`${JSON.stringify([k, DICT.lookup(k)])}\n`, 'utf8');
  write('dictionary', { sources: DICT.sources, coverage: DICT.coverage, keyCount: keys.length, digest: digest.digest('hex'), hits, misses }, keys.length + hits.length + misses.length);
}

// ── createPack ──────────────────────────────────────────────────────────────────────────────────
{
  const base = (over = {}) => ({ id: 'x', tokenize: { strategy: 'regex', pattern: '[a-z.]+' }, normalize: ['lowercase', 'stripPunctuation'], compare: ['lowercase'], ...over });
  const data = { frequency: 'haus tuer bahnhof strasse apfel baum ab cd abcd' };
  const without = (k) => {
    const c = base();
    delete c[k];
    return c;
  };
  const cases = [];
  const add = (config, d = data, extra = {}) => cases.push({ config, data: d, ...extra });

  for (const c of [null, 5, 'x', true, [], [1], {}]) add(c);
  for (const id of [undefined, '', 5, null, true, [], 'a:b', ':', 'ok-id', '😀']) {
    const c = base();
    if (id === undefined) delete c.id;
    else c.id = id;
    add(c);
  }
  for (const t of [undefined, null, 5, 'x', [], {}, { pattern: 5 }, { pattern: '[a]+' }, { strategy: 'regex' }, { strategy: 'dict', pattern: '[a]+' }, { strategy: 5, pattern: '[a]+' }, { strategy: null, pattern: '[a]+' }, { strategy: [1, null, 'a'], pattern: '[a]+' }, { strategy: {}, pattern: '[a]+' }, { strategy: true, pattern: '[a]+' }, { strategy: 1e21, pattern: '[a]+' }, { strategy: 1.5e-7, pattern: '[a]+' }]) {
    const c = base();
    if (t === undefined) delete c.tokenize;
    else c.tokenize = t;
    add(c);
  }
  for (const d of [null, 5, 'x', [], {}, { frequency: 5 }, { frequency: null }, { frequency: '' }, { frequency: 'a\nb\tc  d e　f﻿g' }, { frequency: ' a a b ' }]) add(base(), d);
  for (const field of ['normalize', 'compare']) {
    add(without(field));
    for (const v of [null, 'lowercase', 5, {}, [], ['stripDiacritics'], [1], [null], [true], [{ b: 1, 2: 2, a: [1, null] }], [[1, 'a']], [1.5], [1e21], ['constructor'], ['__proto__'], ['lowercase', 'nope']]) add(base({ [field]: v }));
  }

  const PATTERNS = [
    '[a-z]+', '[\\u0620-\\u065F\\u066E-\\u06D3\\u06D5-\\u06FF]+', '[\\d]+', '[\\D]+', '[\\w]+', '[\\W]+', '[\\s]+', '[\\S]+', '[^a]+', '[^]+', '[^\\s\\S]+', '[a-]+', '[-a]+', '[--a]+', '[a-b-c]+', '[a--]+', '[+--]+', '[\\-]+', '[\\]]+', '[\\[]+', '[[]+', '[\\^]+', '[a^]+', '[\\\\]+',
    '[\\b]+', '[\\0]+', '[\\01]+', '[\\0a]+', '[\\cA]+', '[\\ca]+', '[\\c1]+', '[\\c_]+', '[\\c]+', '[\\x41]+', '[\\x4]+', '[\\xZZ]+', '[\\u0041]+', '[\\u004]+', '[\\u{41}]+', '[\\u{110000}]+', '[\\u{10FFFF}]+', '[\\u{}]+', '[\\u{41]+', '[\\uD83D\\uDE00]+', '[\\uD83D]+', '[\\uDE00]+', '[\\u{D83D}\\u{DE00}]+', '[\\u{1F600}-\\u{1F64F}]+', '[😀-😏]+', '[😀]+', '[😏-😀]+', '[\ud83d]+',
    '[z-a]+', '[\\d-x]+', '[x-\\d]+', '[\\d-]+', '[-\\d]+', '[\\s-\\d]+', '[\\a]+', '[\\_]+', '[\\/]+', '[\\.]+', '[\\*\\+\\?\\(\\)\\{\\}\\|\\$]+', "[\\']+", '[\\1]+', '[\\9]+', '[\\B]+', '[\\k]+', '[\\e]+', '[\\n\\r\\t\\v\\f]+', '[\\p]+', '[\\P]+', '[\\pL]+', '[.]+', '[$]+', '[(]+', '[{}]+', '[|]+', '[/]+',
    '[a-zA-Zà-öø-ÿ\']+', '[a-zA-ZäöüÄÖÜßẞ]+', '[\\u0600-\\u06FF]+', '[ا-ي]+',
    '(a+)+b', 'a+', '[a]', '[a]*', '[a]+b', '[]+', '[a', '', '[a]++', '^[a]+', '[a]+$', '[\\\n]+', '[\n]+', '[\r]+', '[ ]+', '[\\ ]+', '[\\\r]+', '[a\\', '[\\]+', '[a]b]+', '[\\]a]+',
    `[${'a'.repeat(197)}]+`, `[${'a'.repeat(198)}]+`, `[${'😀'.repeat(99)}]+`, `[${'😀'.repeat(98)}]+`,
  ];
  for (const pattern of PATTERNS) add(base({ tokenize: { strategy: 'regex', pattern } }));

  for (const affixes of [null, 5, 'abc', [], {}, { prefixes: null }, { prefixes: 5 }, { prefixes: {} }, { prefixes: true }, { prefixes: 'hb' }, { prefixes: [] }, { prefixes: [5] }, { prefixes: [null] }, { prefixes: [null, 'a'] }, { prefixes: ['a', 'ab', 'abc', 'x'] }, { prefixes: ['ab', 'cd', 'x', 'yz'] }, { prefixes: [''] }, { prefixes: ['h'], onlyIfRemainderKnown: false }, { prefixes: ['h'], onlyIfRemainderKnown: 0 }, { prefixes: ['h'], onlyIfRemainderKnown: '' }, { prefixes: ['h'], onlyIfRemainderKnown: null }, { prefixes: ['h'], onlyIfRemainderKnown: 'x' }, { prefixes: ['h'], onlyIfRemainderKnown: [] }, { prefixes: ['h'], onlyIfRemainderKnown: {} }, { prefixes: [['h']] }, { prefixes: ['\ud83d'], onlyIfRemainderKnown: false }, { prefixes: ['😀'], onlyIfRemainderKnown: false }, { prefixes: ['a😀', '😀'], onlyIfRemainderKnown: false }, { onlyIfRemainderKnown: false }]) {
    add(base({ affixes }));
  }
  const cdata = { frequency: 'haus tuer bahnhof strasse apfel baum 😀😀 wort' };
  for (const compounds of [null, 5, 'x', [], {}, { minPartLength: 4 }, { linkers: [''] }, { minPartLength: 4, linkers: [''] }, { minPartLength: 4, linkers: ['', 's', 'n'] }, { minPartLength: 2, linkers: [''] }, { minPartLength: '4', linkers: [''] }, { minPartLength: 2.5, linkers: ['', 's'] }, { minPartLength: null, linkers: [''] }, { minPartLength: true, linkers: [''] }, { minPartLength: 'x', linkers: [''] }, { minPartLength: 0, linkers: [''] }, { minPartLength: 3, linkers: 's' }, { minPartLength: 3, linkers: 5 }, { minPartLength: 3, linkers: null }, { minPartLength: 3, linkers: {} }, { minPartLength: 3, linkers: [null] }, { minPartLength: 3, linkers: [1] }, { minPartLength: 3, linkers: [['s']] }, { minPartLength: 3, linkers: [true] }, { minPartLength: 3, linkers: [{}] }, { minPartLength: 1, linkers: [''] }]) {
    add(base({ compounds }), cdata);
  }

  const lemmaBase = base({ normalize: ['lowercase', 'stripPunctuation', 'stripTatweel'] });
  for (const lemmas of [null, 5, true, 'ab', ['q', 'r'], [], {}, { '1.': 'a', 1: 'b' }, { 'b.': 'a', b: 'c' }, { 10: 'x', 9: 'y', 'a.': 'z', a: 'w' }, { 4294967294: 'x', 4294967295: 'y', '4294967295.': 'z', '4294967294.': 'w' }, { '01': 'x', 1: 'y' }, { q: null }, { q: 5 }, { q: [] }, { q: [1, 'x'] }, { q: ['', 'a'] }, { q: ['a', 'a'] }, { q: ['A', 'a', 'b.'] }, { q: 'ـ' }, { q: ['ـ'] }, { ـ: 'x' }, { q: { a: 1 } }, { constructor: 'x', __proto__x: 'y' }, { Q: 'a', q: 'b' }]) {
    add(lemmaBase, { frequency: 'a b', lemmas });
  }
  const mapped = [[['1.', 'a'], ['1', 'b']], [['b.', 'a'], ['b', 'c']], [['q', 'x'], ['Q', 'y']]];
  for (const pairs of mapped) add(lemmaBase, { frequency: 'a b', lemmasMap: pairs });

  add(FR_CONFIG, FR_DATA);
  add(ARF_CONFIG, ARF_DATA);
  add(DE_CONFIG, DE_DATA);

  const PROBES = [...ADVERSARIAL, 'haus', 'Haus.', 'tuer', 'hbaum', 'habcd', 'bahnhofstrasse', 'bahnhofsstrasse', 'haustuer', 'apfelbaum', 'hausbaumtuer', 'hauss', 'wortwort', '😀😀haus', 'haus😀😀', '😀😀😀😀', 'xhaus', 'abcd', 'aab', 'q', 'Q', 'b', 'b.', '1', '1.', '10', '9', '01', '0', 'a.', '4294967294', '4294967295', 'ax', 'gegangen', 'Bahnhofstraße', 'Blumentopf', 'geben'];
  const PROBE_TEXT = ['abc xyz. 123 _a-b', ADVERSARIAL.join(' '), 'x\ny\rz w', String.fromCodePoint(1, 8, 9, 10, 11, 12, 13, 27, 45, 47, 65, 94, 0x1f600, 0x1f610, 0x10ffff, 0x660), '😀\ud83d x\ude00'];
  const results = cases.map((c) => {
    const d = c.data !== null && typeof c.data === 'object' && 'lemmasMap' in c.data ? { frequency: c.data.frequency, lemmas: new Map(c.data.lemmasMap) } : c.data;
    let r;
    try {
      r = E.createPack(c.config, d);
    } catch (e) {
      return { throws: e.constructor.name };
    }
    if (!r.ok) return { error: r.error };
    const p = r.value;
    return {
      id: p.id,
      keys: PROBES.map((s) => attempt(() => p.key(s))),
      candidates: PROBES.map((s) => attempt(() => p.candidates(s))),
      ranks: PROBES.map((s) => attempt(() => p.rank(s))),
      splits: PROBE_TEXT.map((t) => attempt(() => p.split(t))),
      compares: PROBES.slice(0, 80).map((s) => attempt(() => p.compare(s, 'a'))),
    };
  });
  write('create_pack', { cases, results, probes: PROBES, probeText: PROBE_TEXT }, cases.length);
}

// ── checkPack ───────────────────────────────────────────────────────────────────────────────────
{
  const cfg = (over) => ({ id: 'p', tokenize: { strategy: 'regex', pattern: '[a-z]+' }, normalize: ['lowercase'], compare: ['lowercase'], ...over });
  const samples = ['haus baum', 'HAUS', '', '123', 'zzq', 'haus baum tuer haus'];
  const built = [
    ['fr', FR_CONFIG, FR_DATA],
    ['ar', ARF_CONFIG, ARF_DATA],
    ['de', DE_CONFIG, DE_DATA],
    ['empty', cfg({}), { frequency: '' }],
    ['ok', cfg({}), { frequency: 'haus baum tuer' }],
    ['unstable', cfg({}), { frequency: 'haus baum', lemmas: { haus: 'baum', baum: 'tuer' } }],
    ['multi', cfg({}), { frequency: 'haus baum', lemmas: { haus: ['haus', 'baum'], baum: 'baum' } }],
    ['driftReading', cfg({}), { frequency: 'haus baum tuer', lemmas: { haus: ['haus', 'baum'], baum: 'tuer' } }],
    ['compareEmpty', cfg({ compare: ['lowercase', 'stripPunctuation'] }), { frequency: 'haus' }],
  ];
  const results = [];
  for (const [name, c, d] of built) {
    const p = unwrap(E.createPack(c, d));
    for (const s of [...samples, 'كتب مدرسة', "l'automne est", 'Bahnhofstraße']) results.push({ pack: name, sample: s, problems: E.checkPack(p, { text: s }) });
  }
  const scripted = [
    { id: 's1', tokens: ['a'], keys: { a: 'a' }, candidates: { a: [] }, ranks: { a: 1 }, compare: [1, 0] },
    { id: 's2', tokens: ['a', 'b'], keys: { a: 'a', b: 'b' }, candidates: { a: ['z'], b: ['b'] }, ranks: { a: 1 }, compare: [1, 0] },
    { id: 's3', tokens: ['a'], keys: { a: 'a' }, candidates: { a: ['a', 'a'] }, ranks: {}, compare: [1, 0] },
    { id: 's4', tokens: ['a'], keys: { a: 'a', c: 'd' }, candidates: { a: ['a', 'c'] }, ranks: { a: 1 }, compare: [0, 1] },
    { id: 's5', tokens: ['a', 'b'], keys: { a: 'b', b: 'c', c: 'c' }, candidates: { a: ['b'], b: ['c'], c: ['c'] }, ranks: { c: 1 }, compare: [1, 1] },
    { id: 's6', tokens: [], keys: {}, candidates: {}, ranks: {}, compare: [1, 0] },
  ];
  const fromScript = (s) => ({ id: s.id, split: () => s.tokens, key: (w) => s.keys[w] ?? w, candidates: (w) => s.candidates[w] ?? [s.keys[w] ?? w], rank: (w) => s.ranks[w], compare: (a, b) => (a === b ? s.compare[0] : s.compare[1]) });
  const scriptedResults = scripted.map((s) => E.checkPack(fromScript(s), { text: 'x' }));
  write('check_pack', { results, scripted, scriptedResults }, results.length + scripted.length);
}

// ── Evidence sequences ──────────────────────────────────────────────────────────────────────────
const SEQ_WORDS = ['a', 'b', 'سوق', 'كتاب', '😀', '￿', '�', 'é', 'x:y', '𝔘', 'z😀', '\ud83d', 'word', '１'];
const SEQ_MODALITIES = ['recognise', 'produce', 'pronounce', 'write', 'hear', 'skill'];
const SEQ_VARIETIES = ['ar', 'ar-x-quran', 'de', 'é'];
function randomEvidence(r, maxDay, units) {
  const unit = r.pick(units);
  const d = r.int(0, maxDay);
  const k = r.next();
  if (k < 0.5) return { kind: 'retrieval', unit, outcome: r.next() < 0.6 ? 'known' : 'unknown', day: d };
  if (k < 0.67) return { kind: 'exposure', unit, day: d };
  if (k < 0.84) return { kind: 'help', unit, day: d };
  return { kind: 'claim', unit, day: d };
}
function universe(r, size) {
  const units = [];
  for (let i = 0; i < size; i++) units.push(E.unitKey(r.pick(SEQ_MODALITIES), r.pick(SEQ_VARIETIES), r.pick(SEQ_WORDS)));
  return [...new Set(units)];
}
{
  const seqs = [];
  for (let seed = 1; seed <= 40; seed++) {
    const r = rng(seed * 1009);
    const units = universe(r, r.int(1, 20));
    const language = r.pick(['ar', 'de', 'é😀', 'x"y\\z\n']);
    const start = r.int(1, 50);
    let p = E.createProfile(language, start);
    const steps = [];
    for (let i = 0; i < 40; i++) {
      const batch = Array.from({ length: r.int(0, 3) }, () => randomEvidence(r, r.int(0, 1) ? 40 : 400, units));
      p = E.record(p, batch);
      let advance = null;
      if (r.next() < 0.1) {
        advance = r.int(0, 500);
        p = E.advanceTo(p, advance);
      }
      steps.push({ batch, advance, serialized: E.serialize(p) });
    }
    seqs.push({ language, start, steps });
  }
  const digests = [];
  for (let seed = 1; seed <= 150; seed++) {
    const r = rng(seed * 7919);
    const units = universe(r, r.int(5, 60));
    const language = 'ar';
    const start = r.int(1, 10);
    let p = E.createProfile(language, start);
    const steps = [];
    for (let i = 0; i < 150; i++) {
      const batch = Array.from({ length: r.int(1, 4) }, () => randomEvidence(r, 400, units));
      p = E.record(p, batch);
      steps.push([batch, sha(E.serialize(p))]);
    }
    digests.push({ language, start, steps });
  }
  write('sequences', { seqs, digests }, 40 * 40 + 150 * 150);
}

// ── deserialize ─────────────────────────────────────────────────────────────────────────────────
{
  const v5 = (units, extra = {}) => JSON.stringify({ v: 5, language: 'ar', day: 3, units, ...extra });
  const K = 'recognise:ar:x';
  const row = (over = {}) => {
    const r = [K, 1, 2, 3, 4, null, 2, 0, 0];
    for (const [i, v] of Object.entries(over)) r[i] = v;
    return r;
  };
  const texts = [
    '', ' ', 'null', 'true', 'false', '5', '-0', '"x"', '[]', '{}', '[1,2', '{', '}', '{"v":5', 'not json', "{'v':5}", '{"v":5,}', '[1,]', 'NaN', 'Infinity', '-Infinity', '+1', '.5', '1.', '01', '0x10', '1e400', '-1e400', 'nul', 'tru', '﻿{}', ' {}', '\t\r\n {} \t\r\n', '{} ', '{}x', '"\\x41"', '"\\u12"', '"\t"', '"\x7f"', '" "',
    '{"v":NaN}', '{"v":Infinity}', '{"v":-Infinity}', '{"v":1e400}', '{"v":null}', '{"v":"5"}', '{"v":true}', '{"v":[5]}', '{"v":{}}', '{"v":-1}', '{"v":1.5}', '{"v":0}', '{"v":-0}', '{"v":0.0}', '{"language":"ar"}',
    '{"v":6}', '{"v":6.0}', '{"v":1e2}', '{"v":1e21}', '{"v":1.7976931348623157e308}', `{"v":1${'0'.repeat(400)}}`, `{"v":1${'0'.repeat(5000)}}`, '{"v":9007199254740993}', '{"v":5.0,"language":"ar","day":3.0,"units":[]}', '{"v":5e0,"language":"ar","day":3e0,"units":[]}', '{"v":50e-1,"language":"ar","day":1,"units":[]}',
    '{"v":5,"v":6}', '{"v":6,"v":5,"language":"ar","day":1,"units":[]}', '{"__proto__":{"v":5},"language":"ar","day":1,"units":[]}',
    '{"v":5}', '{"v":5,"language":"","day":1,"units":[]}', '{"v":5,"language":5,"day":1,"units":[]}', '{"v":5,"language":"ar"}', '{"v":5,"language":"ar","day":-1,"units":[]}', '{"v":5,"language":"ar","day":1.5,"units":[]}', '{"v":5,"language":"ar","day":"1","units":[]}', '{"v":5,"language":"ar","day":true,"units":[]}', '{"v":5,"language":"ar","day":null,"units":[]}', '{"v":5,"language":"ar","day":0,"units":[]}', '{"v":5,"language":"ar","day":-0,"units":[]}', '{"v":5,"language":"ar","day":1e21,"units":[]}', '{"v":5,"language":"ar","day":1,"units":{}}', '{"v":5,"language":"ar","day":1,"units":null}', '{"v":5,"language":"ar","day":1}',
    '{"v":5,"language":"\\ud83d","day":1,"units":[]}', '{"v":5,"language":"\\ud83d\\ude00","day":1,"units":[]}', '{"v":5,"language":"a\\u0000b","day":1,"units":[]}', '{"v":5,"language":"é\\n\\"\\\\\\/","day":1,"units":[]}',
    v5([1]), v5([null]), v5(['x']), v5([{}]), v5([[]]), v5([[1]]), v5([[null]]), v5([['']]), v5([['garbage']]), v5([['recognise:ar']]), v5([['recognise:ar:']]), v5([['recognise::x']]), v5([['nope:ar:x']]), v5([['constructor']]), v5([['__proto__']]), v5([[K]]),
    v5([row()]), v5([row().slice(0, 8)]), v5([[...row(), 0]]), v5([row(), row()]), v5([row({ 0: 'skill:ar:rule' })]), v5([row({ 0: 'produce:ar:a:b:c' }), row({ 0: 'hear:de:😀' })]),
    ...[1, 2, 3, 4, 8].flatMap((i) => [-1, 1.5, '1', null, true, [], {}, 1e21, 1.0, -0, '', 2 ** 53 + 2].map((v) => v5([row({ [i]: v })]))),
    ...[-1, 1.5, '1', true, [], {}, 0, 5, 1e21, -0].map((v) => v5([row({ 5: v })])),
    ...[-1, 1.5, '1', null, true, 0, 6, 7, 100, 1e21, -0, 2.0].map((v) => v5([row({ 6: v })])),
    ...[-1, 1.5, null, 0, 6, 1e21].map((v) => v5([row({ 7: v })])),
    '{"v":5,"language":"ar","day":3,"units":[["recognise:ar:x",-0,0,0,0,-0,-0,-0,-0]]}', '{"v":5,"language":"ar","day":3,"units":[["recognise:ar:x",1e0,2.0,3E0,4e+0,null,20e-1,0.0,0e5]]}', `{"v":5,"language":"ar","day":3,"units":[["recognise:ar:x",1${'0'.repeat(400)},0,0,0,null,0,0,0]]}`, '{"v":5,"language":"ar","day":3,"units":[["recognise:ar:x",9007199254740992,9007199254740993,1e16,1e21,null,0,123456789012345680000,0]]}', '{"v":5,"language":"ar","day":3,"units":[["\\ud83d\\ude00:ar:x",1,1,1,1,null,0,0,0]]}', '{"v":5,"language":"ar","day":3,"units":[["hear:ar:\\ud83d",1,1,1,1,null,0,0,0]]}',
  ];
  const old = [
    ['v1', { v: 1, language: 'ar', day: 3, units: [['recognise:ar:a', { box: 'learning', seen: 2, lastSeen: 2, streak: 1 }], ['produce:ar:b', { box: 'understood', seen: 4, lastSeen: 3, confirmedOn: 2 }]] }],
    ['v2', { v: 2, language: 'ar', day: 3, units: [['recognise:ar:a', { box: 'learning', seen: 2, lastSeen: 2, streak: 0, lastProven: 1 }], ['produce:ar:b', { box: 'understood', seen: 4, lastSeen: 3, confirmedOn: 2 }]] }],
    ['v3', { v: 3, language: 'ar', day: 3, units: [['recognise:ar:a', { seen: 2, lastSeen: 2, lastAsked: 1, lastProven: 1, prior: null, strength: 3, lapses: 0 }], ['produce:ar:b', { seen: 4, lastSeen: 3, lastAsked: 2, lastProven: 0, prior: 2, strength: 0, lapses: 2 }]] }],
    ['v4', { v: 4, language: 'ar', day: 3, units: [['recognise:ar:a', 2, 2, 1, 1, null, 3, 0], ['produce:ar:b', 4, 3, 2, 0, 2, 0, 2]] }],
  ];
  for (const [, doc] of old) texts.push(JSON.stringify(doc));
  const mutate = (doc, f) => {
    const c = JSON.parse(JSON.stringify(doc));
    f(c);
    return JSON.stringify(c);
  };
  for (const [name, doc] of old) {
    const noUnits = mutate(doc, (c) => delete c.units);
    texts.push(noUnits, mutate(doc, (c) => { c.units = 5; }), mutate(doc, (c) => { c.units = [5]; }), mutate(doc, (c) => { c.units = [[]]; }), mutate(doc, (c) => { c.units = [['recognise:ar:x']]; }), mutate(doc, (c) => { c.units = [['recognise:ar:x', 5]]; }), mutate(doc, (c) => { c.units = [['recognise:ar:x', null]]; }), mutate(doc, (c) => { c.units = [[1, {}]]; }), mutate(doc, (c) => { c.units.push(c.units[0]); }));
    if (name !== 'v4') {
      for (const f of ['seen', 'lastSeen', 'streak', 'lastProven', 'confirmedOn', 'box', 'prior', 'strength', 'lapses', 'lastAsked']) {
        texts.push(mutate(doc, (c) => { delete c.units[0][1][f]; delete c.units[1][1][f]; }));
        for (const v of [null, -1, 1.5, '1', true, 9, 1e21]) texts.push(mutate(doc, (c) => { c.units[0][1][f] = v; c.units[1][1][f] = v; }));
      }
      texts.push(mutate(doc, (c) => { c.units[0][1].box = 'other'; }));
    } else {
      for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) for (const v of [null, -1, 1.5, '1', true, 1e21]) texts.push(mutate(doc, (c) => { c.units[0][i] = v; }));
      texts.push(mutate(doc, (c) => { c.units[0].pop(); }), mutate(doc, (c) => { c.units[0].push(1); }));
    }
  }
  const deep = '['.repeat(100000) + ']'.repeat(100000);
  const deepObject = '{"a":'.repeat(50000) + '1' + '}'.repeat(50000);
  const unbalanced = '['.repeat(100000);
  texts.push(deep, deepObject, unbalanced, `{"v":5,"language":"ar","day":3,"units":[${'['.repeat(5000)}1${']'.repeat(5000)}]}`, `[${'['.repeat(20000)}1,${']'.repeat(20000)}]`);

  const decode = (t) => {
    const r = E.deserialize(t);
    if (!r.ok) return { error: r.error };
    return { language: r.value.language, day: r.value.day, units: Object.keys(r.value.units), serialized: E.serialize(r.value) };
  };
  write('deserialize', { cases: texts.map((t) => ({ t, r: decode(t) })) }, texts.length);
}

// ── ids, constants ──────────────────────────────────────────────────────────────────────────────
{
  const days = [1, 2, 100, 0, -0, -1, 1.5, 1.0, 1e21, 1e-7, NaN, Infinity, -Infinity, 2 ** 53, 2 ** 53 + 2, '1', null, true, false, [], [1]];
  const strs = ['', 'a', 'de', 'ar-msa', ':', 'a:b', 'é', '😀', ' ', 'recognise', 'produce', 'pronounce', 'write', 'hear', 'skill', 'skills', 'Recognise', 'recognise:ar:x', 'recognise:ar:', 'recognise::x', ':ar:x', 'nope:ar:x', 'recognise:ar', 'recognise:ar:x:y:z', 'skill:ar:rule', 'skill:ar:', 'skill::rule', 'skill:ar', 'skill:', 'skill', 'skill:ar:a:b', 'hear:😀:😀', 'constructor', '__proto__', 'recognise:ar:\ud83d'];
  const units = strs.map((s) => ({ s, parse: E.parseUnitKey(s) ?? null, isUnit: E.isUnitKey(s), parseSkill: E.parseSkillKey(s) ?? null, isSkill: E.isSkill(s), isModality: E.isModality(s), variety: E.variety(s) ?? null }));
  const mint = [];
  for (const m of E.MODALITIES) for (const v of ['ar', 'é', '']) for (const w of ['x', '', 'a:b', '😀']) mint.push({ m, v, w, key: E.unitKey(m, v, w) });
  const skills = [];
  for (const v of ['ar', '']) for (const w of ['rule', '', 'a:b']) skills.push({ v, w, key: E.skillKey(v, w) });
  const constants = {
    ENGINE_API_VERSION: E.ENGINE_API_VERSION, PROFILE_SCHEMA_VERSION: E.PROFILE_SCHEMA_VERSION, MAX_STRENGTH: E.MAX_STRENGTH, KNOWN_AT_STRENGTH: E.KNOWN_AT_STRENGTH, STRENGTH_STEP: E.STRENGTH_STEP, COVERAGE_BAND: E.COVERAGE_BAND, DIRECTIONS: E.DIRECTIONS, MODALITIES: E.MODALITIES, SKILL: E.SKILL, DEFAULT_REVIEW_GAP_DAYS: E.DEFAULT_REVIEW_GAP_DAYS, OVER_ASK: E.OVER_ASK, REASSESS_AFTER_DAYS: E.REASSESS_AFTER_DAYS, STUCK_AFTER_LAPSES: E.STUCK_AFTER_LAPSES,
  };
  const days2 = days.map((d) => ({ d: enc(d), r: enc(attempt(() => E.day(d)).value) }));
  const dts = readFileSync(pkg('engine/dist/index.d.mts'), 'utf8');
  const exportList = [...dts.matchAll(/export \{([^}]*)\}/g)].flatMap((m) => m[1].split(',')).map((s) => s.trim().replace(/^type /, '')).filter(Boolean).map((s) => s.split(' as ').pop());
  const values = Object.keys(E).sort();
  const types = exportList.filter((n) => !values.includes(n)).sort();
  write('ids', { exports: { values, types }, constants, days: days2, units, mint, skills }, days.length + units.length + mint.length + skills.length);
}

// ── plan, coverage, summarize, bulk, advanceTo, learner ─────────────────────────────────────────
{
  const r = rng(4242);
  const profiles = [];
  for (let i = 0; i < 80; i++) {
    const units = i % 2 === 0 ? universe(r, r.int(1, 120)) : Array.from({ length: r.int(1, 80) }, (_, n) => E.unitKey('recognise', 'ar', `w${n}`));
    let p = E.createProfile('ar', r.int(1, 30));
    const n = r.int(0, 600);
    const maxDay = r.pick([10, 60, 400]);
    p = E.record(p, Array.from({ length: n }, () => randomEvidence(r, maxDay, units)));
    p = E.advanceTo(p, r.int(1, maxDay + 40));
    profiles.push(p);
  }
  const profileIndex = new Map(profiles.map((p, i) => [p, i]));
  const plans = [];
  const bads = [undefined, 0, 1, 3, 2.7, -1, -0.5, NaN, Infinity, -Infinity, '5', null, true, 1e21, 1e308];
  for (const p of profiles) {
    const keys = Object.keys(p.units).sort();
    for (let j = 0; j < 12; j++) {
      const o = { day: r.int(1, p.day + 60), maxItems: r.pick([0, 1, 3, 8, 12, 20, 50, 5000]) };
      if (r.next() < 0.5) o.maxNew = r.pick([0, 1, 2, 5, 100]);
      if (r.next() < 0.4) o.reviewGapDays = r.pick([0, 1, 3, 7, 30]);
      if (r.next() < 0.4) o.exposureCreditDays = r.pick([0, 1, 2, 10]);
      if (r.next() < 0.4) o.claimedGapMultiplier = r.pick([0, 1, 2, 10, 100]);
      if (r.next() < 0.4) o.helpPriorityDays = r.pick([0, 1, 4, 20]);
      if (r.next() < 0.5) o.priority = [...keys].reverse().filter(() => r.next() < 0.5).concat(keys.slice(0, 2), ['recognise:ar:absent']);
      plans.push({ profile: profileIndex.get(p), options: o, session: E.plan(p, o) });
    }
  }
  const small = profiles[1];
  for (const field of ['maxItems', 'maxNew', 'reviewGapDays', 'exposureCreditDays', 'claimedGapMultiplier', 'helpPriorityDays']) {
    for (const b of bads) {
      const o = { day: 30, maxItems: 6, [field]: b };
      plans.push({ profile: profileIndex.get(small), options: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])), session: E.plan(small, o) });
    }
  }
  const pdays = [1, 2, 31, 500, 0];
  for (const d of pdays) plans.push({ profile: profileIndex.get(small), options: { day: d, maxItems: 5 }, session: E.plan(small, { day: d, maxItems: 5 }) });

  const summaries = [];
  for (const p of profiles) {
    const scopes = [{ kind: 'all' }];
    for (const m of E.MODALITIES) for (const v of ['ar', 'de', 'nope']) scopes.push({ kind: 'skill', modality: m, variety: v });
    for (const s of scopes) summaries.push({ profile: profileIndex.get(p), scope: s, summary: E.summarize(p, s) });
  }
  // A malformed key `record` happily writes, which `summarize` must drop.
  const odd = E.record(E.createProfile('ar', 1), [{ kind: 'exposure', unit: E.unitKey('recognise', 'ar', ''), day: 1 }, { kind: 'exposure', unit: E.unitKey('recognise', 'ar', 'x'), day: 1 }]);
  const oddSummary = E.summarize(odd, { kind: 'all' });

  const coverages = [];
  const packsByName = { ar: AR.msa, quran: QU.arQuran, fr: FR, arf: ARF, de: DE };
  const buildText = (rr, words, n) => Array.from({ length: n }, () => rr.pick(words)).join(rr.pick([' ', ' ', ', ', '\n']));
  for (const [name, pack] of Object.entries(packsByName)) {
    const words = name === 'ar' ? everyNth(AR.frequency.split('\n'), 3).slice(0, 700) : name === 'quran' ? everyNth(QU.frequency.split('\n'), 3).slice(0, 700) : name === 'fr' ? FR_DATA.frequency.split(' ') : name === 'arf' ? ARF_DATA.frequency.split(' ') : DE_DATA.frequency.split(' ');
    for (let i = 0; i < 60; i++) {
      const v = pack.id;
      const dir = r.pick(['recognise', 'produce']);
      const known = words.filter(() => r.next() < r.pick([0.1, 0.5, 0.97]));
      const claims = words.filter(() => r.next() < r.pick([0, 0.2, 0.9]));
      let p = E.createProfile('x', 1);
      p = E.record(p, claims.map((w) => ({ kind: 'claim', unit: E.unitKey(dir, v, pack.key(w)), day: 1 })));
      for (let round = 0; round < 2; round++) p = E.record(p, known.map((w) => ({ kind: 'retrieval', unit: E.unitKey(dir, v, pack.key(w)), outcome: 'known', day: 2 + round })));
      const n = r.pick([0, 3, 19, 20, 21, 50, 200, 500]);
      const text = buildText(r, words, n);
      const ignore = r.next() < 0.3 ? words.filter(() => r.next() < 0.1) : undefined;
      const q = { text, variety: v, direction: dir, ...(ignore === undefined ? {} : { ignore }) };
      coverages.push({ pack: name, profile: E.serialize(p), query: q, result: E.coverage(p, pack, q) });
    }
    const distinct = [...new Map(words.map((w) => [pack.key(w), w])).values()].filter((w) => pack.key(w).length > 0);
    const [w0, w1, w2] = distinct;
    for (const [k, c, u] of [[90, 8, 2], [95, 4, 1], [97, 2, 1], [80, 19, 1], [99, 1, 0], [950, 40, 10]]) {
      const text = [...Array(k).fill(w0), ...Array(c).fill(w1), ...Array(u).fill(w2)].join(' ');
      let p = E.createProfile('x', 1);
      p = E.record(p, [{ kind: 'claim', unit: E.unitKey('recognise', pack.id, pack.key(w1)), day: 1 }]);
      for (let round = 0; round < 2; round++) p = E.record(p, [{ kind: 'retrieval', unit: E.unitKey('recognise', pack.id, pack.key(w0)), outcome: 'known', day: 2 + round }]);
      const q = { text, variety: pack.id, direction: 'recognise' };
      coverages.push({ pack: name, profile: E.serialize(p), query: q, result: E.coverage(p, pack, q) });
    }
    for (const text of [...ADVERSARIAL, 'ـــ ـــ', 'ـ'.repeat(30)]) coverages.push({ pack: name, profile: E.serialize(E.createProfile('x', 1)), query: { text, variety: pack.id, direction: 'recognise' }, result: E.coverage(E.createProfile('x', 1), pack, { text, variety: pack.id, direction: 'recognise' }) });
  }

  const bulks = [];
  for (const [name, pack] of Object.entries(packsByName)) {
    for (const text of [...ADVERSARIAL, AR.sample, QU.sample]) bulks.push({ pack: name, kind: 'wordsIn', input: text, r: E.wordsIn(pack, text) });
    for (const f of [...ADVERSARIAL, AR.frequency.slice(0, 2000), 'a a  b\nb\tc d']) bulks.push({ pack: name, kind: 'vocabularyOf', input: f, r: E.vocabularyOf(pack, f) });
  }
  const wordLists = [[], ['x'], ['', 'a', '', 'a'], ['😀', 'é', ':'], ADVERSARIAL.slice(0, 40)];
  const lists = [];
  for (const m of E.MODALITIES) for (const words of wordLists) lists.push({ m, words, keys: E.keysFor(m, 'ar', words), claims: E.claimsFor(m, 'ar', words, 3), exposures: E.exposuresFor(m, 'ar', words, 3) });

  const profileOps = [];
  for (const p of profiles.slice(0, 15)) {
    const keys = Object.keys(p.units).slice(0, 8);
    for (const key of [...keys, 'recognise:ar:absent', 'constructor', '__proto__', 'toString']) {
      const st = Object.prototype.hasOwnProperty.call(p.units, key) ? p.units[key] : key.includes(':') ? E.unitState(p, key) : null;
      profileOps.push({ profile: profileIndex.get(p), key, hasMet: E.hasMet(p, key), state: st });
    }
    for (const d of [0, 1, p.day - 1, p.day, p.day + 1, p.day + 100]) profileOps.push({ profile: profileIndex.get(p), advance: d, day: E.advanceTo(p, d).day, same: E.advanceTo(p, d) === p });
  }

  const scripts = [];
  for (const [name, pack, vocab, extra] of [['ar', AR.msa, AR.vocabulary, {}], ['quran', QU.arQuran, QU.vocabulary, { variety: 'ar-x-quran', direction: 'produce' }], ['ar', AR.msa, undefined, { direction: 'produce' }], ['de', DE, ['haus', 'Straße', 'geben'], { variety: 'other' }]]) {
    for (let s = 0; s < 8; s++) {
      const rr = rng(s * 311 + 5);
      const sourceWords = (vocab ?? DE_DATA.frequency.split(' ')).slice(0, 400);
      let l = E.learner(E.createProfile('x', 1), { pack, ...(vocab === undefined ? {} : { vocabulary: vocab.slice(0, 300) }), ...extra });
      const ops = [];
      for (let i = 0; i < 25; i++) {
        const d = rr.int(1, 90);
        const k = rr.int(0, 9);
        let op;
        let result = null;
        if (k === 0) {
          const words = sourceWords.filter(() => rr.next() < 0.05);
          op = ['claim', words, d];
          l = l.claim(words, d);
        } else if (k === 1 || k === 2) {
          const w = rr.pick(sourceWords);
          const o = rr.pick(['known', 'unknown']);
          op = ['answer', w, o, d];
          l = l.answer(w, o, d);
        } else if (k === 3) {
          const t = buildText(rr, sourceWords, rr.int(0, 30));
          op = ['read', t, d];
          l = l.read(t, d);
        } else if (k === 4) {
          const w = rr.pick(sourceWords);
          op = ['help', w, d];
          l = l.help(w, d);
        } else if (k === 5) {
          op = ['on', d];
          l = l.on(d);
        } else if (k === 6) {
          const o = { day: d, maxItems: rr.int(0, 12) };
          if (rr.next() < 0.5) o.maxNew = rr.int(0, 5);
          op = ['plan', o];
          result = l.plan(o);
        } else if (k === 7) {
          const t = buildText(rr, sourceWords, rr.pick([5, 25, 60]));
          const ignore = rr.next() < 0.3 ? sourceWords.slice(0, 5) : undefined;
          op = ['coverage', t, ignore ?? null];
          result = l.coverage(t, ignore === undefined ? undefined : { ignore });
        } else if (k === 8) {
          const scope = rr.pick([null, { kind: 'all' }, { kind: 'skill', variety: pack.id, modality: 'hear' }]);
          op = ['summary', scope];
          result = l.summary(scope ?? undefined);
        } else {
          const evidence = [{ kind: 'exposure', unit: E.unitKey('hear', pack.id, 'x'), day: d }];
          op = ['record', evidence];
          l = l.record(evidence);
        }
        ops.push({ op, result, save: l.save(), variety: l.variety, direction: l.direction });
      }
      scripts.push({ pack: name, vocabularyCount: vocab === undefined ? null : 300, ...extra, ops });
    }
  }
  write('session', { profiles: profiles.map((p) => E.serialize(p)), packs: { fr: [FR_CONFIG, FR_DATA], arf: [ARF_CONFIG, ARF_DATA], de: [DE_CONFIG, DE_DATA] }, plans, summaries, oddSummary, coverages, bulks, lists, profileOps, scripts }, plans.length + summaries.length + coverages.length + bulks.length + lists.length + profileOps.length + scripts.length * 25);
}

console.log(`total vectors: ${total}`);
