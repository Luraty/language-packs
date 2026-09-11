#!/usr/bin/env python3
"""PoC analysis: do open dictionaries actually cover the words a learner will meet?

Answers five questions with numbers, for lughaty 2026-09-11. Prints a report; writes nothing.
"""
import json, sys, os
from collections import Counter

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
def p(*a): return os.path.join(ROOT, *a)

def load_jsonl(path, key=lambda r: r['w'].lower()):
    d = {}
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            try: r = json.loads(line)
            except Exception: continue
            d.setdefault(key(r), []).append(r)
    return d

def freq_words(path, limit=None):
    """Leipzig `rank<TAB>word<TAB>count` OR our space-separated frequency string."""
    words = []
    with open(path, encoding='utf-8') as fh:
        head = fh.read(200); fh.seek(0)
        if '\t' in head:
            for line in fh:
                f = line.rstrip('\n').split('\t')
                if len(f) >= 3: words.append((f[1], int(f[2])))
        else:
            for i, w in enumerate(fh.read().split()):
                words.append((w, 0))
    return words[:limit] if limit else words

print('=' * 78)
print('  OPEN DICTIONARIES vs A LEARNER VOCABULARY — proof of concept')
print('=' * 78)

wn = load_jsonl(p('data/dict/wordnet-en.jsonl'))
wk = load_jsonl(p('data/dict/wikt-en.jsonl'))
print(f'\nWordNet 3.1     {len(wn):>8,} distinct lemmas   {sum(len(v) for v in wn.values()):>8,} (lemma,pos) records')
print(f'Wiktionary EN   {len(wk):>8,} distinct lemmas   {sum(len(v) for v in wk.values()):>8,} (lemma,pos) records')

# ── 1. coverage over the words she actually meets ────────────────────────────
print('\n' + '-' * 78)
print('1. COVERAGE — of the commonest English words, how many have a meaning?')
print('-' * 78)
_raw = [w for w, _ in freq_words(p('data/leipzig/eng_news_2024_300K/eng_news_2024_300K-words.txt'))
        if w.isalpha() and len(w) > 1]
fw, _seen = [], set()
for w in _raw:                      # keep rank order, one entry per case-folded word
    k = w.lower()
    if k not in _seen:
        _seen.add(k); fw.append(k)
for n in (1000, 5000, 10000, 20000):
    band = fw[:n]
    if not band: continue
    inwn = sum(1 for w in band if w in wn)
    inwk = sum(1 for w in band if w in wk)
    both = sum(1 for w in band if w in wn and w in wk)
    nei  = sum(1 for w in band if w not in wn and w not in wk)
    print(f'  top {n:>6,}:  WordNet {inwn/len(band):6.1%}   Wiktionary {inwk/len(band):6.1%}'
          f'   both {both/len(band):6.1%}   NEITHER {nei/len(band):6.1%}')
miss = [w for w in fw[:5000] if w not in wn and w not in wk][:25]
print(f'  missed by both, from the top 5k: {" ".join(miss[:25])}')

# ── 2. do two dictionaries agree? ────────────────────────────────────────────
print('\n' + '-' * 78)
print('2. DISAGREEMENT — two dictionaries, same word, how many meanings?')
print('-' * 78)
shared = [w for w in fw[:10000] if w in wn and w in wk]
dw, dk, ratios = [], [], []
for w in shared:
    a = sum(len(r.get('g', [])) for r in wn[w])
    b = sum(len(r.get('s', [])) for r in wk[w])
    if a and b:
        dw.append(a); dk.append(b); ratios.append(b / a)
