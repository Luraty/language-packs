# luraty-packs (Python)

Python port of the Arabic packs in [`packs/`](../packs/) for the Python
[`luraty-engine`](https://github.com/Luraty/engine/tree/main/python):

- `luraty_packs.ar`: Modern Standard Arabic (`msa`), same data as `@luraty/pack-ar`
- `luraty_packs.ar_x_quran`: Qur'anic Arabic (`ar_quran`), same data as `@luraty/pack-ar-x-quran`
- `luraty_packs.dict_ar_en`: offline Arabic-English dictionary (`lookup`), same data as `@luraty/dict-ar-en`
- `luraty-engine`: a JSON-over-stdin CLI for the engine with these packs built in

```bash
pip install "luraty-packs @ git+https://github.com/Luraty/language-packs@<tag-or-sha>#subdirectory=python"
```

```python
from luraty_packs.ar import msa
from luraty_packs.dict_ar_en import lookup

msa.key("والكتاب")  # "كتاب"
```

## Licences

The code is MIT. The data is not: each pack's `ATTRIBUTION.md` under
`src/luraty_packs/data/` names its sources and licences, and they ship inside the package.

## Develop

```bash
cd python
uv sync
uv run pytest
```

`tests/parity/` holds fixtures generated from the published npm packages, so the port can be
checked against them byte for byte:

```bash
npm ci --prefix scripts        # or `npm install --prefix scripts` the first time
node scripts/generate_parity_vectors.mjs
```

`src/luraty_packs/data/` is a copy of `packs/<name>/`; `tests/test_data_matches_packs.py` fails if
the two drift.
