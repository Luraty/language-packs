#!/usr/bin/env bash
# Build the `en` and `en-GB` packs. ADR-0046 shape: ONE lexicon generated over BOTH corpora,
# TWO frequency lists. en-GB is a region of one language (ADR-0045), so it shares the lexicon
# exactly as Qur'anic shares fusha's.
set -euo pipefail
cd "$(dirname "$0")/.."

WD=data/wikidata/en.tsv
GEN=data/leipzig/eng_news_2024_300K/eng_news_2024_300K-words.txt
UK=data/leipzig/eng-uk_web_2002_300K/eng-uk_web_2002_300K-words.txt
OUT=languages/en/out
mkdir -p "$OUT"

echo '  pass 1/3 — one form→lemma table, generated over BOTH corpora (ADR-0046)'
python3 builders/build_lemmas_wikidata.py "$WD" "$GEN" "$UK" --script latin --out "$OUT/lemmas.tsv"

echo '  pass 2/3 — general-English ranking'
node builders/build-frequency.mjs "$GEN" --lemmas "$OUT/lemmas.tsv" \
  --script latin --out "$OUT/frequency.en.txt" --limit 10000

echo '  pass 3/3 — British ranking, over the SAME lexicon'
node builders/build-frequency.mjs "$UK" --lemmas "$OUT/lemmas.tsv" \
  --script latin --out "$OUT/frequency.en-GB.txt" --limit 10000

echo
echo "  lexicon:    $(wc -l < "$OUT/lemmas.tsv") rows"
echo "  en order:   $(wc -w < "$OUT/frequency.en.txt") words"
echo "  en-GB order:$(wc -w < "$OUT/frequency.en-GB.txt") words"
