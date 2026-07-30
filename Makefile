# Luraty language packs.
#
# ⚠️ THIS FILE IS THE AUTOMATION. GitHub Actions is billing-blocked account-wide across these
# projects — every job dies in a few seconds with `steps: []`, and no YAML change fixes it. A target
# somebody runs is honest; a workflow that never starts is a green tick that means nothing.

DE           := languages/de
DE_OUT       := $(DE)/out
DE_WORDS     := data/leipzig/deu_news_2024_300K/deu_news_2024_300K-words.txt \
                data/leipzig/deu-de_web_2021_300K/deu-de_web_2021_300K-words.txt
DE_TREEBANKS := data/ud/UD_German-GSD/*.conllu data/ud/UD_German-HDT/*.conllu
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
	@echo '  corpora-de         download Leipzig + clone the UD treebanks into data/  (~1 GB)'
	@echo '  de                 rebuild the German list and lemma table (two passes)'
	@echo ''
	@echo '  publish-de         push the German frequency list to Hugging Face'
	@echo '                     BLOCKED until the Leipzig licence is verified — on purpose'
	@echo '  sync-pack-de       copy the German outputs into @luraty/pack-de in lughaty'
	@echo ''
	@echo '  provenance-update  re-record checksums after a DELIBERATE rebuild. Diff first.'
	@echo ''

check:
	@node builders/check-sources.mjs

verify:
	@node builders/verify-provenance.mjs

provenance-update:
	@node builders/verify-provenance.mjs --update

test: check verify
	@node --test builders/check-sources.test.mjs

# ── corpora ───────────────────────────────────────────────────────────────────────────────────
# Downloads land in data/, which is gitignored. They are reproducible from sources.json; the
# derived lists are what this repo publishes. The sibling repo accumulated 3.2 GB of corpora in an
# unignored directory, which is the mistake this arrangement exists to avoid.

corpora-de:
	@mkdir -p data/leipzig data/ud
	@cd data/leipzig && for c in deu_news_2024_300K deu-de_web_2021_300K; do \
	  test -d $$c || { echo "  fetching $$c"; \
	    curl -fsSL -O https://downloads.wortschatz-leipzig.de/corpora/$$c.tar.gz && \
	    tar -xzf $$c.tar.gz; }; \
	done
	@cd data/ud && for t in UD_German-GSD UD_German-HDT; do \
	  test -d $$t || { echo "  cloning $$t"; \
	    git clone --depth 1 https://github.com/UniversalDependencies/$$t; }; \
	done
	@echo '  corpora ready in data/'

# ── build ─────────────────────────────────────────────────────────────────────────────────────
# TWO PASSES, and the second is not optional.
#
# Pass one has to rank surface forms, because no lemma table exists yet. That is wrong in a way
# that shows up immediately: a word's frequency is SPLIT across its inflections, so `vergangen`,
# `eigen` and `zweit` never reach the top 10,000 while `vergangenen`, `eigenen` and `zweiten` do —
# and the list ends up holding forms whose own lemma it does not hold, 750 of them with a key that
# cannot be ranked at all. Pass two sums every surface count onto its LEMMA, which is what "how
# common is this word" actually means.

de:
	@test -f $(firstword $(DE_WORDS)) || { echo '  no corpora — run: make corpora-de'; exit 1; }
	@echo '  pass 1/4 — rank surface forms'
	@node builders/build-frequency.mjs $(DE_WORDS) --out $(DE_OUT)/frequency.txt --limit 10000
	@echo '  pass 2/4 — lemmas from the surface ranking'
	@node builders/build-lemmas.mjs $(DE_OUT)/frequency.txt $(DE_TREEBANKS) \
	  --irregulars $(DE)/irregulars.tsv --out $(DE_OUT)/lemmas.tsv
	@echo '  pass 3/4 — re-rank, counts summed onto lemmas'
	@node builders/build-frequency.mjs $(DE_WORDS) --lemmas $(DE_OUT)/lemmas.tsv \
	  --out $(DE_OUT)/frequency.txt --limit 10000
	@echo '  pass 4/4 — lemmas from the final ranking'
	@node builders/build-lemmas.mjs $(DE_OUT)/frequency.txt $(DE_TREEBANKS) \
	  --irregulars $(DE)/irregulars.tsv --out $(DE_OUT)/lemmas.tsv
	@echo ''
	@echo '  ⚠️  DIFF THE OUTPUT before recording it. A lemmatizer regression is silent:'
	@echo '      warten→waren and Ware→war both passed every guard the last time.'
	@echo '      Then: make provenance-update'

# ── publish ───────────────────────────────────────────────────────────────────────────────────
# The gate runs FIRST and its failure stops the target. Today it stops here, because nobody has
# read the Leipzig terms — the archives ship no licence file and the project pages are
# bot-protected. That block is the feature.

publish-de: check verify
	@node builders/check-sources.mjs --publish de/out/frequency.txt
	@uv run hf/publish.py --language de

# ── the seam with lughaty ─────────────────────────────────────────────────────────────────────
# One direction only: this repo generates, the pack vendors. @luraty/pack-de cannot live here yet
# because it imports the private, unpublished @luraty/engine at runtime.

sync-pack-de: verify
	@test -d $(LUGHATY)/packs/de || { echo '  lughaty not found beside this repo'; exit 1; }
	@cp $(DE_OUT)/frequency.txt $(DE_OUT)/lemmas.tsv $(LUGHATY)/packs/de/
	@echo '  copied into $(LUGHATY)/packs/de/'
	@echo '  now run there:  cd $(LUGHATY)/packs/de && npm run generate && npm test'
