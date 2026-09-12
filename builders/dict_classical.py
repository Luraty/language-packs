#!/usr/bin/env python3
"""Extract the PUBLIC-DOMAIN Arabic dictionaries from the `wizsk/arabic_lexicons` SQLite.

⚠️ **FOUR OF THE TEN TABLES IN THAT FILE ARE STILL IN COPYRIGHT AND ARE DELIBERATELY NOT READ.**
The repository states it uses "no proprietary sources"; that claim is about its own FORMATTING, not
about the underlying texts, and it is wrong. Taken here:

  mujamul_muhith          al-Qāmūs al-Muḥīṭ         Fīrūzābādī        d. 1414   PD
  mujamul_shihah          al-Ṣiḥāḥ                  al-Jawharī        d. 1003   PD
  maqayeesul_luga         Maqāyīs al-Lugha          Ibn Fāris         d. 1004   PD
  mufradat_alfajul_quran  al-Mufradāt               al-Rāghib         d. 1108   PD
  lisanularab             Lisān al-ʿArab            Ibn Manẓūr        d. 1312   PD
  lanelexcon              Lane's Arabic-English Lexicon               1863-93   PD

  ⛔ mujamul_muashiroh    Aḥmad Mukhtār ʿUmar, 2008 — protected to ~2053
  ⛔ mujamul_ghoni        modern
  ⛔ mujamul_wasith       Cairo Academy, 1960
  ⛔ hanswehr             Harrassowitz, in copyright

⚠️ **LISĀN AL-ʿARAB AVERAGES 2,781 CHARACTERS PER ENTRY.** It is a scholarly reference, not a gloss
a learner reads on a tap. Kept, truncated hard, and ranked last of the Arabic sources.
"""
import html, json, re, sqlite3, sys

SOURCES = [
    ('mujamul_muhith',         'qamus-muhit',  'ar'),
    ('mujamul_shihah',         'sihah',        'ar'),
    ('maqayeesul_luga',        'maqayis',      'ar'),
    ('mufradat_alfajul_quran', 'mufradat',     'ar'),
    ('lisanularab',            'lisan-al-arab','ar'),
    ('lanelexcon',             'lane',         'en'),
]
MAX_CHARS = 400

def clean(t: str) -> str:
    t = html.unescape(t or '')
    t = re.sub(r'<br\s*/?>', ' · ', t, flags=re.I)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = re.sub(r'\s+', ' ', t)
    return t.strip(' .،:;-')

db, outdir = sys.argv[1], sys.argv[2]
con = sqlite3.connect(db)
for table, slug, l1 in SOURCES:
    rows = con.execute(f'select word, meanings from "{table}"').fetchall()
    kept = 0
    with open(f'{outdir}/classical-{slug}.jsonl', 'w', encoding='utf-8') as out:
        for word, meaning in rows:
            if not word or not meaning:
                continue
            text = clean(meaning)
            if len(text) < 3:
                continue
            if len(text) > MAX_CHARS:
                text = text[:MAX_CHARS].rsplit(' ', 1)[0] + ' …'
            out.write(json.dumps({'w': word.strip(), 'p': '', 's': [{'g': text}]},
                                 ensure_ascii=False) + '\n')
            kept += 1
    print(f'  {slug:<16} {kept:>7,} entries  (l1={l1})', file=sys.stderr)
