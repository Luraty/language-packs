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
AR           := languages/ar
AR_OUT       := $(AR)/out
# ⚠️ NEWS ONLY, ON PURPOSE. ara_wikipedia_2021_1M is downloaded and deliberately NOT built from:
# its upstream is Arabic Wikipedia (CC BY-SA), so Leipzig arguably grants more than it holds. The
# two news corpora have no share-alike upstream, and dropping one corpus is cheaper than defending
# that. See languages/ar/sources.json.
AR_WORDS     := data/leipzig/ara_news_2020_1M/ara_news_2020_1M-words.txt \
                data/leipzig/ara_news_2022_1M/ara_news_2022_1M-words.txt
WIKIDATA_AR  := data/wikidata/ar.tsv
# ⚠️ ar-x-quran, not ar-QA. `QA` is the ISO region code for QATAR, so `ar-QA` means "Arabic as used
# in Qatar" to every BCP 47 parser. There is no registered variant subtag for Arabic at all (checked
# against the IANA registry) and no ISO code for Classical Arabic — Classical Syriac has `syc` and
# Classical Armenian `xcl`, but Arabic's classical register is folded into `arb`. Private use
# (`-x-`) is therefore the only well-formed way to say this, and it cannot collide with a country.
QUR          := languages/ar-x-quran
QUR_OUT      := $(QUR)/out
QUR_WORDS    := data/quran/quran-words.txt
LUGHATY      := ../lughaty

.DEFAULT_GOAL := help
.PHONY: help check test verify provenance-update corpora-de corpora-ar de ar quran publish-de publish-ar publish-quran sync-pack-de

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
	@echo '  corpora-ar         download the Arabic Leipzig news corpora into data/  (~600 MB)'
	@echo '  ar                 rebuild the Arabic list and lemma table'
	@echo '  quran              rebuild the Qur'"'"'anic Arabic list (ar-x-quran)'
	@echo ''
	@echo '  publish-de         push the German frequency list to Hugging Face'
	@echo '  publish-ar         push the Arabic frequency list'
	@echo '  publish-quran      push the Qur'"'"'anic Arabic frequency list'
	@echo '                     ⚠️ Gate is OPEN as of 2026-07-30 — these really will publish,'
	@echo '                     and the push path has never been exercised. Dry-run first.'
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

# ⚠️ A DICTIONARY IS A THIRD DESCRIPTION OF THE SAME LANGUAGE, and it drifts from the lexicon and
# the frequency list exactly the way those two drifted from each other in #106 — 1,252 keys the
# vocabulary did not contain, 10.3% of the Qur'an unlearnable, every test green. This lane compares
# all three against each other and refuses a key nothing can reach.
dictionaries:
	@python3 builders/check_dictionary.py languages/fusha/out/dictionary.*.json \
	  --lexicon languages/fusha/out/lemmas.tsv --vocab languages/fusha/out/frequency.msa.txt \
	  --segmentation languages/fusha/out/segmentation.tsv

# Build both Arabic dictionaries from the extracted dumps. Sources are streamed, never stored:
#   curl -sL <kaikki Arabic>  | python3 builders/dict_kaikki_ar.py     data/dict/wikt-ar-en.jsonl
#   bzcat  <ar.wiktionary xml> | python3 builders/dict_arwiktionary.py data/dict/wikt-ar-ar.jsonl
dict-ar:
	@python3 builders/build_dictionary.py data/dict/wikt-ar-en.jsonl --id wiktionary-en --l1 en \
	  --lexicon languages/fusha/out/lemmas.tsv --vocab languages/fusha/out/frequency.msa.txt \
	  --out languages/fusha/out/dictionary.wiktionary-en.json
	@python3 builders/build_dictionary.py data/dict/wikt-ar-ar.jsonl --id wiktionary-ar --l1 ar \
	  --lexicon languages/fusha/out/lemmas.tsv --vocab languages/fusha/out/frequency.msa.txt \
	  --out languages/fusha/out/dictionary.wiktionary-ar.json
	@$(MAKE) --no-print-directory dictionaries

