"""The data this package ships is a copy of packs/<name>/, and must stay byte-identical to it."""

from pathlib import Path

import pytest

PACKAGE_DATA = Path(__file__).resolve().parents[1] / "src/luraty_packs/data"
NPM_PACKS = Path(__file__).resolve().parents[2] / "packs"
FILES = ["ATTRIBUTION.md", "frequency.txt", "lemmas.tsv", "pack.config.json", "sample.txt"]


@pytest.mark.parametrize("pack", ["ar", "ar-x-quran"])
@pytest.mark.parametrize("name", FILES)
def test_pack_file_matches_the_npm_pack(pack, name):
    assert (PACKAGE_DATA / pack / name).read_bytes() == (NPM_PACKS / pack / name).read_bytes()


def test_dictionary_attribution_matches_the_npm_pack():
    name = "ATTRIBUTION.md"
    assert (PACKAGE_DATA / "dict-ar-en" / name).read_bytes() == (NPM_PACKS / "dict-ar-en" / name).read_bytes()
