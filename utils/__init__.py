from .gutenberg import download_book, strip_gutenberg_boilerplate
from .huggingface import download_dataset, list_configs
from .wikipedia import (
    category_titles,
    download_article,
    download_articles,
    download_category,
    download_random,
    fetch_article,
    fetch_articles,
    random_titles,
)

__all__ = [
    # Project Gutenberg
    "download_book",
    "strip_gutenberg_boilerplate",
    # Hugging Face
    "download_dataset",
    "list_configs",
    # Wikipedia
    "download_article",
    "download_articles",
    "download_category",
    "download_random",
    "fetch_article",
    "fetch_articles",
    "random_titles",
    "category_titles",
]
