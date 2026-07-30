"""Download Wikipedia article text via the MediaWiki API.

Wikipedia text is licensed CC BY-SA 4.0 — redistributing a corpus built from it
carries attribution and share-alike obligations. Keep the source titles and the
language edition alongside any pack you ship.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# MediaWiki requires a descriptive, contactable User-Agent.
_USER_AGENT = "luraty-language-packs/0.1 (+https://github.com/younissk/luraty-language-packs)"

# prop=extracts allows batching only for intro extracts; full-text extracts are
# capped at one page per request by the API itself.
_INTRO_BATCH_SIZE = 20


def _api_url(lang: str) -> str:
    return f"https://{lang}.wikipedia.org/w/api.php"


def _call(lang: str, params: dict[str, str | int], timeout: float) -> dict:
    query = dict(params)
    query.setdefault("format", "json")
    query.setdefault("formatversion", "2")

    url = f"{_api_url(lang)}?{urllib.parse.urlencode(query)}"
    request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})

    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))

    if "error" in payload:
        raise RuntimeError(f"MediaWiki error: {payload['error']}")

    return payload


def _batch(items: list[str], size: int) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def fetch_articles(
    titles: list[str],
    lang: str = "en",
    *,
    intro_only: bool = False,
    timeout: float = 30.0,
    delay: float = 0.2,
) -> dict[str, str]:
    """Return ``{title: plain text}`` for the given articles.

    Missing pages are skipped silently rather than raising, so a long title list
    survives a few bad entries.
    """
    base: dict[str, str | int] = {
        "action": "query",
        "prop": "extracts",
        "explaintext": 1,
        "redirects": 1,
    }

    if intro_only:
        base["exintro"] = 1
        batches = _batch(titles, _INTRO_BATCH_SIZE)
    else:
        batches = _batch(titles, 1)

    results: dict[str, str] = {}
    for index, group in enumerate(batches):
        if index and delay:
            time.sleep(delay)

        payload = _call(lang, {**base, "titles": "|".join(group)}, timeout)
        for page in payload.get("query", {}).get("pages", []):
            if page.get("missing"):
                continue
            extract = (page.get("extract") or "").strip()
            if extract:
                results[page["title"]] = extract

    return results


def fetch_article(
    title: str,
    lang: str = "en",
    *,
    intro_only: bool = False,
    timeout: float = 30.0,
) -> str:
    """Return the plain text of a single article. Raises if it does not exist."""
    articles = fetch_articles([title], lang, intro_only=intro_only, timeout=timeout)
    if not articles:
        raise RuntimeError(f"No article found for {title!r} on {lang}.wikipedia.org")
    return next(iter(articles.values()))


def random_titles(
    count: int,
    lang: str = "en",
    *,
    timeout: float = 30.0,
    delay: float = 0.2,
) -> list[str]:
    """Return ``count`` random article titles from the main namespace."""
    titles: list[str] = []
    while len(titles) < count:
        payload = _call(
            lang,
            {
                "action": "query",
                "list": "random",
                "rnnamespace": 0,
                "rnlimit": min(500, count - len(titles)),
            },
            timeout,
        )
        titles.extend(item["title"] for item in payload["query"]["random"])
        if delay and len(titles) < count:
            time.sleep(delay)

    return titles[:count]


def category_titles(
    category: str,
    lang: str = "en",
    *,
    limit: int = 100,
    timeout: float = 30.0,
    delay: float = 0.2,
) -> list[str]:
    """Return article titles in a category, following API continuation."""
    if not category.lower().startswith(("category:", "kategorie:")):
        category = f"Category:{category}"

    titles: list[str] = []
    cont: dict[str, str] = {}

    while len(titles) < limit:
        payload = _call(
            lang,
            {
                "action": "query",
                "list": "categorymembers",
                "cmtitle": category,
                "cmnamespace": 0,
                "cmlimit": min(500, limit - len(titles)),
                **cont,
            },
            timeout,
        )
        titles.extend(item["title"] for item in payload["query"]["categorymembers"])

        if "continue" not in payload:
            break
        cont = {k: v for k, v in payload["continue"].items() if k != "continue"}
        if delay:
            time.sleep(delay)

    return titles[:limit]


def download_articles(
    titles: list[str],
    out_path: str | Path | None = None,
    lang: str = "en",
    *,
    intro_only: bool = False,
    include_titles: bool = True,
    separator: str = "\n\n",
    timeout: float = 30.0,
    delay: float = 0.2,
) -> Path:
    """Download articles and write them to one .txt file.

    Args:
        titles: Article titles to fetch.
        out_path: Destination. Defaults to ``data/wikipedia/<lang>.txt``.
        lang: Wikipedia language edition, e.g. ``"de"``.
        intro_only: Fetch only the lead section (much faster, batched 20 per call).
        include_titles: Write each title as a line above its body.
        separator: Written between articles.
        delay: Seconds slept between API calls, to stay polite.

    Returns:
        The path the text was written to.
    """
    path = Path(out_path) if out_path else Path("data") / "wikipedia" / f"{lang}.txt"

    articles = fetch_articles(
        titles, lang, intro_only=intro_only, timeout=timeout, delay=delay
    )
    if not articles:
        raise RuntimeError(f"No articles retrieved from {lang}.wikipedia.org")

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for index, (title, body) in enumerate(articles.items()):
            if index:
                handle.write(separator)
            if include_titles:
                handle.write(f"= {title} =\n\n")
            handle.write(body)
        handle.write("\n")

    return path


def download_article(
    title: str,
    out_path: str | Path | None = None,
    lang: str = "en",
    **kwargs,
) -> Path:
    """Download one article to a .txt file."""
    path = (
        Path(out_path)
        if out_path
        else Path("data") / "wikipedia" / lang / f"{title.replace('/', '_')}.txt"
    )
    return download_articles([title], path, lang, **kwargs)


def download_random(
    count: int,
    out_path: str | Path | None = None,
    lang: str = "en",
    **kwargs,
) -> Path:
    """Download ``count`` random articles to a .txt file."""
    return download_articles(random_titles(count, lang), out_path, lang, **kwargs)


def download_category(
    category: str,
    out_path: str | Path | None = None,
    lang: str = "en",
    *,
    limit: int = 100,
    **kwargs,
) -> Path:
    """Download every article in a category (up to ``limit``) to a .txt file."""
    titles = category_titles(category, lang, limit=limit)
    if not titles:
        raise RuntimeError(f"Category {category!r} is empty on {lang}.wikipedia.org")
    return download_articles(titles, out_path, lang, **kwargs)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Download Wikipedia text.")
    parser.add_argument("-l", "--lang", default="en", help="language edition")
    parser.add_argument("-o", "--out", default=None, help="output .txt path")
    parser.add_argument("--intro-only", action="store_true")

    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("-t", "--title", nargs="+", help="article title(s)")
    source.add_argument("-r", "--random", type=int, help="N random articles")
    source.add_argument("-c", "--category", help="all articles in a category")
    parser.add_argument("--limit", type=int, default=100, help="cap for --category")

    args = parser.parse_args()

    if args.title:
        written = download_articles(
            args.title, args.out, args.lang, intro_only=args.intro_only
        )
    elif args.random:
        written = download_random(
            args.random, args.out, args.lang, intro_only=args.intro_only
        )
    else:
        written = download_category(
            args.category,
            args.out,
            args.lang,
            limit=args.limit,
            intro_only=args.intro_only,
        )

    print(f"Wrote {written} ({written.stat().st_size} bytes)")
