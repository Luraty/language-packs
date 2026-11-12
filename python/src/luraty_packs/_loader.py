"""Reading a pack's plain data files, which ship inside this package."""

from __future__ import annotations

import json
from collections import OrderedDict
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Final

from luraty_engine import LanguagePack, create_pack
from luraty_engine._js import trim

DATA_ROOT: Final = Path(__file__).resolve().parent / "data"


def read_text(pack_dir: str, name: str) -> str:
    # bytes-then-decode: text mode would translate newlines, which reading as UTF-8 in Node does not.
    return (DATA_ROOT / pack_dir / name).read_bytes().decode("utf-8")


def read_trimmed(pack_dir: str, name: str) -> str:
    return trim(read_text(pack_dir, name))


def read_json(pack_dir: str, name: str) -> Any:
    return json.loads(read_text(pack_dir, name))


def parse_lemmas(rows: str) -> OrderedDict[str, str | Sequence[str]]:
    # The lemma table, parsed once at module load.
    out: OrderedDict[str, str | Sequence[str]] = OrderedDict()
    for line in rows.split("\n"):
        # ⚠️ **EVERY TAB, NOT THE FIRST ONE — AND TAKING EVERYTHING AFTER THE FIRST TAB WAS A SILENT
        # CORRUPTION WAITING FOR THE DATA TO ARRIVE.** This used to be `line.slice(tab + 1)`, so the
        # moment a row grew a second reading (Luraty/luraty#177, ADR-0028) the lemma became the literal
        # string `"كتب\tكتاب"` — one unit key containing a tab, addressing a word that does not exist,
        # and nothing would have thrown. The pack would have built, reported healthy, and filed every
        # ambiguous word under a nonsense address.
        #
        # ⚠️ A ONE-LEMMA ROW STAYS A BARE STRING rather than becoming a one-element array. Both are
        # legal `PackData.lemmas` values and `create_pack` treats them identically, but 81,818 of the
        # 86,910 Arabic rows have exactly one reading and an array apiece is 81,818 allocations on the
        # cold-start path for no information.
        parts = line.split("\t")
        form = parts[0]
        if len(form) == 0 or len(parts) < 2:
            continue
        readings = [r for r in parts[1:] if len(r) > 0]
        if len(readings) == 0:
            continue
        out[form] = readings[0] if len(readings) == 1 else tuple(readings)
    return out


def build(pack_dir: str, package: str, frequency: str) -> LanguagePack:
    built = create_pack(
        read_json(pack_dir, "pack.config.json"),
        {"frequency": frequency, "lemmas": parse_lemmas(read_trimmed(pack_dir, "lemmas.tsv"))},
    )
    # ⚠️ **THIS THROWS AT MODULE LOAD IF THE PACK IS BROKEN, AND THAT IS THE DELIBERATE CHOICE**, the
    # same one `@luraty/pack-de` makes. The alternative is exporting a `Decoded<LanguagePack>` and making
    # every host unwrap a failure that cannot happen — the data is frozen in this package and
    # `index.test.ts` asserts it builds and passes `check_pack` before anything ships.
    if not built.ok:
        raise RuntimeError(f"{package} is corrupt: {built.error.message}")
    return built.value
