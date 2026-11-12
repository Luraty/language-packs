"""Dataclass results, as the JSON-shaped objects the TypeScript engine returns."""

import dataclasses
from types import MappingProxyType


def camel(name):
    head, *rest = name.split("_")
    return head + "".join(p.capitalize() for p in rest)


def to_js(x):
    if dataclasses.is_dataclass(x) and not isinstance(x, type):
        out = {}
        for f in dataclasses.fields(x):
            value = getattr(x, f.name)
            if value is not None:
                out[camel(f.name)] = to_js(value)
        return out
    if isinstance(x, (list, tuple)):
        return [to_js(i) for i in x]
    if isinstance(x, (dict, MappingProxyType)):
        return {k: to_js(v) for k, v in x.items()}
    return x