# ⚠️ THE SEGMENTATION IS FOR DICTIONARY LOOKUP, NEVER FOR UNIT KEYS. A unit key is
# modality:variety:LEMMA; if a segment ever fed that, every learner's history would re-address
# itself silently. This lane asserts the two tables stay DIFFERENT — convergence means one has
# overwritten the other.
segmentation:
	@python3 builders/check_segmentation.py languages/fusha/out/segmentation.tsv \
	  --lexicon languages/fusha/out/lemmas.tsv

# Needs CAMeL Tools. ⚠️ Install the DB by name — `camel_data -i light` pulls morphology-db-msa-s31,
# which requires a PURCHASED LDC licence:
#   python3 -m venv .venv && .venv/bin/pip install camel-tools
#   .venv/bin/camel_data -i morphology-db-msa-r13 -i disambig-mle-calima-msa-r13
seg-ar:
	@cut -f1 languages/fusha/out/lemmas.tsv > /tmp/lp-forms.txt
	@.venv/bin/python builders/segment_camel.py /tmp/lp-forms.txt languages/fusha/out/segmentation.tsv
	@$(MAKE) --no-print-directory segmentation

test: check verify dictionaries segmentation
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
	@echo '      Wikidata swap reproduced that class three times before it was caught (warten→warte,'
	@echo '      stärke→stärken, in→-in). The regression cases are pinned in builders/test_lemmas.py.'
	@echo '      Then: make provenance-update'

$(WIKIDATA_DE):
	@echo '  fetching Wikidata German lexemes (596 MB dump, streamed)'
	@python3 builders/fetch_wikidata.py Q188 $(WIKIDATA_DE)

ar: $(WIKIDATA_AR)
	@test -f $(firstword $(AR_WORDS)) || { echo '  no corpora — run: make corpora-ar'; exit 1; }
	@mkdir -p $(AR_OUT)
	@echo '  pass 1/2 — form→lemma table from Wikidata Lexemes (CC0)'
	@python3 builders/build_lemmas_wikidata.py $(WIKIDATA_AR) $(AR_WORDS) \
	  --script arabic --out $(AR_OUT)/lemmas.tsv
	@echo '  pass 2/2 — rank, counts summed onto lemmas'
	@node builders/build-frequency.mjs $(AR_WORDS) --lemmas $(AR_OUT)/lemmas.tsv \
	  --script arabic --out $(AR_OUT)/frequency.txt --limit 10000
	@echo ''
	@echo '  ⚠️  MSA ONLY. Inherited dialect and written MSA are separate systems; this measures'
	@echo '      newswire MSA. A dialect list is a different corpus, not a flag on this one.'

$(WIKIDATA_AR):
	@echo '  fetching Wikidata Arabic lexemes (596 MB dump, streamed)'
	@python3 builders/fetch_wikidata.py Q13955 $(WIKIDATA_AR)

corpora-ar:
	@mkdir -p data/leipzig
	@cd data/leipzig && for c in ara_news_2020_1M ara_news_2022_1M; do \
	  test -d $$c || { echo "  fetching $$c"; \
	    curl -fsSL -O https://downloads.wortschatz-leipzig.de/corpora/$$c.tar.gz && \
	    tar -xzf $$c.tar.gz; }; \
	done
	@echo '  corpora ready in data/'

# ── qur'anic arabic ───────────────────────────────────────────────────────────────────────────
# A separate pack rather than a register of `ar`, for the same reason the Hugging Face repos are
# named for the search: somebody looking for Qur'anic vocabulary is not looking for a general Arabic
# frequency list. Different corpus, different orthography, different register — but the SAME
# pipeline, because it is still Arabic script and still the CC0 Wikidata lexicon.

