r"""An offline Arabic→English dictionary, keyed by `@luraty/pack-ar`.

```ts
import { msa } from '@luraty/pack-ar';
const { lookup } = await import('@luraty/dict-ar-en'); // lazily, when the reader opens

lookup(msa.key('وَالكِتَابِ')); // [{ source: 'wiktionary-en', senses: [… 'book' …], pos: ['noun'] }]
```

⚠️ **`lookup` TAKES A KEY, NOT A WORD.** It does no normalizing, stripping or lemmatizing of its
own: the dictionary was re-keyed at build time against `@luraty/pack-ar`'s `key()`, and a second
normalizer here would be a second answer to "which word is this" that could drift from the pack's.
Pass `pack.key(surface)` — or each of `pack.candidates(surface)` when a spelling is ambiguous.

⚠️ **EVERY SENSE IS MACHINE-EXTRACTED AND NOBODY HAS REVIEWED IT.** Attribute each meaning to its
`source`; `sources` carries the name, licence and URL a UI needs to do that. Wiktionary-derived
data is CC BY-SA 4.0 — see ATTRIBUTION.md before redistributing it.

⚠️ **NO RUNTIME DEPENDENCY ON THE ENGINE OR THE PACK.** A host that never opens the reader never
loads this package; one that does pays for one string and a Map built on the first lookup.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Final, Literal

from luraty_packs._loader import read_json

__all__ = [
    "Coverage",
    "CoverageCounts",
    "Meaning",
    "Source",
    "SourceCoverage",
    "SourceId",
    "coverage",
    "lookup",
    "sources",
]

# A dictionary this package draws on. One today; `lookup` returns a list of per-source meanings so a
# second source is a widened union, not a changed return shape.
SourceId = Literal["wiktionary-en"]


@dataclass(frozen=True, slots=True)
class Meaning:
    """What one source says about one key."""

    source: SourceId
    # At most five, each trimmed; a cut is marked with `…`. Never empty.
    senses: tuple[str, ...]
    # Parts of speech as the source labels them (`noun`, `verb`, `prep` …). Absent when it gives none.
    pos: tuple[str, ...] | None = None


@dataclass(frozen=True, slots=True)
class Source:
    """Attribution metadata for one source."""

    id: SourceId
    name: str
    # SPDX identifier.
    licence: str
    url: str
    # How the data reached this package, as recorded on the build artifact.
    provenance: str
    # ISO date the artifact was extracted.
    built: str


@dataclass(frozen=True, slots=True)
class SourceCoverage:
    entries: int
    senses: int
    vocabulary: int
    top: int


@dataclass(frozen=True, slots=True)
class CoverageCounts:
    vocabulary: int
    top: int


@dataclass(frozen=True, slots=True)
class Coverage:
    """Counts measured at build time against the pack named in `pack`."""

    # The exact package version the keys were joined against.
    pack: str
    # Size of that pack's frequency vocabulary.
    vocabulary: int
    # Size of the "commonest words" band reported in `top`.
    top: int
    # Distinct keys with at least one meaning.
    keys: int
    sources: Mapping[SourceId, SourceCoverage]
    # Vocabulary words with a meaning from at least one source.
    any: CoverageCounts


_NONE: Final[tuple[Meaning, ...]] = ()

_table: dict[str, tuple[Meaning, ...]] | None = None
_document: Final[dict[str, Any]] = read_json("dict-ar-en", "dictionary.json")

# The sources, in display order.
sources: Final[tuple[Source, ...]] = tuple(Source(**s) for s in _document["sources"])

# How much of `@luraty/pack-ar`'s vocabulary has a meaning, per source and overall.
coverage: Final[Coverage] = Coverage(
    pack=_document["coverage"]["pack"],
    vocabulary=_document["coverage"]["vocabulary"],
    top=_document["coverage"]["top"],
    keys=_document["coverage"]["keys"],
    sources=MappingProxyType(
        {k: SourceCoverage(**v) for k, v in _document["coverage"]["sources"].items()}
    ),
    any=CoverageCounts(**_document["coverage"]["any"]),
)


def _load() -> dict[str, tuple[Meaning, ...]]:
    # Parsed on the first lookup, not at import.
    #
    # ⚠️ A MAP, NOT AN OBJECT: `'constructor' in {}` is true, so an object would answer a lookup of
    # `constructor` or `__proto__` with something that is not a meaning. It also keeps clear of Hermes'
    # 196,607-property ceiling, which `@luraty/pack-ar` documents.
    return {
        key: tuple(
            Meaning(
                source=meaning["source"],
                senses=tuple(meaning["senses"]),
                pos=tuple(meaning["pos"]) if "pos" in meaning else None,
            )
            for meaning in meanings
        )
        for key, meanings in _document["entries"]
    }


def lookup(key: str) -> tuple[Meaning, ...]:
    r"""Every meaning recorded for a `@luraty/pack-ar` key, one entry per source in `sources` order. `[]`
    when there is none.
    """
    global _table
    if _table is None:
        _table = _load()
    return _table.get(key, _NONE)
