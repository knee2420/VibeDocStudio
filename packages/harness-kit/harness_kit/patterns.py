"""패턴 측정 — 어떤 글(레퍼런스 · 내 문서 · 칸 · 후보)이든 같은 자로 잰다.

측정값은 장르를 가리지 않는 원시 지표다. 글에서 신호를 찾는 패턴은 언어 어휘(`core:lexicon/<lang>.json`),
어떤 지표가 어느 층위에 속하는지는 층위 레지스트리(`reference:layers.json`)가 정한다.
"""
from __future__ import annotations

import json
import re
from typing import Any, Iterable, Optional

from . import packs
from .text import html_to_text

LEXICON = "core:lexicon/ko.json"
REGISTRY = "reference:layers.json"
_compiled: dict[int, dict[str, Any]] = {}


def registry() -> dict[str, Any]:
    return packs.data(REGISTRY)


def layer_set(name: str = "") -> list[dict[str, Any]]:
    reg = registry()
    return reg["sets"].get(name or reg.get("default", "document")) or reg["sets"][reg.get("default", "document")]


def layer_ids(name: str = "") -> set[str]:
    return {layer["id"] for layer in layer_set(name)}


def _lex() -> dict[str, Any]:
    raw = packs.data(LEXICON)["measure"]
    hit = _compiled.get(id(raw))
    if hit is None:
        hit = {
            "endings": {e["label"]: packs.compile_rx(e) for e in raw["endings"]},
            "emoji": packs.compile_rx(raw["emoji"]), "number": packs.compile_rx(raw["number"]),
            "meta": {k: packs.compile_rx(v) for k, v in raw["meta"].items()},
            "callout": packs.compile_rx(raw["callout"]), "source": packs.compile_rx(raw["source"]),
            "conclusion": packs.compile_rx(raw["conclusion"]),
        }
        _compiled.clear()
        _compiled[id(raw)] = hit
    return hit


def _lines(htmls: Iterable[str]) -> list[str]:
    out: list[str] = []
    for h in htmls:
        out.extend(line for line in html_to_text(h or "").split("\n") if line.strip())
    return out


def measure(htmls: Iterable[str], block_kinds: Optional[Iterable[str]] = None) -> dict[str, Any]:
    lex = _lex()
    htmls = [h or "" for h in htmls]
    lines = _lines(htmls)
    raw = "\n".join(lines)
    plain_text = raw.replace("**", "")
    paras = [line for line in lines if not line.startswith("#") and not line.startswith("- ")]
    bullets = [line for line in lines if line.startswith("- ")]
    headings = [line for line in lines if line.startswith("#")]
    para_chars = [len(line.replace("**", "")) for line in paras] or [0]
    sentences = [s for s in re.split(r"(?<=[.!?。])\s+|\n", plain_text) if len(s.strip()) > 1]
    endings: dict[str, int] = {k: 0 for k in lex["endings"]}
    for line in paras + bullets:
        text = line.replace("**", "").strip()
        for label, rx in lex["endings"].items():
            if rx.search(text):
                endings[label] += 1
                break
    total_chars = max(1, len(plain_text))
    tables = sum(h.count("<table") for h in htmls) + sum(1 for k in (block_kinds or []) if "table" in k or "grid" in k or "form" in k)
    first_lines = " ".join(lines[:3])
    m: dict[str, Any] = {
        "chars": len(plain_text),
        "paragraphs": len(paras),
        "avg_para_chars": round(sum(para_chars) / max(1, len(paras)), 1),
        "max_para_chars": max(para_chars),
        "long_para_ratio": round(sum(1 for c in para_chars if c > 200) / max(1, len(paras)), 2),
        "bold_per_para": round(raw.count("**") / 2 / max(1, len(paras) + len(bullets)), 2),
        "bullet_ratio": round(len(bullets) / max(1, len(paras) + len(bullets)), 2),
        "callouts": sum(1 for line in lines if lex["callout"].search(line)),
        "avg_sentence_chars": round(sum(len(s) for s in sentences) / max(1, len(sentences)), 1),
        "numbers_per_100": round(len(lex["number"].findall(plain_text)) * 100 / total_chars, 2),
        "tables": tables,
        "source_marks": len(lex["source"].findall(plain_text)),
        "quote_marks": plain_text.count("“") + plain_text.count('"') // 2,
        "headings": len(headings),
        "heading_levels": sorted({len(h) - len(h.lstrip("#")) for h in headings}),
        "heading_sequence": [h.lstrip("# ").strip()[:30] for h in headings[:12]],
        "conclusion_first": bool(lex["conclusion"].search(first_lines)),
        "ending_style": {k: v for k, v in endings.items() if v},
        "emoji": len(lex["emoji"].findall(plain_text)),
        "questions": plain_text.count("?"),
        "exclamations": plain_text.count("!"),
        "block_kinds": sorted(set(block_kinds or [])),
    }
    for key, rx in lex["meta"].items():
        m[key] = bool(rx.search(plain_text))
    return m


