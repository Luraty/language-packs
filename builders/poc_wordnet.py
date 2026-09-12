#!/usr/bin/env python3
"""Parse WordNet 3.1's dict/ files into lemma -> senses. PoC only (lughaty, 2026-09-11).

WordNet ships its own flat format, not JSON. `index.<pos>` maps a lemma to N synset offsets;
`data.<pos>` holds one synset per offset: members, pointers, then ` | ` and the gloss.

Emits JSONL: {"w": lemma, "p": pos, "g": [gloss, ...], "syn": [[offset, [members...]], ...]}
so it can be compared line-for-line against the Wiktionary extract.
"""
import json, sys, os

DICT = sys.argv[1]
OUT = sys.argv[2]
POS = {'noun': 'n', 'verb': 'v', 'adj': 'a', 'adv': 'r'}

# offset -> (gloss, [members])
def load_data(pos):
    d = {}
    with open(os.path.join(DICT, f'data.{pos}'), encoding='latin-1') as fh:
        for line in fh:
            if line.startswith('  '):
                continue
            head, _, gloss = line.partition(' | ')
            f = head.split()
            if len(f) < 4:
                continue
            offset = f[0]
            try:
                w_cnt = int(f[3], 16)
            except ValueError:
                continue
            members = [f[4 + 2 * i].replace('_', ' ') for i in range(w_cnt) if 4 + 2 * i < len(f)]
            d[offset] = (gloss.strip(), members)
    return d

records = {}
for pos in POS:
    data = load_data(pos)
    with open(os.path.join(DICT, f'index.{pos}'), encoding='latin-1') as fh:
        for line in fh:
            if line.startswith('  '):
                continue
            f = line.split()
            if len(f) < 3:
                continue
            lemma = f[0].replace('_', ' ')
            offsets = [x for x in f if len(x) == 8 and x.isdigit()]
            syns = [(o, data[o]) for o in offsets if o in data]
            if not syns:
                continue
            key = (lemma, pos)
            records[key] = {
                'w': lemma,
                'p': pos,
                'g': [g for _, (g, _) in syns][:8],
                'syn': [[o, m] for o, (_, m) in syns],
            }

with open(OUT, 'w', encoding='utf-8') as out:
    for rec in records.values():
        out.write(json.dumps(rec, ensure_ascii=False) + '\n')
print(f'wordnet: {len(records):,} (lemma,pos) records -> {OUT}', file=sys.stderr)