# ⚠️ THE LEMMA TABLE IS BUILT AGAINST BOTH CORPORA, and that is not an accident. Its homograph
# tiebreak and rarity guard are STATISTICAL: they need a large frequency signal to decide that في is
# a word in its own right and not an inflection of the rare verb وفى. Built against the Qur'an alone
# — 77,878 tokens — those statistics are too thin and في lands under وفى, which is precisely the
# error that made the first Arabic build's top ten wrong. Leipzig's 10M tokens do the deciding; the
# Qur'an contributes its own vocabulary for attestation. Only the RANKING below uses Qur'anic counts.
quran: $(WIKIDATA_AR) $(QUR_WORDS)
	@test -f $(firstword $(AR_WORDS)) || { echo '  needs the ar corpora too — run: make corpora-ar'; exit 1; }
	@mkdir -p $(QUR_OUT)
	@echo '  pass 1/2 — form→lemma table from Wikidata Lexemes (CC0)'
	@python3 builders/build_lemmas_wikidata.py $(WIKIDATA_AR) $(AR_WORDS) $(QUR_WORDS) \
	  --script arabic --out $(QUR_OUT)/lemmas.tsv
	@echo '  pass 2/2 — rank, counts summed onto lemmas'
	@node builders/build-frequency.mjs $(QUR_WORDS) --lemmas $(QUR_OUT)/lemmas.tsv \
	  --script arabic --min-count 1 --out $(QUR_OUT)/frequency.txt --limit 10000
	@cp data/quran/uthmani.tsv $(QUR_OUT)/uthmani.tsv
	@echo ''
	@echo '  ⚠️  KEYS ARE MODERN ORTHOGRAPHY, uthmani.tsv holds the mushaf spelling. The rewrites'
	@echo '      are conditional on the lexicon — an unconditional final ى→ي turns على into علي.'
	@echo '      --min-count 1 because the mushaf is a curated text with no OCR tail to filter;'
	@echo '      a word occurring once in the Qur'"'"'an is a real word, not scanner noise.'

$(QUR_WORDS): $(WIKIDATA_AR)
	@echo '  fetching the Qur'"'"'anic text (public domain; MIT-packaged digitization)'
	@python3 builders/fetch_quran.py --out $(QUR_WORDS) \
	  --uthmani data/quran/uthmani.tsv --wikidata $(WIKIDATA_AR)

# ── publish ───────────────────────────────────────────────────────────────────────────────────
# The gate runs FIRST and its failure stops the target.
#
# ⚠️ IT NO LONGER STOPS HERE. Until 2026-07-30 this target was permanently red because nobody had
# read the Leipzig terms; that block was the feature and it did its job for months. The terms have
# now been read and stamped with their evidence chain, so `make publish-de` will actually push to
# Hugging Face. Treat the push path as UNVERIFIED CODE — hf/publish.py has only ever run --dry-run.

publish-de: check verify
	@python3 builders/check_sources.py --publish de/out/frequency.txt
	@uv run hf/publish.py --language de

publish-ar: check verify
	@python3 builders/check_sources.py --publish ar/out/frequency.txt
	@uv run hf/publish.py --language ar

publish-quran: check verify
	@python3 builders/check_sources.py --publish ar-x-quran/out/frequency.txt
	@uv run hf/publish.py --language ar-x-quran

# ── the seam with lughaty ─────────────────────────────────────────────────────────────────────
# One direction only: this repo generates, the pack vendors. @luraty/pack-de cannot live here yet
# because it imports the private, unpublished @luraty/engine at runtime.

sync-pack-de: verify
	@test -d $(LUGHATY)/packs/de || { echo '  lughaty not found beside this repo'; exit 1; }
	@cp $(DE_OUT)/frequency.txt $(DE_OUT)/lemmas.tsv $(LUGHATY)/packs/de/
	@echo '  copied into $(LUGHATY)/packs/de/'
	@echo '  now run there:  cd $(LUGHATY)/packs/de && npm run generate && npm test'
