"""The packs' dependency boundary: data plus the engine, nothing else."""

import ast
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
BANNED_FRAMEWORKS = {"fastapi", "flask", "django", "starlette", "sqlalchemy", "supabase", "requests", "httpx"}


def imports_of(package):
    for path in (SRC / package).rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    yield path, alias.name.split(".")[0]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                yield path, node.module.split(".")[0]


def test_packs_import_only_the_stdlib_and_the_engine():
    for path, top in imports_of("luraty_packs"):
        assert top in sys.stdlib_module_names or top in {"luraty_engine", "luraty_packs"}, (path, top)


def test_packs_declare_no_framework_or_database_dependency():
    for path, top in imports_of("luraty_packs"):
        assert top not in BANNED_FRAMEWORKS, path
