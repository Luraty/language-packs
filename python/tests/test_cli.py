"""`luraty_cli`: the engine over JSON, for TypeScript hosts."""

import json
import subprocess
import sys

import pytest

from luraty_cli import handle
from luraty_engine import ENGINE_API_VERSION, PROFILE_SCHEMA_VERSION

T0 = 1_800_000_000
WORD = "recognise:ar:كتاب"


def ok(op, **args):
    response = handle({"id": 7, "op": op, "args": args})
    assert response["ok"], response
    assert response["id"] == 7
    return response["value"]


def fails(op, **args):
    response = handle({"id": 7, "op": op, "args": args})
    assert not response["ok"]
    return response["error"]


def test_reports_its_version():
    assert ok("version") == {"engine": ENGINE_API_VERSION, "profileSchema": PROFILE_SCHEMA_VERSION}


def test_a_full_loop_in_camel_case():
    profile = ok("createProfile", language="ar", start=T0)
    profile = ok("record", profile=profile, evidence=[{"kind": "exposure", "unit": WORD, "at": T0}])
    session = ok("plan", profile=profile, options={"now": T0, "maxItems": 5})
    assert session["items"] == [{"unit": WORD, "why": "new", "due": 0, "retrievability": 0.0}]
    assert set(session["content"]) == {"units", "minPassageTokens", "newUnitsWanted"}

    profile = ok("record", profile=profile, evidence=[{"kind": "retrieval", "unit": WORD, "rating": "easy", "at": T0}])
    state = ok("unitState", profile=profile, unit=WORD)
    assert state["card"] == "review"
    assert state["known"] is True
    assert state["prior"] == {"kind": "none"}

    summary = ok("summarize", profile=profile)
    assert summary["known"] == 1
    assert summary["scope"] == {"kind": "all"}
    assert 0.9 < ok("retrievability", profile=profile, unit=WORD, now=T0 + 86_400) <= 1


def test_runs_coverage_and_pack_operations():
    profile = ok("createProfile", language="ar", start=T0)
    assert ok("key", pack="ar", text="والكتاب") == "كتاب"
    assert ok("split", pack="ar", text="ذهبت إلى السوق") == ["ذهبت", "إلى", "السوق"]
    assert ok("coverage", profile=profile, pack="ar", text="", direction="recognise")["kind"] == "no-words"


@pytest.mark.parametrize(
    ("op", "args"),
    [
        ("nope", {}),
        ("createProfile", {"language": "ar", "start": 0}),
        ("record", {"profile": "{}", "evidence": []}),
        ("record", {"profile": None, "evidence": []}),
        ("plan", {"profile": "x", "options": {"now": T0}}),
        ("coverage", {"profile": "x", "pack": "fr", "text": "", "direction": "recognise"}),
    ],
)
def test_turns_bad_requests_into_errors(op, args):
    assert fails(op, **args)["kind"] in {"bad-request", "internal"}


def test_rejects_a_bad_rating():
    profile = ok("createProfile", language="ar", start=T0)
    error = fails("record", profile=profile, evidence=[{"kind": "retrieval", "unit": WORD, "rating": "great", "at": T0}])
    assert error == {"kind": "bad-request", "message": "rating must be one of again, hard, good, easy"}


def test_serves_json_lines_over_a_process():
    requests = [{"id": 1, "op": "version"}, "not json", {"id": 2, "op": "key", "args": {"pack": "ar", "text": "والكتاب"}}]
    lines = "\n".join(r if isinstance(r, str) else json.dumps(r) for r in requests) + "\n"
    result = subprocess.run(
        [sys.executable, "-m", "luraty_cli", "--serve"], input=lines, capture_output=True, text=True, check=True
    )
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    assert [r["ok"] for r in responses] == [True, False, True]
    assert responses[1]["error"]["kind"] == "not-json"
    assert responses[2]["value"] == "كتاب"
