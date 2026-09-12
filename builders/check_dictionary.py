#!/usr/bin/env python3
"""Assert a dictionary artifact agrees with the pack it ships beside.

⚠️ **THIS IS THE GUARD #106 DID NOT HAVE.** That incident: the frequency list and the lemma table
were built at different times by different code, nothing compared them against the text they both
describe, and 1,252 keys were produced that the vocabulary did not contain — 10.3% of the Qur'an
permanently unlearnable, with every test green. A dictionary is a third description of the same
language and can drift from the other two exactly the same way.

Checks, and each one is a failure mode that has actually happened here:
  1. every key is reachable in the lexicon        — else the entry can never be shown
  2. every key is already normalized              — else it was built without the pack's chain
  3. no entry has zero senses                     — an empty entry reads as "no meaning exists"
  4. coverage of the vocabulary is reported       — so a silently-thinning source is visible
"""
import json, re, sys

MARKS = re.compile('[ً-ْٰـۖ-ۭ]')
norm = lambda w: MARKS.sub('', w)

a = sys.argv
lexicon_path, vocab_path = a[a.index('--lexicon') + 1], a[a.index('--vocab') + 1]

reachable = set()
for line in open(lexicon_path, encoding='utf-8'):
    f = line.rstrip('\n').split('\t')
    if f and f[0]:
        reachable.add(norm(f[0]))
        reachable.update(norm(x) for x in f[1:] if x)
raw_vocab = [w for w in open(vocab_path, encoding='utf-8').read().split() if w]
vocab = [norm(w) for w in raw_vocab]

# ⚠️ REPORT WHAT A LEARNER ACTUALLY GETS. The app looks a word up, and falls back to its stem when
# the whole form misses — that is the entire point of segmentation.tsv. A check that reported only
# direct hits would understate every source by ~18 points and make a real improvement invisible.
stem = {}
seg_path = a[a.index('--segmentation') + 1] if '--segmentation' in a else None
if seg_path:
    for line in open(seg_path, encoding='utf-8'):
        f = line.rstrip('\n').split('\t')
        if len(f) >= 2 and f[1].strip():
            stem[f[0]] = norm(f[1])
reachable |= set(vocab)

problems = 0
for path in [x for x in a[1:] if x.endswith('.json')]:
    d = json.load(open(path, encoding='utf-8'))
    entries = d['entries']
    unreachable = [k for k in entries if k not in reachable]
    unnormalized = [k for k in entries if norm(k) != k]
    empty = [k for k, v in entries.items() if not v.get('senses')]
    blank = [k for k in entries if not k.strip()]
    covered = sum(1 for w in vocab if w in entries)
    with_stem = sum(1 for w in raw_vocab
                    if norm(w) in entries or (stem.get(w) and stem[w] in entries))

    extra = f"  +stem {with_stem/len(vocab):>6.1%}" if stem else ""
    print(f"  {d['id']:<16} {len(entries):>7,} entries   direct {covered/len(vocab):>6.1%}{extra}"
          f"   l1={d['l1']}  {d.get('licence', '?')}")
    for label, bad in (('unreachable in the lexicon', unreachable),
                       ('not normalized', unnormalized),
                       ('no senses', empty),
                       ('BLANK — a key that normalizes to nothing matches every lookup', blank)):
        if bad:
            problems += 1
            print(f"    ✗ {len(bad):,} keys {label}: {' '.join(bad[:6])}")

if problems:
    print(f"\n  {problems} problem(s) — a dictionary key nothing can reach is a meaning no learner sees.")
    sys.exit(1)
print("  ✓ every dictionary agrees with the lexicon it ships beside")
