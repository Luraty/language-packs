#!/usr/bin/env python3
"""How much of the learner's vocabulary does each Arabic dictionary actually cover?

⚠️ EVERY RATE IS REPORTED TWICE — as the dictionary spells the word, and after the pack's own
normalize chain. They differ by roughly 10x, and quoting only the first makes a good source look
empty. packs/ar/pack.config.json declares `stripArabicDiacritics` + `stripTatweel`; this mirrors it.
"""
import json, re, sys

MARKS = re.compile('[ً-ْٰـۖ-ۭ]')
norm = lambda w: MARKS.sub('', w)

def load_dict(path):
    by_raw, by_norm = {}, {}
    n_senses = 0
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            try: r = json.loads(line)
            except Exception: continue
            w = r['w']
            by_raw.setdefault(w, []).append(r)
            by_norm.setdefault(norm(w), []).append(r)
            n_senses += len(r.get('s', []))
    return by_raw, by_norm, n_senses

vocab = [w for w in open(sys.argv[1], encoding='utf-8').read().split() if w]
lex = set()
for line in open(sys.argv[2], encoding='utf-8'):
    f = line.rstrip('\n').split('\t')
    if f and f[0]:
        lex.add(f[0]); lex.update(x for x in f[1:] if x)

print('=' * 76)
print('  ARABIC DICTIONARY COVERAGE — against the pack a learner actually gets')
print('=' * 76)
print(f'  pack vocabulary (taught, in order): {len(vocab):,}')
print(f'  pack lexicon (every form + lemma):  {len(lex):,}')

rows = []
for arg in sys.argv[3:]:
    label, path = arg.split('=', 1)
    by_raw, by_norm, n_senses = load_dict(path)
    entries = sum(len(v) for v in by_raw.values())
    raw_hits = sum(1 for w in vocab if w in by_raw)
    nrm_hits = sum(1 for w in vocab if w in by_norm or norm(w) in by_norm)
    sense_n = [len(r.get('s', [])) for v in by_norm.values() for r in v if r.get('s')]
    sense_n.sort()
    med = sense_n[len(sense_n) // 2] if sense_n else 0
    mx = sense_n[-1] if sense_n else 0
    rows.append((label, len(by_raw), entries, n_senses, raw_hits, nrm_hits, med, mx))

print()
print(f'{"dictionary":<16}{"headwords":>11}{"senses":>9}   {"top-10k covered":>22}   {"senses/word":>16}')
print('-' * 82)
for label, heads, entries, n_senses, raw, nrm, med, mx in rows:
    print(f'{label:<16}{heads:>11,}{n_senses:>9,}   raw {raw/len(vocab):>6.1%}  normalized {nrm/len(vocab):>6.1%}   median {med}  max {mx}')

# where does coverage sit in the frequency list?
print()
print('  coverage by frequency band (normalized):')
print(f'  {"band":<14}' + ''.join(f'{lbl:>18}' for lbl, _ in [(r[0], 0) for r in rows]))
dicts = []
for arg in sys.argv[3:]:
    label, path = arg.split('=', 1)
    _, by_norm, _ = load_dict(path)
    dicts.append((label, by_norm))
for lo, hi in ((0, 500), (500, 1000), (1000, 2500), (2500, 5000), (5000, 10000)):
    band = vocab[lo:hi]
    cells = ''
    for _, by_norm in dicts:
        hit = sum(1 for w in band if w in by_norm or norm(w) in by_norm)
        cells += f'{hit/len(band):>18.1%}'
    print(f'  {lo:>5,}-{hi:<8,}' + cells)
