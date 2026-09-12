#!/usr/bin/env python3
"""Assert the segmentation table is sane and has not silently become the lemma table.

⚠️ **A SEGMENT IS NOT A LEMMA, AND CONFLATING THEM WOULD CHANGE LEARNER PROGRESS.**
  segmentation   آباها  -> آب      what is left once clitics come off
  lemma table    آباء   -> أبى     the dictionary headword
They agree on only 26.6% of forms and that is correct, not a defect. The segmentation exists so a
DICTIONARY can be looked up; the lemma table decides which unit the learner is credited with. A unit
key is `modality:variety:LEMMA` — if segmentation ever fed that, every learner's history would
silently re-address itself.

Checks:
  1. every segmented form exists in the lexicon    — else it describes a word the pack cannot reach
  2. stem + clitics reconstruct something          — a row with an empty stem is unusable
  3. the tables are NOT identical                  — if they ever converge, one of them is wrong
"""
import sys

a = sys.argv
seg_path, lex_path = a[1], a[a.index('--lexicon') + 1]

lexicon = set()
lemmas = {}
for line in open(lex_path, encoding='utf-8'):
    f = line.rstrip('\n').split('\t')
    if f and f[0]:
        lexicon.add(f[0])
        lemmas[f[0]] = [x for x in f[1:] if x]

rows, unknown, empty, agree, both = 0, [], [], 0, 0
for line in open(seg_path, encoding='utf-8'):
    f = line.rstrip('\n').split('\t')
    if len(f) < 2:
        continue
    rows += 1
    w, stem = f[0], f[1]
    if w not in lexicon:
        unknown.append(w)
    if not stem:
        empty.append(w)
    if w in lemmas:
        both += 1
        if stem in lemmas[w]:
            agree += 1

problems = 0
print(f'  segmentation: {rows:,} rows')
if unknown:
    problems += 1
    print(f'    ✗ {len(unknown):,} forms are not in the lexicon: {" ".join(unknown[:6])}')
if empty:
    problems += 1
    print(f'    ✗ {len(empty):,} rows have an empty stem: {" ".join(empty[:6])}')

ratio = agree / both if both else 0
print(f'    stem == a listed lemma on {ratio:.1%} of {both:,} shared forms')
if ratio > 0.95:
    problems += 1
    print('    ✗ the segmentation and the lemma table have converged. They answer different '
          'questions and must not agree — one of them has been overwritten by the other.')

if problems:
    sys.exit(1)
print('  ✓ segmentation is distinct from the lemma table, and every form is reachable')
