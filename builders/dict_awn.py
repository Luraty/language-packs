#!/usr/bin/env python3
"""Extract Arabic lemma -> Arabic definition from Arabic WordNet 4.0 (WN-LMF 1.4 XML).

⚠️ **THE DEFINITIONS ARE MACHINE-TRANSLATED AND UNREVIEWED, AND THE FILE SAYS SO.** From its own
header: "Translations generated with AI assistance (Google Gemini 3 Pro Preview)", one author,
2026-01-22, CC BY 4.0. That is the same epistemic category as this project's 155,756 gloss tokens
written `reviewed_by` null — usable, and never to be presented as authority.

⚠️ **AND IT IS A TRANSLATION OF AN ENGLISH RESOURCE, SO THE ANGLOCENTRISM LEAKS.** مدينة comes back
defined as a municipality established under a state charter — a US civics definition, not an Arabic
one. Rank it BELOW the classical dictionaries, as a fallback for words they do not carry.

Structure: <LexicalEntry><Lemma writtenForm=…/><Sense synset=…/></LexicalEntry>, and the gloss
lives on <Synset><Definition>.
"""
import gzip, json, re, sys, xml.etree.ElementTree as ET

src, out_path = sys.argv[1], sys.argv[2]

defs, entries = {}, []
with gzip.open(src, 'rt', encoding='utf-8') as fh:
    for event, el in ET.iterparse(fh, events=('end',)):
        if el.tag == 'Synset':
            d = el.find('Definition')
            if d is not None and d.text:
                defs[el.get('id')] = d.text.strip()
            el.clear()
        elif el.tag == 'LexicalEntry':
            lem = el.find('Lemma')
            if lem is not None and lem.get('writtenForm'):
                syns = [s.get('synset') for s in el.findall('Sense')]
                entries.append((lem.get('writtenForm'), lem.get('partOfSpeech') or '', syns))
            el.clear()

POS = {'n': 'noun', 'v': 'verb', 'a': 'adj', 'r': 'adv', 's': 'adj'}
kept = 0
with open(out_path, 'w', encoding='utf-8') as out:
    for word, pos, syns in entries:
        senses = [defs[s] for s in syns if s in defs]
        if not senses:
            continue
        out.write(json.dumps({'w': word, 'p': POS.get(pos, pos),
                              's': [{'g': g} for g in senses[:8]]}, ensure_ascii=False) + '\n')
        kept += 1
print(f'  awn4: {kept:,} entries from {len(defs):,} definitions -> {out_path}', file=sys.stderr)
