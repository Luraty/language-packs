# Attribution and licensing — `packs/ar`

This pack is **derived data**. Two upstream sources, two different licences, attaching to different
files. Read this before shipping the pack in anything.

⚠️ **THIS FILE DID NOT EXIST UNTIL 2026-08-04, AND THE PACK WAS ALREADY BUNDLED IN THE APP.**
`frequency.txt` is built from Leipzig newswire, Leipzig is CC BY, and CC BY's one obligation is
attribution — so the pack shipped without the only thing its licence actually asks for. Found while
recording the licence confirmation, not by any check; `scripts/check-packs.mjs` now fails a pack that
has a `frequency.txt` and no `ATTRIBUTION.md`, because a missing file is invisible by nature.

## `frequency.txt` — Leipzig Corpora Collection

10,000 lemma rows, built from word-frequency counts in:

- `ara_news_2020_1M` — Arabic news, 2020
- `ara_news_2022_1M` — Arabic news, 2022

> Leipzig Corpora Collection, Universität Leipzig.
> <https://wortschatz-leipzig.de/>
> D. Goldhahn, T. Eckart & U. Quasthoff: *Building Large Monolingual Dictionaries at the Leipzig
> Corpora Collection: From 100 to 200 Languages.* LREC 2012.

**Licence: CC BY 4.0.** Attribution required; **no non-commercial restriction**.

✅ **Confirmed in writing by Wortschatz Leipzig on 2026-08-04** — not inferred from a webpage — in reply
to a question naming these corpora specifically and the intended commercial use. The question is in
[`leipzig-licence-email.md`](../../leipzig-licence-email.md); the reply is kept on file by the project.

⚠️ **`wortschatz-leipzig.de/de/download/` IS NOT `repo.data.saw-leipzig.de`.** They are different
corpus sets under different licences, and the repository site is CC BY-**NC** — unusable in a paid
product. The archives themselves carry no licence file, so nothing downstream of a download can tell
you which one you took. Download from the portal.

## `lemmas.tsv` — Wikidata

Surface forms lemmatized against Wikidata lexemes.

> Wikidata. <https://www.wikidata.org/>

**Licence: CC0.** Public domain dedication; no attribution obligation. Named here anyway, because
"where did this table come from" is a question somebody will ask.

## What is NOT redistributed

No sentence, no source text, no corpus excerpt. `frequency.txt` is word forms and derived ranks;
`sample.txt` is running text used for the calibration screen and is **not** from Leipzig — check its
own provenance before treating it as covered by anything here.

## Related

- `packs/ar-x-quran` is a **different** pack from a **different** source. Its frequency list is
  derived from the Qur'anic corpus and nothing on this page applies to it.
- `packs/de/ATTRIBUTION.md` covers the German pack, whose lemma table is CC BY-**SA** — share-alike,
  a stronger obligation than anything here.
