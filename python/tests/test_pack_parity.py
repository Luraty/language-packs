"""Asserts the Arabic packs and the dictionary equal fixtures generated from the TypeScript packages.

The engine itself is checked against its own fixtures in Luraty/engine.
"""

import hashlib
import json
from pathlib import Path

import pytest

import luraty_engine as L
from luraty_engine import _js
from luraty_packs import ar, ar_x_quran, dict_ar_en
from support.convert import to_js

PARITY = Path(__file__).parent / "parity"
REAL_PACKS = {"ar": ar.msa, "quran": ar_x_quran.ar_quran}


def load(name):
    return json.loads((PARITY / f"{name}.json").read_text(encoding="utf-8"))


def assert_all(mismatches, total):
    assert total > 0, "vacuous parity check"
    assert not mismatches, f"{len(mismatches)}/{total} mismatches; first: {mismatches[:5]}"


@pytest.mark.parametrize(
    "name,pack,module",
    [("pack_ar", ar.msa, ar), ("pack_ar_x_quran", ar_x_quran.ar_quran, ar_x_quran)],
    ids=["ar", "ar-x-quran"],
)
def test_real_pack(name, pack, module):
    v = load(name)
    assert pack.id == v["id"]
    assert hashlib.sha256(module.frequency.encode()).hexdigest() == v["frequencySha"]
    assert _js.utf16_len(module.frequency) == v["frequencyLength"]
    assert module.sample == v["sample"]
    assert list(module.vocabulary[:100]) == v["vocabularyHead"]
    assert len(module.vocabulary) == v["vocabularyLength"]
    assert hashlib.sha256(_js.json_stringify(module.vocabulary).encode()).hexdigest() == v["vocabularySha"]
    for case in v["selfCheck"]:
        assert to_js(module.self_check(case["t"])) == case["problems"]

    mismatches = []
    for c in v["surfaces"]:
        got = {
            "s": c["s"],
            "key": pack.key(c["s"]),
            "candidates": list(pack.candidates(c["s"])),
            "rank": pack.rank(c["s"]),
            "rankOfKey": pack.rank(pack.key(c["s"])),
        }
        if got != c:
            mismatches.append((got, c))
    for c in v["splits"]:
        if list(pack.split(c["t"])) != c["tokens"]:
            mismatches.append(("split", c["t"][:60]))
    for c in v["compares"]:
        if pack.compare(c["a"], c["b"]) != c["r"]:
            mismatches.append(("compare", c))
    assert_all(mismatches, len(v["surfaces"]) + len(v["splits"]) + len(v["compares"]))


@pytest.mark.parametrize(
    "name,pack,directory",
    [("pack_ar", ar.msa, "ar"), ("pack_ar_x_quran", ar_x_quran.ar_quran, "ar-x-quran")],
    ids=["ar", "ar-x-quran"],
)
def test_real_pack_whole_table_digest(name, pack, directory):
    from luraty_packs._loader import read_trimmed

    v = load(name)
    rows = read_trimmed(directory, "lemmas.tsv").split("\n")
    forms = [r.split("\t")[0] for r in rows]
    readings = [x for r in rows for x in r.split("\t")[1:]]
    freq = _js.split_whitespace(
        ar.frequency if directory == "ar" else ar_x_quran.frequency
    )
    h = hashlib.sha256()
    count = 0
    for s in [*forms, *readings, *freq]:
        count += 1
        rank = pack.rank(pack.key(s))
        h.update(
            f"{s}\t{pack.key(s)}\t{'|'.join(pack.candidates(s))}\t{'' if rank is None else rank}\n".encode()
        )
    assert count == v["allCount"]
    assert h.hexdigest() == v["allDigest"]


def test_dictionary():
    v = load("dictionary")
    assert to_js(dict_ar_en.sources) == v["sources"]
    assert to_js(dict_ar_en.coverage) == v["coverage"]
    mismatches = []
    for c in [*v["hits"], *v["misses"]]:
        if to_js(dict_ar_en.lookup(c["k"])) != c["meanings"]:
            mismatches.append(c["k"])
    assert_all(mismatches, len(v["hits"]) + len(v["misses"]))
    document = json.loads((Path(dict_ar_en.__file__).parent / "data/dict-ar-en/dictionary.json").read_text("utf-8"))
    h = hashlib.sha256()
    for key, _ in document["entries"]:
        h.update(
            (_js.json_stringify([key, json.loads(_js.json_stringify(to_js(dict_ar_en.lookup(key))))]) + "\n").encode()
        )
    assert len(document["entries"]) == v["keyCount"]
    assert h.hexdigest() == v["digest"]


def test_bulk_over_the_real_packs():
    bulks = [c for c in load("session")["bulks"] if c["pack"] in REAL_PACKS]
    mismatches = []
    for c in bulks:
        fn = L.words_in if c["kind"] == "wordsIn" else L.vocabulary_of
        if list(fn(REAL_PACKS[c["pack"]], c["input"])) != c["r"]:
            mismatches.append(c)
    assert_all(mismatches, len(bulks))
