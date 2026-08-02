# Where the next corpus comes from

Companion to `catalog/corpora.json`, which is the enforced version — `make catalog` cross-checks it
against every `languages/*/sources.json`, and a source whose licence disagrees with its catalogue
entry is an error. This file is the reading copy. **If the two disagree, the JSON is what runs.**

```bash
make catalog              # cross-check the catalogue against what the languages claim
make candidates L=de      # what would add a register German lacks, and at what licence cost
make candidates L=ar
```

## What was and was not done, 2026-07-30

**Nothing was downloaded.** Every URL below was probed with an HTTP `HEAD` — enough to prove the
endpoint answers and to report the transfer size, and enough to notice that two documented SUBTLEX
locations are gone.

**Six licences were read in full**, by fetching the upstream `LICENSE.txt` directly: the three
German and three Arabic UD treebanks. Those are stamped `licenceVerified: true` with the verbatim
text quoted in their notes.

**The Leipzig licence was not read, after four attempts.** `/en/usage` answers with an anti-bot
interstitial (*"Making sure you're not a bot!"*), `/en/download/` carries no licence text, and
neither `repo.data.saw-leipzig.de` nor the CLARIN VLO surfaced anything machine-readable. So German
stays unpublishable, which is the gate working rather than failing. **A human with a browser closes
this in five minutes and nothing else here does.**

---

## The licence bar these are judged against

The lists are **open source and free for everyone, and also ship inside Luraty, which has paid
features**. So:

- **CC BY** ✅ · **CC BY-SA** ✅ (share-alike is not a commercial restriction) · **CC BY-NC** ❌ ·
  **CC BY-ND** ❌
- ⚠️ NC survives neither workaround. It binds the *licensee*, so open-sourcing a derivative lifts
  nothing; and it restricts the *use*, so "the list itself is free inside the app" does not help
  either. Full reasoning, including the German case law, in `languages/de/SOURCES.md`.

That is why the two findings below are fatal rather than inconvenient.

## The three findings worth acting on

### 1. The obvious Arabic lemma source is non-commercial

`UD_Arabic-PADT` is **CC BY-NC-SA 3.0** — read verbatim, not inferred. It is the largest and most
obvious Arabic treebank, and Arabic *needs* lemmatization far more than German does. The two
alternatives are a ~1,000-sentence treebank and one that ships without word forms and needs a paid
LDC licence to populate.

This is why Arabic is blocked on a licence rather than on code, and why it stays blocked: an
NC-derived Arabic list could be published, but never shipped inside Luraty. See `docs/ROADMAP.md`
item G.

### 2. `UD_German-LIT` is also non-commercial

**CC BY-NC-SA 4.0.** It is the obvious next German treebank if you wanted a literary register, and
adopting it would quietly make `lemmas.tsv` non-commercial. It is catalogued specifically so it gets
rejected on evidence instead of tried and reverted.

Both findings are why `check-sources.mjs` gained a non-commercial arm. The gate previously tested
share-alike only.

### 3. FrequencyWords has two conflicting licence claims

The repository `LICENSE` is plain MIT (fetched 2026-07-30) — almost certainly covering the generator
code. Secondary sources say the *content* is CC BY-SA 4.0, which would contaminate a CC BY output.

The catalogue records `licence: null`, which means **genuinely unresolved** and is not the same as a
guess. It matters because FrequencyWords is otherwise the cheapest available fix for the German
register gap: 650 KB, already counted.

---

## German — what is available

Registers in use: **news, web**. Missing: any spoken proxy.

| Source | Register | Size | Licence | Take it? |
| --- | --- | --- | --- | --- |
| `deu_news_2024_1M` | news | 218 MB | Leipzig, unread | ✅ ROADMAP F. ⚠️ post-2021 |
| `deu-de_web_2021_1M` | web | 189 MB | Leipzig, unread | ✅ ROADMAP F |
| `deu_mixed-typical_2011_1M` | mixed | 94 MB | Leipzig, unread | ✅ register-balanced *and* pre-AI |
| `deu_wikipedia_2021_1M` | encyclopedic | 197 MB | Leipzig, unread | ➖ a register already over-represented |
| `deu_news_2024_10K` | news | **2 MB** | — | 🔍 cheapest way to check whether an archive ships a licence file |
| FrequencyWords `de_50k.txt` | subtitles | **650 KB** | ⚠️ unresolved | ⭐ the register fix, if the terms allow |
| OPUS OpenSubtitles `de.txt.gz` | subtitles | 454 MB | ⚠️ restricted | ➖ raw form of the above; take only to control the counting |
| Tatoeba `deu_sentences` | spoken-ish | 11 MB | CC BY 4.0 | ⚠️ **tempting and weak** — see below |
| CC-100 `de.txt.xz` | web | **17.1 GB** | unresolved | ❌ 17 GB of a register we have too much of |
| Wikipedia dump | encyclopedic | 7.4 GB | CC BY-SA | ❌ Leipzig ships the same thing at 197 MB, pre-counted |
| `UD_German-LIT` | annotation | small | **CC BY-NC-SA 4.0** | ❌ non-commercial |