def by_layer(metrics: dict[str, Any], set_name: str = "") -> list[tuple[dict[str, Any], dict[str, Any]]]:
    return [(layer, {k: metrics.get(k) for k in layer.get("metrics") or [] if k in metrics}) for layer in layer_set(set_name)]


def render(metrics: dict[str, Any], set_name: str = "", title: str = "") -> str:
    msg = packs.data("reference:messages.json")["measure"]
    rows = [msg["head"].format(title=(msg["titleSep"] + title) if title else "", chars=metrics.get("chars", 0))]
    for layer, values in by_layer(metrics, set_name):
        vals = ", ".join(f"{k}={json.dumps(v, ensure_ascii=False)}" for k, v in values.items()) or msg["none"]
        rows.append(f"- {layer['id']} {layer['name']}: {vals}")
    rows.append(msg["tail"])
    return "\n".join(rows)


def _num(v: Any) -> Optional[float]:
    if isinstance(v, bool):
        return float(v)
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, (list, dict)):
        return float(len(v))
    return None


def compare(a: dict[str, Any], b: dict[str, Any], set_name: str = "", a_name: str = "A", b_name: str = "B") -> str:
    msg = packs.data("reference:messages.json")["compare"]
    rows = [msg["head"].format(a=a_name, b=b_name)]
    for layer in layer_set(set_name):
        diffs = []
        for key in layer.get("metrics") or []:
            va, vb = a.get(key), b.get(key)
            if va == vb:
                continue
            na, nb = _num(va), _num(vb)
            if na is not None and nb is not None and not isinstance(va, (list, dict)) and max(abs(na), abs(nb)) > 0:
                if abs(na - nb) / max(abs(na), abs(nb)) < 0.15:
                    continue  # 15% 안쪽 차이는 같은 결정으로 본다
            diffs.append(f"{key}: {json.dumps(va, ensure_ascii=False)} → {json.dumps(vb, ensure_ascii=False)}")
        rows.append(f"- {layer['id']} {layer['name']}: " + ("; ".join(diffs) if diffs else msg["same"]))
    return "\n".join(rows)


def distance(a: dict[str, Any], b: dict[str, Any], layer_id: str, set_name: str = "") -> float:
    """한 층위에서 두 측정값이 얼마나 다른가 (0 = 같음, 1 = 완전히 다름). 층위 준수 검증에 쓴다."""
    layer = next((x for x in layer_set(set_name) if x["id"] == layer_id), None)
    if layer is None or not layer.get("metrics"):
        return 0.0
    parts = []
    for key in layer["metrics"]:
        va, vb = a.get(key), b.get(key)
        if isinstance(va, dict) and isinstance(vb, dict):
            ta, tb = max(va, key=va.get, default=None), max(vb, key=vb.get, default=None)
            parts.append(0.0 if ta == tb else 1.0)
        elif isinstance(va, list) and isinstance(vb, list):
            sa, sb = set(map(str, va)), set(map(str, vb))
            parts.append(1 - len(sa & sb) / max(1, len(sa | sb)))
        else:
            na, nb = _num(va), _num(vb)
            if na is None or nb is None:
                continue
            parts.append(0.0 if max(abs(na), abs(nb)) == 0 else min(1.0, abs(na - nb) / max(abs(na), abs(nb))))
    return round(sum(parts) / max(1, len(parts)), 3)
