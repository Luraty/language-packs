#!/usr/bin/env python3
"""Extract Arabic lemma -> senses from a kaikki.org Wiktextract dump.

Measurement pass for lughaty's dictionary plan (2026-09-12). Emits one compact record per entry:

  w    the headword AS THE DICTIONARY SPELLS IT (vocalised — see the normalize note below)
  p    part of speech
  s    [{g: gloss, rt: [regional tags ON THAT SENSE]}]   ⚠️ per SENSE, never unioned onto the word
  tr   [[lang_code, word, sense]]  translations, for the bridge

⚠️ NOTHING IS NORMALIZED HERE. The dictionary's spelling is kept verbatim so the measurement can
report the raw match rate AND the normalized one separately — the whole point is that those two
numbers differ by 10x, and collapsing them here would hide it.

Usage:  curl -sL <dump.jsonl> | python3 dict_kaikki_ar.py <out.jsonl>
"""
import json, sys

REGIONAL = {
    'Egyptian','Levantine','Moroccan','Gulf','Hijazi','Iraqi','Tunisian','Algerian','Sudanese',
    'Yemeni','Syrian','Lebanese','Palestinian','Libyan','dialectal','regional','Classical',
    'Quranic','Modern-Standard-Arabic','MSA',
}

out = open(sys.argv[1], 'w', encoding='utf-8')
kept = seen = 0
for line in sys.stdin:
    seen += 1
    try:
        e = json.loads(line)
    except Exception:
        continue
    w = e.get('word')
    if not w:
        continue
    senses = []
    for sn in e.get('senses') or []:
        g = sn.get('glosses') or sn.get('raw_glosses')
        if not g:
            continue
        rt = sorted({t for t in (sn.get('tags') or []) if t in REGIONAL})
        senses.append({'g': g[0], 'rt': rt} if rt else {'g': g[0]})
    tr = []
    for t in (e.get('translations') or [])[:40]:
        code, tw = t.get('code') or t.get('lang_code'), t.get('word')
        if code and tw:
            tr.append([code, tw, t.get('sense') or ''])
    if not senses and not tr:
        continue
    rec = {'w': w, 'p': e.get('pos') or ''}
    if senses: rec['s'] = senses[:12]
    if tr:     rec['tr'] = tr
    out.write(json.dumps(rec, ensure_ascii=False) + '\n')
    kept += 1
    if seen % 200000 == 0:
        print(f'  {seen:,} read  {kept:,} kept', file=sys.stderr, flush=True)
out.close()
print(f'done: {seen:,} read, {kept:,} kept -> {sys.argv[1]}', file=sys.stderr)
