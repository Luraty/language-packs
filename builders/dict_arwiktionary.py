#!/usr/bin/env python3
"""Parse the Arabic-edition Wiktionary dump into lemma -> Arabic definitions.

⚠️ WHY THIS EXISTS AND kaikki DOES NOT COVER IT. kaikki.org publishes Wiktextract output for the
ENGLISH and GERMAN editions only. Its "Arabic" dictionary is Arabic words glossed in ENGLISH. For a
monolingual Arabic dictionary the only source is ar.wiktionary's raw MediaWiki XML, parsed here.

⚠️ HEADWORDS ARE VOCALISED AND THE PACK'S LEXICON IS NOT. `مَاء` is the entry; `ماء` is a
disambiguation stub with no definition at all. Nothing is normalized in this file — the measurement
reports raw and normalized match rates separately, and folding here would hide the difference.

Sections read (ar.wiktionary's own headings):
  === المعاني ===      numbered senses, `# ` lines          -> definitions
  === المرادفات ===    synonyms                             -> same-language concept links
  === الترجمات ===     translations, `* {{xx}} [[word]]`    -> cross-language concept links

Usage:  bzcat arwiktionary-latest-pages-articles.xml.bz2 | python3 dict_arwiktionary.py <out.jsonl>
"""
import bz2, html, json, re, sys

ARABIC_SECTION = re.compile(r'==\s*\{\{اللغة\|عربية\}\}\s*==')
HEADING = re.compile(r'^=+\s*(.+?)\s*=+\s*$', re.M)

def clean(s: str) -> str:
    """Wikitext -> readable Arabic. Order matters: links before templates before quotes."""
    s = re.sub(r'\[\[([^\]|]*)\|([^\]]*)\]\]', r'\2', s)   # [[target|shown]] -> shown
    s = re.sub(r'\[\[([^\]]*)\]\]', r'\1', s)              # [[word]]         -> word
    s = re.sub(r'\{\{[^{}]*\}\}', ' ', s)                  # {{template}}     -> drop
    s = re.sub(r"'''?", '', s)                             # bold / italics
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip(' .،:*#')

def section(text: str, name: str) -> str:
    """The body under a `=== name ===` heading, up to the next heading of any level."""
    m = re.search(r'^=+\s*' + re.escape(name) + r'\s*=+\s*$', text, re.M)
    if not m:
        return ''
    rest = text[m.end():]
    nxt = HEADING.search(rest)
    return rest[:nxt.start()] if nxt else rest

def parse_page(title: str, text: str):
    if not ARABIC_SECTION.search(text):
        return None
    body = text[ARABIC_SECTION.search(text).end():]
    nxt = re.search(r'^==\s*\{\{اللغة\|(?!عربية)', body, re.M)
    if nxt:
        body = body[:nxt.start()]

    senses = []
    for line in section(body, 'المعاني').splitlines():
        if line.startswith('#') and not line.startswith('#:') and not line.startswith('#*'):
            g = clean(line[1:])
            if len(g) > 2:
                senses.append(g)

    syns = []
    for line in section(body, 'المرادفات').splitlines():
        if line.strip().startswith('*'):
            w = clean(line.strip()[1:])
            if w: syns.append(w)

    trs = []
    for line in section(body, 'الترجمات').splitlines():
        m = re.match(r'\*\s*\{\{([a-z][a-z-]{1,7})\}\}\s*(.+)', line.strip())
        if m:
            w = clean(m.group(2))
            if w: trs.append([m.group(1), w])

    if not (senses or syns or trs):
        return None
    rec = {'w': title}
    if senses: rec['s'] = [{'g': g} for g in senses[:12]]
    if syns:   rec['syn'] = syns[:12]
    if trs:    rec['tr'] = trs[:40]
    return rec

def main():
    out = open(sys.argv[1], 'w', encoding='utf-8')
    pages = kept = 0
    title, buf, intext = '', [], False
    for raw in sys.stdin:
        if '<title>' in raw:
            m = re.search(r'<title>(.*?)</title>', raw)
            if m: title = html.unescape(m.group(1))
        if '<text' in raw:
            intext = True
            buf = [raw[raw.index('<text'):]]
            buf[0] = re.sub(r'^<text[^>]*>', '', buf[0])
        elif intext:
            buf.append(raw)
        if intext and '</text>' in raw:
            intext = False
            pages += 1
            text = html.unescape(''.join(buf).split('</text>')[0])
            # namespaces: a ':' in the title is a project/category/template page, never a word
            if ':' not in title:
                rec = parse_page(title, text)
                if rec:
                    out.write(json.dumps(rec, ensure_ascii=False) + '\n')
                    kept += 1
            if pages % 100000 == 0:
                print(f'  {pages:,} pages  {kept:,} entries', file=sys.stderr, flush=True)
    out.close()
    print(f'done: {pages:,} pages, {kept:,} Arabic entries -> {sys.argv[1]}', file=sys.stderr)

main()
