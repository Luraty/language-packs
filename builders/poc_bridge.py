#!/usr/bin/env python3
"""Build a VarietyBridge (ADR-0047) from Wiktionary translations + regional tags. PoC, 2026-09-11.

A CONCEPT here is one English Wiktionary sense that has at least one translation. Its id is minted
locally and stated as such — WN-LMF's `ili="in"` convention — because anchoring to Wikidata or
Concepticon is a separate job and pretending otherwise would hide the provenance.

Emits the exact shape ADR-0047 specifies, so the PoC can be checked against the ADR rather than
against a description of it.

Usage: poc_bridge.py <wikt-en.jsonl> <out.json> [--vocab lemma-list ...] [--limit N]
"""
import json, re, sys, hashlib
from collections import Counter

src, out_path = sys.argv[1], sys.argv[2]
limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else 0

vocab = set()
if '--vocab' in sys.argv:
    for path in sys.argv[sys.argv.index('--vocab') + 1:]:
        if path.startswith('--'): break
        with open(path, encoding='utf-8') as fh:
            text = fh.read()
            for w in (text.split() if ' ' in text[:200] and '\t' not in text[:200] else
                      [l.split('\t')[1] for l in text.splitlines() if len(l.split('\t')) >= 2]):
                vocab.add(w.lower())

# Wiktionary spells a variety differently from BCP-47. ADR-0045: tags are opaque, so this is a
# DECLARED mapping, never inferred from the string.
TAG_TO_VARIETY = {
    'British': 'en-GB', 'UK': 'en-GB', 'US': 'en-US', 'American': 'en-US',
    'Australian': 'en-AU', 'Canadian': 'en-CA', 'Irish': 'en-IE', 'Scottish': 'en-SC',
    'Austrian': 'de-AT', 'Swiss': 'de-CH',
}
KEEP_LANGS = {'de', 'ar', 'fr', 'es', 'nl', 'tr'}

def concept_id(word, pos, gloss):
    h = hashlib.sha1(f'{word}|{pos}|{gloss}'.encode()).hexdigest()[:10]
    return f'x:en/{h}'

links, seen_concepts = [], {}
stats = Counter()

def norm(g):
    """Wiktionary's translation `sense` is a gloss-LIKE string, never the gloss verbatim.
    ⚠️ A first pass required `sense == gloss` and matched almost nothing: 19 concepts out of
    1.35M entries, because exact equality basically never holds for a multi-sense word."""
    g = (g or '').split(',')[0].split(';')[0].split('(')[0]
    g = re.sub(r'^(a|an|the|to) ', '', g.strip().lower())
    return re.sub(r'[^a-z ]', '', g).strip()

with open(src, encoding='utf-8') as fh:
    for line in fh:
        try: e = json.loads(line)
        except Exception: continue
        w = e['w']
        if vocab and w.lower() not in vocab:
            continue
        tr = e.get('tr') or []
        if not tr:
            continue
        senses = e.get('s') or [{'g': ''}]
        gnorm = [norm(sn.get('g', '')) for sn in senses]

        buckets = {i: [] for i in range(len(senses))}
        for t in tr:
            sn_txt = norm(t[2] if len(t) > 2 else '')
            idx = 0                                   # default: the entry's first sense
            if sn_txt:
                for i, g in enumerate(gnorm):
                    if g and (g == sn_txt or g.startswith(sn_txt) or sn_txt.startswith(g)):
                        idx = i; break
            buckets[idx].append(t)

        for i, sn in enumerate(senses):
            mine = buckets[i]
            if not mine:
                continue
            gloss = sn.get('g', '')
            cid = concept_id(w, e.get('p', ''), gloss)
            if cid in seen_concepts:
                continue
            seen_concepts[cid] = gloss
            # ⚠️ the tag is the SENSE's, never the word's — see poc_wiktextract.py
            varieties = sorted({TAG_TO_VARIETY[t] for t in (sn.get('rt') or []) if t in TAG_TO_VARIETY}) or ['en']
            for v in varieties:
                links.append({'concept': cid, 'variety': v, 'lemma': w})
                stats[v] += 1
            for t in mine:
                lc, tw = t[0], t[1]
                if lc in KEEP_LANGS:
                    links.append({'concept': cid, 'variety': lc, 'lemma': tw})
                    stats[lc] += 1
        if limit and len(seen_concepts) >= limit:
            break

# ⚠️ Weights are PLACEHOLDERS. ADR-0047 is PROVISIONAL precisely because nobody has measured these.
transfer = [
    {'from': 'en',    'to': 'en-GB', 'weight': 0.9, 'visible': True},
    {'from': 'en-GB', 'to': 'en',    'weight': 0.9, 'visible': True},
    {'from': 'en',    'to': 'de',    'weight': 0.0, 'visible': True},
    {'from': 'de',    'to': 'en',    'weight': 0.0, 'visible': True},
]

bridge = {
    'schema': 1,
    'id': 'poc',
    'version': '0.1.0',
    'note': 'PROOF OF CONCEPT. Concept ids are locally minted (WN-LMF `ili="in"`), not anchored to '
            'Wikidata or Concepticon. Transfer weights are PLACEHOLDERS — ADR-0047 requires them to '
            'be measured against a withheld control slice before they may schedule anything.',
    'requires': [{'pack': 'en', 'range': '^0.1.0'}, {'pack': 'de', 'range': '^0.1.0'}],
    'links': links,
    'transfer': transfer,
}
with open(out_path, 'w', encoding='utf-8') as fh:
    json.dump(bridge, fh, ensure_ascii=False)

print(f'concepts {len(seen_concepts):,}   links {len(links):,}', file=sys.stderr)
for v, c in stats.most_common():
    print(f'  {v:<8} {c:>8,}', file=sys.stderr)
