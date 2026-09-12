#!/usr/bin/env python3
"""Turn an extracted dictionary into the artifact a pack ships.

⚠️ **EVERY KEY GOES THROUGH THE PACK'S OWN NORMALIZE CHAIN FIRST.** Sources disagree about
vocalisation — ar.wiktionary files entries under مَاء, kaikki files them under ماء, and kaikki's
TRANSLATION targets are vocalised while its headwords are not. Matching raw costs between 2x and
10x, measured twice. The chain is stripArabicDiacritics + stripTatweel, from packs/ar's config.

⚠️ **ONLY LEMMAS THE PACK CAN ACTUALLY REACH ARE KEPT.** A dictionary has entries for words no
learner will ever be shown; carrying them makes the artifact large and the coverage number a lie.

⚠️ **PROVENANCE IS WRITTEN ON THE ARTIFACT, NOT INFERRED FROM THE FILENAME**, and `reviewed_by` is
null because no human has read these. Same discipline as the 155,756 gloss rows in supabase: the
null column is the only place "nobody checked this" is recorded.

Usage:
  build_dictionary.py <extract.jsonl> --id <name> --l1 <lang> --lexicon <lemmas.tsv>
                      --vocab <frequency.txt> --out <dictionary.json> [--max-senses 5]
"""
import json, re, sys, datetime

MARKS = re.compile('[ً-ْٰـۖ-ۭ]')
norm = lambda w: MARKS.sub('', w)

a = sys.argv
def opt(name, default=None):
    return a[a.index(name) + 1] if name in a else default

src, out_path = a[1], opt('--out')
dict_id, l1 = opt('--id'), opt('--l1')
licence, provenance = opt('--licence', 'unknown'), opt('--provenance', '')
max_senses = int(opt('--max-senses', '5'))

reachable = set()
for line in open(opt('--lexicon'), encoding='utf-8'):
    f = line.rstrip('\n').split('\t')
    if f and f[0]:
        reachable.add(norm(f[0]))
        reachable.update(norm(x) for x in f[1:] if x)
for w in open(opt('--vocab'), encoding='utf-8').read().split():
    reachable.add(norm(w))

entries, dropped, senses_total = {}, 0, 0
for line in open(src, encoding='utf-8'):
    try: r = json.loads(line)
    except Exception: continue
    key = norm(r['w'])
    # ⚠️ **A KEY THAT NORMALIZES TO NOTHING MATCHES EVERYTHING.** The Qur'anic verse-end mark ۝ is a
    # dictionary headword and strips to the empty string; an artifact containing it makes `'' in
    # dict` true, and any lookup that falls back to '' reports a hit. A coverage measurement built
    # on that read 99.8% instead of 74.5%.
    if not key:
        dropped += 1
        continue
    if key not in reachable:
        dropped += 1
        continue
    senses = [s['g'] for s in (r.get('s') or []) if s.get('g')]
    if not senses:
        continue
    slot = entries.setdefault(key, {'senses': [], 'pos': []})
    for g in senses:
        if g not in slot['senses'] and len(slot['senses']) < max_senses:
            slot['senses'].append(g)
    if r.get('p') and r['p'] not in slot['pos']:
        slot['pos'].append(r['p'])

for v in entries.values():
    senses_total += len(v['senses'])

artifact = {
    'schema': 1,
    'id': dict_id,
    'l1': l1,
    'built': datetime.date.today().isoformat(),
    'licence': licence,
    # ⚠️ Written on the artifact, never inferred from a filename. Two of these sources are
    # machine-generated and one is 14th-century; a reader cannot tell them apart from the id.
    'provenance': provenance,
    'reviewed_by': None,
    'normalize': ['stripArabicDiacritics', 'stripTatweel'],
    'maxSenses': max_senses,
    'entries': entries,
}
with open(out_path, 'w', encoding='utf-8') as fh:
    json.dump(artifact, fh, ensure_ascii=False)

print(f'  {dict_id}: {len(entries):,} entries, {senses_total:,} senses '
      f'({dropped:,} dropped as unreachable) -> {out_path}', file=sys.stderr)
