#!/usr/bin/env python3
"""Stream a kaikki.org Wiktextract dump and emit a compact per-word record.

PoC only (lughaty, 2026-09-11). Keeps four things and drops the rest, because the full English
dump is 3.0 GB and only these answer the questions being asked:

  w    the word
  p    part of speech
  s    senses: [{g: gloss, rt: [regional tags ON THAT SENSE]}]
  wrt  regional tags on the WHOLE entry     -> a different and much rarer claim
  tr   translations [lang_code, word]       -> the cross-language bridge, for free

Usage:  curl -sL <dump.jsonl> | python3 poc_wiktextract.py <out.jsonl> [max_translations]
"""
import json, sys

REGIONAL = {
    'British','UK','US','American','Australian','Canadian','Irish','Scottish','New-Zealand',
    'South-African','Indian','Austrian','Swiss','German','Bavarian','Egyptian','Levantine',
    'Moroccan','Gulf','Hijazi','Iraqi','Tunisian','Algerian','dialectal','regional',
}

out = open(sys.argv[1], 'w', encoding='utf-8')
max_tr = int(sys.argv[2]) if len(sys.argv) > 2 else 40

kept = seen = 0
for line in sys.stdin:
    seen += 1
    try:
        e = json.loads(line)
    except Exception:
        continue
    word = e.get('word')
    if not word:
        continue

    # ⚠️ TAGS ARE PER SENSE, NOT PER WORD, AND COLLAPSING THEM IS WRONG.
    # A first pass unioned every sense's tags onto the lemma. That made `cat` "en-US" — because ONE
    # slang sense is American — and would have told a learner that an ordinary word is regional.
    # A concept link is per sense (ADR-0047), so the tag stays where the gloss is.
    senses = []
    for sn in e.get('senses') or []:
        g = sn.get('glosses') or sn.get('raw_glosses')
        if not g:
            continue
        rt = sorted({t for t in (sn.get('tags') or []) if t in REGIONAL})
        senses.append({'g': g[0], 'rt': rt} if rt else {'g': g[0]})

    # word-level tags are real but mean "the whole entry is regional", a different claim
    word_rt = sorted({t for t in (e.get('tags') or []) if t in REGIONAL})

    tr = []
    for t in (e.get('translations') or [])[:max_tr]:
        code, w = t.get('code') or t.get('lang_code'), t.get('word')
        if code and w:
            tr.append([code, w, t.get('sense') or ''])

    if not senses and not tr:
        continue
    rec = {'w': word, 'p': e.get('pos') or ''}
    if senses:  rec['s'] = senses[:12]
    if word_rt: rec['wrt'] = word_rt
    if tr:      rec['tr'] = tr
    out.write(json.dumps(rec, ensure_ascii=False) + '\n')
    kept += 1
    if seen % 250000 == 0:
        print(f'  {seen:,} read  {kept:,} kept', file=sys.stderr, flush=True)

out.close()
print(f'done: {seen:,} read, {kept:,} kept -> {sys.argv[1]}', file=sys.stderr)
