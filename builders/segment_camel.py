#!/usr/bin/env python3
"""Segment Arabic words into proclitics + stem + enclitics with CAMeL Tools' d3tok.

⚠️ **AUTHORING-TIME ONLY, AND THAT IS WHAT KEEPS THE LICENCE OUT OF THE APP.** `calima-msa-r13` is
GPL-2.0. It runs here, offline, over a word list, and emits a plain TSV. No GPL code and no GPL
database reaches the bundle a learner downloads — only the table this produces.

⚠️ **`morphology-db-msa-s31` REQUIRES A PURCHASED LDC LICENCE AND `camel_data -i light` PULLS IT.**
Install `morphology-db-msa-r13` + `disambig-mle-calima-msa-r13` by name instead.

Why this replaces hand-written clitic rules: measured on the nine words the hand rules got wrong or
refused, d3tok gets all nine right — including بها → ب + ها, which a length guard has to refuse, and
نادي → نادي, which a naive rule corrupts to ناد.

Output: `word <TAB> stem <TAB> proclitics <TAB> enclitics`, one line per input word.
"""
import sys
from camel_tools.disambig.mle import MLEDisambiguator
from camel_tools.tokenizers.morphological import MorphologicalTokenizer

# ⚠️ ONE ENTRY PER LINE, NEVER `.split()`. A lexicon contains multi-word forms — آلة موسيقية is one
# headword — and splitting on whitespace shatters them into pieces that exist in no lexicon at all.
# The first run of this file produced 101 such fragments and the conformance check caught them.
words = [w.strip() for w in open(sys.argv[1], encoding='utf-8') if w.strip()]
out = open(sys.argv[2], 'w', encoding='utf-8')

tok = MorphologicalTokenizer(MLEDisambiguator.pretrained('calima-msa-r13'),
                             scheme='d3tok', split=True)

BATCH = 2000
done = split_count = 0
for i in range(0, len(words), BATCH):
    chunk = words[i:i + BATCH]
    for w in chunk:
        parts = tok.tokenize([w])
        pro = [p.rstrip('+') for p in parts if p.endswith('+') and not p.startswith('+')]
        enc = [p.lstrip('+') for p in parts if p.startswith('+')]
        stem = next((p for p in parts if not p.endswith('+') and not p.startswith('+')), w)
        out.write(f"{w}\t{stem}\t{'|'.join(pro)}\t{'|'.join(enc)}\n")
        if pro or enc:
            split_count += 1
    done += len(chunk)
    print(f'  {done:,}/{len(words):,} segmented', file=sys.stderr, flush=True)
out.close()
print(f'done: {len(words):,} words, {split_count:,} carried a clitic -> {sys.argv[2]}', file=sys.stderr)
