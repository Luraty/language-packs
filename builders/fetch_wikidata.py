"""Stream the Wikidata lexeme dump and extract form -> lemma pairs for one language.

⚠️ THE DUMP, NOT SPARQL, AND THE REASON IS EXPENSIVE EXPERIENCE.

Two SPARQL attempts failed in ways that are easy to not notice:
  1. Paging over FORMS with LIMIT/OFFSET and no ORDER BY. WDQS may return rows in any order, so
     pages overlapped and the tail was never fetched — 777,977 rows came back holding only
     288,776 distinct pairs (62.9% duplicates) and it looked like a successful run.
  2. Adding ORDER BY made it deterministic and made every page 504: sorting 242k lexemes
     server-side per request exceeds the query timeout.

The dump has neither failure mode. It is complete by construction, needs no server-side sort, and
one pass gets every language. 596 MB gzipped, streamed — never held in memory.

Usage:  python3 builders/fetch_wikidata.py Q188 data/wikidata/de.tsv
Language Q-ids: German Q188, Arabic Q13955.
"""
#
# The SPARQL route failed twice: paging over forms with no ORDER BY returned 62.9% duplicates and
# silently truncated, and adding ORDER BY made every page 504 (sorting 242k lexemes per request).
# The dump has neither problem -- it is complete by construction and needs no server-side sort.
import gzip, json, sys, urllib.request
from pathlib import Path

URL = "https://dumps.wikimedia.org/wikidatawiki/entities/latest-lexemes.json.gz"
UA = "luraty-language-packs/0.1 (github.com/younissk/luraty-language-packs)"
LANGUAGE = sys.argv[1] if len(sys.argv) > 1 else "Q188"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/wikidata/de.tsv"

req = urllib.request.Request(URL, headers={"User-Agent": UA})
pairs, lexemes, seen, cats = set(), 0, 0, {}
with urllib.request.urlopen(req) as resp, gzip.open(resp, "rt", encoding="utf-8") as fh:
    for line in fh:
        line = line.strip().rstrip(",")
        if not line or line in ("[", "]"):
            continue
        seen += 1
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if e.get("language") != LANGUAGE:
            continue
        lexemes += 1
        lemma = next(iter(e.get("lemmas", {}).values()), {}).get("value")
        if not lemma:
            continue
        cats[e.get("lexicalCategory")] = cats.get(e.get("lexicalCategory"), 0) + 1
        for form in e.get("forms", []):
            for rep in form.get("representations", {}).values():
                if rep.get("value"):
                    pairs.add((rep["value"], lemma, e.get("lexicalCategory") or ""))
        if lexemes % 25000 == 0:
            print(f"  {lexemes} de lexemes / {seen} scanned / {len(pairs)} pairs", flush=True)

Path(OUT).parent.mkdir(parents=True, exist_ok=True)
with open(OUT, "w", encoding="utf-8") as out:
    for f, l, c in sorted(pairs):
        out.write(f"{f}\t{l}\t{c}\n")
print(f"DONE  entities scanned {seen}  german lexemes {lexemes}  pairs {len(pairs)}")
print("top categories:", sorted(cats.items(), key=lambda kv: -kv[1])[:6])