if ratios:
    ratios.sort()
    med = ratios[len(ratios)//2]
    print(f'  compared on {len(ratios):,} shared lemmas')
    print(f'  mean senses   WordNet {sum(dw)/len(dw):5.2f}   Wiktionary {sum(dk)/len(dk):5.2f}')
    print(f'  median ratio (Wiktionary / WordNet): {med:.2f}x')
    print(f'  Wiktionary has MORE senses on {sum(1 for r in ratios if r>1)/len(ratios):.1%} of them')
    worst = sorted(((sum(len(r.get("g",[])) for r in wk[w]) - sum(len(r.get("g",[])) for r in wn[w]), w)
                    for w in shared), reverse=True)[:8]
    print('  biggest gaps (Wiktionary extra senses):')
    for diff, w in worst:
        g_wn = (wn[w][0].get('g') or [''])[0][:48]
        g_wk = ((wk[w][0].get('s') or [{}])[0].get('g') or '')[:48]
        print(f'    {w:<14} +{diff:<4} WN: {g_wn}')
        print(f'    {"":<14}      WK: {g_wk}')

# ── 3. does a dictionary already know which words are regional? ──────────────
print('\n' + '-' * 78)
print('3. REGIONAL TAGS — does Wiktionary already know what is British?')
print('-' * 78)
tags = Counter()
tagged = {}
for w, recs in wk.items():
    ts = set()
    for r in recs:
        ts.update(r.get('wrt', []))
        for sn in r.get('s', []): ts.update(sn.get('rt', []))
    if ts:
        tagged[w] = ts
        for t in ts: tags[t] += 1
print(f'  {len(tagged):,} of {len(wk):,} Wiktionary lemmas carry a regional tag ({len(tagged)/len(wk):.1%})')
for t, c in tags.most_common(12):
    print(f'    {t:<16} {c:>7,}')
band = set(fw[:10000])
common_tagged = [w for w in band if w in tagged]
print(f'  within the commonest 10,000 words: {len(common_tagged):,} carry a regional tag')
print(f'    e.g. {" ".join(sorted(common_tagged)[:20])}')

# ── 4. the bridge, for free ──────────────────────────────────────────────────
print('\n' + '-' * 78)
print('4. THE BRIDGE — how many English words come with a translation?')
print('-' * 78)
langs = Counter()
tr_by_word = {}
for w, recs in wk.items():
    t = {}
    for r in recs:
        for lc, tw in r.get('tr', []):
            t.setdefault(lc, set()).add(tw)
    if t:
        tr_by_word[w] = t
        for lc in t: langs[lc] += 1
print(f'  {len(tr_by_word):,} lemmas carry at least one translation')
print('  top target languages:')
for lc, c in langs.most_common(14):
    print(f'    {lc:<8} {c:>7,}')
for n in (1000, 5000, 10000):
    b = fw[:n]
    de = sum(1 for w in b if w in tr_by_word and 'de' in tr_by_word[w])
    ar = sum(1 for w in b if w in tr_by_word and 'ar' in tr_by_word[w])
    print(f'  top {n:>6,}:  has German {de/len(b):6.1%}   has Arabic {ar/len(b):6.1%}')

# ── 5. the variety pair ──────────────────────────────────────────────────────
print('\n' + '-' * 78)
print('5. VARIETY — what actually differs between general and British English?')
print('-' * 78)
uk = freq_words(p('data/leipzig/eng-uk_web_2002_300K/eng-uk_web_2002_300K-words.txt'))
gen = freq_words(p('data/leipzig/eng_news_2024_300K/eng_news_2024_300K-words.txt'))
def ranks(rows):
    r, seen_ = {}, set()
    for w, _ in rows:
        k = w.lower()
        if k.isalpha() and len(k) > 1 and k not in seen_:
            seen_.add(k); r[k] = len(r) + 1
    return r
ru, rg = ranks(uk), ranks(gen)
both_v = [w for w in ru if w in rg and (ru[w] <= 20000 or rg[w] <= 20000)]
print(f'  ranked in both: {len(both_v):,}')
shift = sorted(((rg[w] - ru[w], w) for w in both_v), reverse=True)
print('  much commoner in BRITISH than in general English:')
print('   ', ' '.join(w for _, w in shift[:22]))
print('  much commoner in GENERAL than in British English:')
print('   ', ' '.join(w for _, w in shift[-22:]))
only_uk = [w for w in ru if w not in rg and ru[w] <= 10000]
only_gen = [w for w in rg if w not in ru and rg[w] <= 10000]
print(f'  in the British top 10k but absent from general: {len(only_uk):,}')
print(f'  in the general top 10k but absent from British: {len(only_gen):,}')
tagged_uk = [w for w in only_uk if w in tagged]
print(f'  ...of the British-only words, {len(tagged_uk):,} are ALREADY TAGGED regional by Wiktionary')
print(f'    e.g. {" ".join(sorted(tagged_uk)[:20])}')

# ── 6. coverage by part of speech ────────────────────────────────────────────
print('\n' + '-' * 78)
print('6. WHAT THE DICTIONARIES MISS — coverage by part of speech')
print('-' * 78)
wk_pos = {}
for w, recs in wk.items():
    wk_pos.setdefault(w, set()).update(r.get('p', '') for r in recs)
band1k = fw[:1000]
missing_wn = [w for w in band1k if w not in wn]
print(f'  of the commonest 1,000 words, {len(missing_wn)} have NO WordNet entry')
in_wk = [w for w in missing_wn if w in wk]
print(f'    of those, {len(in_wk)} ARE in Wiktionary, as: ', end='')
print(Counter(p_ for w in in_wk for p_ in wk_pos.get(w, [])).most_common(8))
print(f'    still missing from both: {" ".join(w for w in missing_wn if w not in wk)[:200]}')
