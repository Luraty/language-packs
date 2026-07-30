# Luraty language packs.
#
# ⚠️ THIS FILE IS THE AUTOMATION. GitHub Actions is billing-blocked account-wide across these
# projects — every job dies in a few seconds with `steps: []`, and no YAML change fixes it. A target
# somebody runs is honest; a workflow that never starts is a green tick that means nothing.

DE           := languages/de
DE_OUT       := $(DE)/out
DE_WORDS     := data/leipzig/deu_news_2024_300K/deu_news_2024_300K-words.txt \
                data/leipzig/deu-de_web_2021_300K/deu-de_web_2021_300K-words.txt
WIKIDATA_DE  := data/wikidata/de.tsv
LUGHATY      := ../lughaty

.DEFAULT_GOAL := help
.PHONY: help check test verify provenance-update corpora-de de publish-de sync-pack-de

help:
	@echo ''
	@echo '  Luraty language packs'
	@echo ''
	@echo '  check              licence + consistency gate over languages/*/sources.json'
	@echo '  verify             every out/ file still matches its recorded checksum'
	@echo '  test               tests for the gate itself, including the failing cases'
	@echo ''
	@echo '  corpora-de         download the Leipzig corpora into data/  (~130 MB)'
	@echo '  de                 rebuild the German list and lemma table (fetches Wikidata if absent)'
	@echo ''
	@echo '  publish-de         push the German frequency list to Hugging Face'
	@echo '                     BLOCKED until the Leipzig licence is verified — on purpose'
	@echo '  sync-pack-de       copy the German outputs into @luraty/pack-de in lughaty'
	@echo ''
	@echo '  provenance-update  re-record checksums after a DELIBERATE rebuild. Diff first.'
	@echo ''

# The gate is stdlib-only Python and stays that way — `make check` has to run on a fresh clone with
# nothing installed. Give it a dependency and checking a licence starts needing `uv sync` first,
# and a gate you cannot run is a gate people route around. test_gate.py asserts this.

check:
	@python3 builders/check_sources.py

verify:
	@python3 builders/verify_provenance.py

provenance-update:
	@python3 builders/verify_provenance.py --update

test: check verify
	@python3 -m unittest discover -s builders -p 'test_*.py'

# ── corpora ───────────────────────────────────────────────────────────────────────────────────
# Downloads land in data/, which is gitignored. They are reproducible from sources.json; the
# derived lists are what this repo publishes. The sibling repo accumulated 3.2 GB of corpora in an
# unignored directory, which is the mistake this arrangement exists to avoid.

corpora-de:
	@mkdir -p data/leipzig
	@cd data/leipzig && for c in deu_news_2024_300K deu-de_web_2021_300K; do \
	  test -d $$c || { echo "  fetching $$c"; \
	    curl -fsSL -O https://downloads.wortschatz-leipzig.de/corpora/$$c.tar.gz && \
	    tar -xzf $$c.tar.gz; }; \
	done
	@echo '  corpora ready in data/'

# ── build ─────────────────────────────────────────────────────────────────────────────────────
# ONE PASS NOW, and the reason the old four collapsed to two is worth keeping.
#
# The treebank lemmatizer had to bootstrap: rank surface forms first (no lemma table existed yet),
# build lemmas from that ranking, then re-rank. That bootstrap is why `make de` ran four passes and
# why the ranking silently depended on CC BY-SA treebank data — see languages/de/sources.json.
#
# Wikidata Lexemes is a standalone lexicon, so there is nothing to bootstrap FROM: the table is
# built once from the dump, then the corpus is ranked through it. The failure the old pass 2
# existed to prevent — a word's frequency SPLIT across its inflections, so `vergangen`, `eigen` and
# `zweit` miss the top 10,000 while `vergangenen`, `eigenen` and `zweiten` make it — cannot happen,
# because the table is complete before the first count is read.

de: $(WIKIDATA_DE)
	@test -f $(firstword $(DE_WORDS)) || { echo '  no corpora — run: make corpora-de'; exit 1; }
	@echo '  pass 1/2 — form→lemma table from Wikidata Lexemes (CC0)'
	@python3 builders/build_lemmas_wikidata.py $(WIKIDATA_DE) $(DE_WORDS) \
	  --irregulars $(DE)/irregulars.tsv --out $(DE_OUT)/lemmas.tsv
	@echo '  pass 2/2 — rank, counts summed onto lemmas'
	@node builders/build-frequency.mjs $(DE_WORDS) --lemmas $(DE_OUT)/lemmas.tsv \
	  --out $(DE_OUT)/frequency.txt --limit 10000
	@echo ''
	@echo '  ⚠️  DIFF THE OUTPUT before recording it. A lemmatizer regression is silent:'
	@echo '      warten→waren and Ware→war both passed every guard the last time — and the'
	@echo '      Wikidata swap reproduced that class twice before it was caught (warten→warte,'
	@echo '      stärke→stärken). The regression cases are pinned in builders/test_gate.py.'
	@echo '      Then: make provenance-update'

$(WIKIDATA_DE):
	@echo '  fetching Wikidata German lexemes (596 MB dump, streamed)'
	@python3 builders/fetch_wikidata.py Q188 $(WIKIDATA_DE)

# ── publish ───────────────────────────────────────────────────────────────────────────────────
# The gate runs FIRST and its failure stops the target. Today it stops here, because nobody has
# read the Leipzig terms — the archives ship no licence file and the project pages are
# bot-protected. That block is the feature.

publish-de: check verify
	@python3 builders/check_sources.py --publish de/out/frequency.txt
	@uv run hf/publish.py --language de

# ── the seam with lughaty ─────────────────────────────────────────────────────────────────────
# One direction only: this repo generates, the pack vendors. @luraty/pack-de cannot live here yet
# because it imports the private, unpublished @luraty/engine at runtime.

sync-pack-de: verify
	@test -d $(LUGHATY)/packs/de || { echo '  lughaty not found beside this repo'; exit 1; }
	@cp $(DE_OUT)/frequency.txt $(DE_OUT)/lemmas.tsv $(LUGHATY)/packs/de/
	@echo '  copied into $(LUGHATY)/packs/de/'
	@echo '  now run there:  cd $(LUGHATY)/packs/de && npm run generate && npm test'
