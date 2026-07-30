"""Download public-domain books from Project Gutenberg as plain text."""

from __future__ import annotations

import re
import urllib.error
import urllib.request
from pathlib import Path

# Project Gutenberg serves the same book from several locations depending on
# how old the ebook is and whether a UTF-8 copy was generated. Try in order.
_MIRRORS = (
    "https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt",
    "https://www.gutenberg.org/ebooks/{id}.txt.utf-8",
    "https://www.gutenberg.org/files/{id}/{id}-0.txt",
    "https://www.gutenberg.org/files/{id}/{id}.txt",
)

# The site rejects the default urllib user-agent.
_USER_AGENT = "luraty-language-packs/0.1 (+https://github.com/younissk/luraty-language-packs)"

_START_MARKER = re.compile(
    r"^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*\s*$",
    re.IGNORECASE | re.MULTILINE,
)
_END_MARKER = re.compile(
    r"^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def strip_gutenberg_boilerplate(text: str) -> str:
    """Return only the book body, without the Gutenberg licence header/footer.

    If either marker is missing the corresponding end of the text is kept as-is,
    which is safer than guessing at a line offset.
    """
    start = _START_MARKER.search(text)
    if start:
        text = text[start.end() :]

    end = _END_MARKER.search(text)
    if end:
        text = text[: end.start()]

    return text.strip() + "\n"


def _fetch(url: str, timeout: float) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()

    charset = response.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def download_book(
    book_id: int,
    out_path: str | Path | None = None,
    *,
    strip_boilerplate: bool = True,
    timeout: float = 30.0,
    overwrite: bool = True,
) -> Path:
    """Download Project Gutenberg book ``book_id`` and write it to a .txt file.

    Args:
        book_id: The numeric ebook id, e.g. 1342 for Pride and Prejudice.
        out_path: Destination file. Defaults to ``data/gutenberg/<id>.txt``.
        strip_boilerplate: Drop the Gutenberg licence header and footer.
        timeout: Per-request timeout in seconds.
        overwrite: If False and the file already exists, skip the download.

    Returns:
        The path the text was written to.

    Raises:
        RuntimeError: If no mirror returned the book.
    """
    path = Path(out_path) if out_path else Path("data") / "gutenberg" / f"{book_id}.txt"

    if path.exists() and not overwrite:
        return path

    errors: list[str] = []
    text: str | None = None

    for template in _MIRRORS:
        url = template.format(id=book_id)
        try:
            text = _fetch(url, timeout)
            break
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            errors.append(f"{url}: {exc}")

    if text is None:
        raise RuntimeError(
            f"Could not download book {book_id}. Tried:\n  " + "\n  ".join(errors)
        )

    if strip_boilerplate:
        text = strip_gutenberg_boilerplate(text)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book_id", type=int, help="Project Gutenberg ebook id")
    parser.add_argument("-o", "--out", default=None, help="output .txt path")
    parser.add_argument(
        "--keep-boilerplate",
        action="store_true",
        help="keep the Gutenberg licence header and footer",
    )
    args = parser.parse_args()

    written = download_book(
        args.book_id,
        args.out,
        strip_boilerplate=not args.keep_boilerplate,
    )
    print(f"Wrote {written} ({written.stat().st_size} bytes)")
