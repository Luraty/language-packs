"""Download text from a Hugging Face dataset into a plain .txt file."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable, Iterator

# Column names that usually hold the document body, most specific first.
_TEXT_COLUMN_CANDIDATES = (
    "text",
    "content",
    "raw_content",
    "document",
    "body",
    "sentence",
    "sentence1",
    "article",
    "story",
    "review",
    "question",
)


def _require_datasets():
    try:
        import datasets  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - depends on the environment
        raise ImportError(
            "The 'datasets' package is required. Install it with: uv add datasets"
        ) from exc
    return datasets


def _pick_text_column(record: dict[str, Any]) -> str:
    """Guess which field holds the text, given one example record."""
    for name in _TEXT_COLUMN_CANDIDATES:
        if isinstance(record.get(name), str):
            return name

    for name, value in record.items():
        if isinstance(value, str):
            return name

    raise ValueError(
        f"No string column found in record with keys {sorted(record)}. "
        "Pass text_column= explicitly."
    )


def _iter_text(
    rows: Iterable[dict[str, Any]],
    text_column: str | None,
    limit: int | None,
) -> Iterator[str]:
    column = text_column
    for index, record in enumerate(rows):
        if limit is not None and index >= limit:
            return

        if column is None:
            column = _pick_text_column(record)

        value = record.get(column)
        if isinstance(value, str) and value.strip():
            yield value.strip()


def download_dataset(
    repo_id: str,
    out_path: str | Path | None = None,
    *,
    config: str | None = None,
    split: str = "train",
    text_column: str | None = None,
    limit: int | None = None,
    streaming: bool = True,
    separator: str = "\n\n",
    token: str | None = None,
) -> Path:
    """Download a Hugging Face dataset split and write its text to a .txt file.

    Args:
        repo_id: Dataset id on the Hub, e.g. ``"wikimedia/wikipedia"``.
        out_path: Destination file. Defaults to ``data/huggingface/<repo>_<split>.txt``.
        config: Dataset config / subset name, e.g. ``"20231101.de"``.
        split: Split to read, e.g. ``"train"`` or ``"train[:1000]"``.
            Slice syntax only works with ``streaming=False``; use ``limit`` otherwise.
        text_column: Field holding the text. Auto-detected from the first record
            if omitted.
        limit: Stop after this many records. Recommended for large datasets.
        streaming: Stream rather than downloading the whole dataset to disk cache.
        separator: Written between records.
        token: Hub token for gated or private datasets.

    Returns:
        The path the text was written to.
    """
    datasets = _require_datasets()

    slug = repo_id.replace("/", "__")
    suffix = f"_{config}" if config else ""
    path = (
        Path(out_path)
        if out_path
        else Path("data") / "huggingface" / f"{slug}{suffix}_{split}.txt"
    )

    dataset = datasets.load_dataset(
        repo_id,
        config,
        split=split,
        streaming=streaming,
        token=token,
    )

    path.parent.mkdir(parents=True, exist_ok=True)

    written = 0
    with path.open("w", encoding="utf-8") as handle:
        for chunk in _iter_text(dataset, text_column, limit):
            if written:
                handle.write(separator)
            handle.write(chunk)
            written += 1

    if written == 0:
        raise RuntimeError(
            f"No text extracted from {repo_id} (config={config}, split={split}). "
            "Check text_column."
        )

    return path


def list_configs(repo_id: str, token: str | None = None) -> list[str]:
    """Return the available config / subset names for a dataset."""
    datasets = _require_datasets()
    return list(datasets.get_dataset_config_names(repo_id, token=token))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo_id", help="dataset id on the Hub, e.g. wikimedia/wikipedia")
    parser.add_argument("-o", "--out", default=None, help="output .txt path")
    parser.add_argument("-c", "--config", default=None, help="config / subset name")
    parser.add_argument("-s", "--split", default="train")
    parser.add_argument("--text-column", default=None)
    parser.add_argument("-n", "--limit", type=int, default=None, help="max records")
    parser.add_argument(
        "--list-configs",
        action="store_true",
        help="print available configs and exit",
    )
    args = parser.parse_args()

    if args.list_configs:
        for name in list_configs(args.repo_id):
            print(name)
        raise SystemExit(0)

    written_path = download_dataset(
        args.repo_id,
        args.out,
        config=args.config,
        split=args.split,
        text_column=args.text_column,
        limit=args.limit,
    )
    print(f"Wrote {written_path} ({written_path.stat().st_size} bytes)")