⚠️ **On Tatoeba.** Cheap, permissive, conversational in *style*, and `count-text.mjs` already
understands its TSV shape — so it is nearly free to adopt, which is exactly why the weakness needs
stating next to the convenience. Its sentences are **translated and constructed**, not observed. The
frequencies describe what learners are taught, not what speakers say. It does not substitute for a
spoken register.

## Arabic — what is available

Registers in use: **news, encyclopedic** (all MSA). Missing: any dialectal or spoken source, and a
usable lemma source.

| Source | Register | Size | Licence | Take it? |
| --- | --- | --- | --- | --- |
| `ara_news_2020_1M` | news / MSA | — | Leipzig, unread | ✅ already downloaded; the pre-2022 one |
| `ara_news_2022_1M` | news / MSA | 363 MB | Leipzig, unread | ⚠️ already downloaded; post-2021 |
| `ara_wikipedia_2021_1M` | encyclopedic / MSA | — | Leipzig + ⚠️ Wikipedia CC BY-SA underneath | ⚠️ two licences in play |
| FrequencyWords `ar_50k.txt` | subtitles / **dialect** | 806 KB | ⚠️ unresolved | ⭐ this is the dialect list |
| OPUS OpenSubtitles `ar.txt.gz` | subtitles / dialect | 966 MB | ⚠️ restricted | ➖ raw form of the above |
| `UD_Arabic-PADT` | annotation | small | **CC BY-NC-SA 3.0** | ❌ non-commercial |
| `UD_Arabic-PUD` | annotation | tiny | CC BY-SA 3.0 | ⚠️ clean but ~1,000 sentences |
| `UD_Arabic-NYUAD` | annotation | — | CC BY-SA 4.0 | ❌ ships without word forms; needs paid LDC PATB |
| CAMeL Tools | analyser | — | MIT (⚠️ databases differ) | 🔍 the most likely route around PADT |
| Tatoeba `ara_sentences` | spoken-ish | 749 KB | CC BY 4.0 | ➖ rounding error against Leipzig |

## Validation baselines — not sources

⚠️ These exist to be **compared against**, never derived from. Correlating against a share-alike list
carries no obligation; deriving from one does. Keep the distinction in the code.

| Source | Covers | Status |
| --- | --- | --- |
| wordfreq | de, ar | MIT, pip-installable, ships a Zipf scale. The pragmatic default. Unmaintained by decision. |
| SUBTLEX-DE | de | Gold standard. ⚠️ **Location unresolved** — `crr.ugent.be/subtlex-de/` and `crr.ugent.be/programs-data/subtitle-frequencies` both 404'd on 2026-07-30. |
| Worldlex | de, ar | Both in its 66. One uniform pipeline across all of them, so cross-language comparison is controlled. Terms unresolved. |
| TUBELEX | neither | ⚠️ Covers zh/en/id/ja/es only. A **method** to copy, not a source to take — its `count`/`videos`/`channels` shape is ROADMAP item B. |

## Adding a source

1. `make candidates L=<lang>` — see what would close a register gap, and what it costs.
2. Read the upstream terms. Actually read them; that is the work.
3. Add or update the entry in `catalog/corpora.json`, with the licence and a probed URL.
4. Add the source to `languages/<lang>/sources.json` with `catalogId`, `register`, `snapshotYear`,
   and `licenceVerified` set honestly.
5. `make check` — it will reject a licence that disagrees with the catalogue, in either direction.

⚠️ Step 4's `licenceVerified: true` is a person taking responsibility, not a formality. The gate
exists because prose caveats failed: `languages/de/SOURCES.md` said *"Confirm the current terms
before shipping"* and nobody did.
