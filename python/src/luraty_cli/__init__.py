r"""The engine as a process, for hosts that are not Python.

TypeScript code (the prototype) talks to the engine through this instead of the deprecated
`@luraty/engine` package. The protocol is JSON over stdin/stdout:

    {"id": 1, "op": "plan", "args": {...}}                     ← one request
    {"id": 1, "ok": true, "value": {...}}                      → its response
    {"id": 1, "ok": false, "error": {"kind": "...", "message": "..."}}

Run `luraty-engine` to answer one request read from stdin, or `luraty-engine --serve` to answer one
request per line until stdin closes.

Profiles cross the boundary as their serialized string (`serialize` / `deserialize`), so the wire
format is the one the server already stores. Every other value is JSON with camelCase keys.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Callable, Mapping
from dataclasses import fields, is_dataclass
from typing import Any, Final

from luraty_engine import (
    ENGINE_API_VERSION,
    PROFILE_SCHEMA_VERSION,
    Claim,
    CoverageQuery,
    Evidence,
    Exposure,
    Help,
    LanguagePack,
    PlanOptions,
    Profile,
    Retrieval,
    ScopeAll,
    ScopeSkill,
    SummaryScope,
    UnitKey,
    Variety,
    advance_to,
    coverage,
    create_profile,
    deserialize,
    instant,
    is_known,
    is_modality,
    is_unit_key,
    plan,
    record,
    retrievability,
    serialize,
    summarize,
    unit_state,
    variety,
    words_in,
)

RATINGS: Final = ("again", "hard", "good", "easy")


class RequestError(Exception):
    """A request the engine cannot answer. Reported to the caller, never raised past `handle`."""


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.capitalize() for part in rest)


def to_json(value: Any) -> Any:
    """Engine values as JSON: dataclasses become camelCase objects, tuples become lists."""
    if is_dataclass(value) and not isinstance(value, type):
        return {_camel(f.name): to_json(getattr(value, f.name)) for f in fields(value)}
    if isinstance(value, Mapping):
        return {str(key): to_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_json(item) for item in value]
    return value


def _require(args: Mapping[str, Any], name: str) -> Any:
    if name not in args:
        raise RequestError(f"missing argument: {name}")
    return args[name]


def _instant(value: object, name: str) -> Any:
    at = instant(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None
    if at is None:
        raise RequestError(f"{name} must be a whole number of seconds since the Unix epoch, at least 1")
    return at


def _unit(value: object) -> UnitKey:
    if not isinstance(value, str) or not is_unit_key(value):
        raise RequestError(f"not a unit key: {value!r}")
    return UnitKey(value)


def _variety(value: object) -> Variety:
    parsed = variety(value) if isinstance(value, str) else None
    if parsed is None:
        raise RequestError(f"not a variety: {value!r}")
    return parsed


def _profile(args: Mapping[str, Any]) -> Profile:
    decoded = deserialize(_require(args, "profile"))
    if not decoded.ok:
        raise RequestError(f"{decoded.error.kind}: {decoded.error.message}")
    return decoded.value


def _evidence(item: object) -> Evidence:
    if not isinstance(item, Mapping):
        raise RequestError("evidence must be an object")
    kind = item.get("kind")
    unit = _unit(item.get("unit"))
    at = _instant(item.get("at"), "evidence.at")
    match kind:
        case "retrieval":
            rating = item.get("rating")
            if rating not in RATINGS:
                raise RequestError(f"rating must be one of {', '.join(RATINGS)}")
            return Retrieval(unit=unit, rating=rating, at=at)
        case "exposure":
            return Exposure(unit=unit, at=at)
        case "help":
            return Help(unit=unit, at=at)
        case "claim":
            return Claim(unit=unit, at=at)
        case _:
            raise RequestError(f"unknown evidence kind: {kind!r}")


def _pack(name: object) -> LanguagePack:
    match name:
        case "ar":
            from luraty_packs.ar import msa

            return msa
        case "ar-x-quran":
            from luraty_packs.ar_x_quran import ar_quran

            return ar_quran
        case _:
            raise RequestError(f"unknown pack: {name!r} (known: ar, ar-x-quran)")


def _scope(value: object) -> SummaryScope:
    if value is None:
        return ScopeAll()
    if isinstance(value, Mapping) and value.get("kind") == "all":
        return ScopeAll()
    if isinstance(value, Mapping) and value.get("kind") == "skill":
        modality = value.get("modality")
        if not isinstance(modality, str) or not is_modality(modality):
            raise RequestError(f"not a modality: {modality!r}")
        return ScopeSkill(variety=_variety(value.get("variety")), modality=modality)
    raise RequestError("scope must be {kind: 'all'} or {kind: 'skill', variety, modality}")


def _optional_number(options: Mapping[str, Any], name: str) -> Any:
    value = options.get(name)
    if value is not None and (not isinstance(value, (int, float)) or isinstance(value, bool)):
        raise RequestError(f"{name} must be a number")
    return value


def _op_version(args: Mapping[str, Any]) -> Any:
    return {"engine": ENGINE_API_VERSION, "profileSchema": PROFILE_SCHEMA_VERSION}


def _op_create_profile(args: Mapping[str, Any]) -> Any:
    language = _require(args, "language")
    if not isinstance(language, str) or len(language) == 0:
        raise RequestError("language must be a non-empty string")
    return serialize(create_profile(language, _instant(_require(args, "start"), "start")))


def _op_record(args: Mapping[str, Any]) -> Any:
    evidence = _require(args, "evidence")
    if not isinstance(evidence, list):
        raise RequestError("evidence must be a list")
    return serialize(record(_profile(args), [_evidence(item) for item in evidence]))


def _op_advance_to(args: Mapping[str, Any]) -> Any:
    return serialize(advance_to(_profile(args), _instant(_require(args, "now"), "now")))


def _op_plan(args: Mapping[str, Any]) -> Any:
    options = _require(args, "options")
    if not isinstance(options, Mapping):
        raise RequestError("options must be an object")
    priority = options.get("priority")
    if priority is not None and not isinstance(priority, list):
        raise RequestError("priority must be a list of unit keys")
    max_items = _optional_number(options, "maxItems")
    if max_items is None:
        raise RequestError("missing argument: options.maxItems")
    session = plan(
        _profile(args),
        PlanOptions(
            now=_instant(options.get("now"), "options.now"),
            max_items=max_items,
            max_new=_optional_number(options, "maxNew"),
            learn_ahead_seconds=_optional_number(options, "learnAheadSeconds"),
            study_ahead=bool(options.get("studyAhead", False)),
            priority=None if priority is None else [_unit(unit) for unit in priority],
        ),
    )
    return to_json(session)


def _op_summarize(args: Mapping[str, Any]) -> Any:
    return to_json(summarize(_profile(args), _scope(args.get("scope"))))


def _op_unit_state(args: Mapping[str, Any]) -> Any:
    state = unit_state(_profile(args), _unit(_require(args, "unit")))
    return {**to_json(state), "known": is_known(state)}


def _op_retrievability(args: Mapping[str, Any]) -> Any:
    state = unit_state(_profile(args), _unit(_require(args, "unit")))
    return retrievability(state, _instant(_require(args, "now"), "now"))


def _op_coverage(args: Mapping[str, Any]) -> Any:
    pack = _pack(_require(args, "pack"))
    direction = _require(args, "direction")
    if direction not in ("recognise", "produce"):
        raise RequestError("direction must be recognise or produce")
    ignore = args.get("ignore")
    if ignore is not None and not isinstance(ignore, list):
        raise RequestError("ignore must be a list of strings")
    query = CoverageQuery(
        text=_text(args),
        variety=_variety(args["variety"]) if "variety" in args else pack.id,
        direction=direction,
        ignore=ignore,
    )
    return to_json(coverage(_profile(args), pack, query))


def _text(args: Mapping[str, Any]) -> str:
    text = _require(args, "text")
    if not isinstance(text, str):
        raise RequestError("text must be a string")
    return text


def _op_split(args: Mapping[str, Any]) -> Any:
    return list(_pack(_require(args, "pack")).split(_text(args)))


def _op_key(args: Mapping[str, Any]) -> Any:
    return _pack(_require(args, "pack")).key(_text(args))


def _op_candidates(args: Mapping[str, Any]) -> Any:
    return list(_pack(_require(args, "pack")).candidates(_text(args)))


def _op_words_in(args: Mapping[str, Any]) -> Any:
    return list(words_in(_pack(_require(args, "pack")), _text(args)))


OPERATIONS: Final[dict[str, Callable[[Mapping[str, Any]], Any]]] = {
    "version": _op_version,
    "createProfile": _op_create_profile,
    "record": _op_record,
    "advanceTo": _op_advance_to,
    "plan": _op_plan,
    "summarize": _op_summarize,
    "unitState": _op_unit_state,
    "retrievability": _op_retrievability,
    "coverage": _op_coverage,
    "split": _op_split,
    "key": _op_key,
    "candidates": _op_candidates,
    "wordsIn": _op_words_in,
}


def handle(request: object) -> dict[str, Any]:
    """Answer one request. Never raises: every failure becomes an `ok: false` response."""
    request_id = request.get("id") if isinstance(request, Mapping) else None
    try:
        if not isinstance(request, Mapping):
            raise RequestError("a request must be an object")
        op = request.get("op")
        operation = OPERATIONS.get(op) if isinstance(op, str) else None
        if operation is None:
            raise RequestError(f"unknown op: {op!r}")
        args = request.get("args", {})
        if not isinstance(args, Mapping):
            raise RequestError("args must be an object")
        return {"id": request_id, "ok": True, "value": operation(args)}
    except RequestError as error:
        return {"id": request_id, "ok": False, "error": {"kind": "bad-request", "message": str(error)}}
    except Exception as error:  # noqa: BLE001 — the process must survive a bug in one request
        return {
            "id": request_id,
            "ok": False,
            "error": {"kind": "internal", "message": f"{type(error).__name__}: {error}"},
        }


def _answer(line: str) -> str:
    try:
        request = json.loads(line)
    except json.JSONDecodeError as error:
        response = {"id": None, "ok": False, "error": {"kind": "not-json", "message": str(error)}}
    else:
        response = handle(request)
    return json.dumps(response, ensure_ascii=False, separators=(",", ":"))


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if args == ["--serve"]:
        for line in sys.stdin:
            if line.strip():
                sys.stdout.write(_answer(line) + "\n")
                sys.stdout.flush()
        return 0
    if args:
        sys.stderr.write("usage: luraty-engine [--serve]\n")
        return 2
    sys.stdout.write(_answer(sys.stdin.read()) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
