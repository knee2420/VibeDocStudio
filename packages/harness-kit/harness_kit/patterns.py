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
            "markers": [(m["label"], packs.compile_rx(m)) for m in raw.get("markers") or []],
        }
        _compiled.clear()
        _compiled[id(raw)] = hit
    return hit


def _bigrams(s: str) -> set[str]:
    s = re.sub(r"\s+", "", s)
    return {s[i:i + 2] for i in range(len(s) - 1)} or ({s} if s else set())


def title_similarity(a: str, b: str) -> float:
    """제목 두 개의 글자쌍(dice) 유사도 0~1."""
    x, y = _bigrams(a), _bigrams(b)
    return 2 * len(x & y) / (len(x) + len(y)) if x and y else 0.0


def fact_values(text: str) -> list[str]:
    """근거가 있어야 하는 값(금액 · 기간 · 비율 · 공고번호 — 어휘 `measure.factValue`)을 공백 없이, 나온 순서대로."""
    raw = packs.data(LEXICON)["measure"].get("factValue")
    if not raw:
        return []
    return list(dict.fromkeys(re.sub(r"\s+", "", m.group(0)) for m in packs.compile_rx(raw).finditer(text or "")))


def unsourced_values(text: str, corpus: str, reference: str = "") -> tuple[list[str], list[str]]:
    """글의 근거 값 중 말뭉치(읽은 원천 줄)에 없는 것과, 그중 레퍼런스 글에 있는 것(누출)."""
    flat = re.sub(r"\s+", "", corpus or "")
    ref_flat = re.sub(r"\s+", "", reference or "")
    missing = [v for v in fact_values(text) if v not in flat]
    return missing, [v for v in missing if ref_flat and v in ref_flat]


def marker_patterns() -> list[tuple[str, "re.Pattern[str]"]]:
    """글머리 · 번호 기호 (label, 정규식) — 어휘 `measure.markers`."""
    return list(_lex()["markers"])


def section_lines(items: Iterable[tuple[Any, ...]]) -> list[dict[str, Any]]:
    """(글, 블록 종류[, 자리]) → 번호 붙은 장 · 절 뼈대 (자리는 그대로 "at" 으로 돌려준다). 단계는 어휘(`measure.sections.markers`) 순서,
    path 는 위 단계 번호를 이은 자리('Ⅱ/가'). 목차 줄(점 리더) · 글자 없는 조각 · 같은 자리 반복은 뺀다."""
    raw = packs.data(LEXICON)["measure"].get("sections") or {}
    order = list(raw.get("markers") or [])
    if not order:
        return []
    marks = {label: rx for label, rx in _lex()["markers"] if label in order}
    leader = packs.compile_rx(raw["leader"]) if raw.get("leader") else None
    min_letters, max_title = int(raw.get("minLetters", 2)), int(raw.get("maxTitle", 40))
    letter = packs.compile_rx(raw["letter"]) if raw.get("letter") else re.compile(r"\w")
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    stack: dict[int, str] = {}
    for item in items:
        text, kind, at = item[0], item[1], (item[2] if len(item) > 2 else None)
        for ln in str(text or "").split("\n"):
            ln = re.sub(r"\*\*|__", "", ln).strip()  # html_to_text 가 굵게를 ** 로 남긴다
            if not ln or (leader and leader.search(ln)):
                continue
            hit = next(((label, m) for label in order if (m := marks[label].match(ln))), None)
            if hit is None:
                continue
            label, m = hit
            prefix = m.group(0).strip()
            title = ln[m.end():].strip(" .|:·-\t")
            if len(letter.findall(title)) < min_letters or len(title) > max_title:
                continue
            level = order.index(label) + 1
            stack = {k: v for k, v in stack.items() if k < level}
            stack[level] = prefix.rstrip(".").strip()
            path = "/".join(stack[k] for k in sorted(stack))
            if path in seen:
                continue
            seen.add(path)
            out.append({"marker": label, "prefix": prefix, "title": title, "level": level, "path": path,
                        "kind": str(kind or ""), "at": at, "label": f"{prefix} {title}" if prefix.endswith(".") else f"{prefix}. {title}"})
    return out


def skeleton_diff(theirs: list[dict[str, Any]], mine: list[dict[str, Any]]) -> dict[str, Any]:
    """레퍼런스 뼈대 대비 내 뼈대 — 같은 자리 · 비슷한 제목이면 갖춤, 같은 자리인데 제목이 다르면 다름, 없으면 빠짐."""
    th = float((packs.data(LEXICON)["measure"].get("sections") or {}).get("match", 0.5))

    def same(a: str, b: str) -> bool:  # 비슷하거나, 한쪽 제목이 다른 쪽에 통째로 들어 있으면 ('추진 내용' ⊂ '추진 내용 및 …')
        x, y = re.sub(r"\s+", "", a), re.sub(r"\s+", "", b)
        return title_similarity(a, b) >= th or bool(x and y and (x in y or y in x))

    by_path = {s["path"]: s for s in mine}
    kept: list[dict[str, Any]] = []
    renamed: list[tuple[dict[str, Any], dict[str, Any]]] = []
    missing: list[dict[str, Any]] = []
    for r in theirs:
        at = by_path.get(r["path"])
        if (at and same(r["title"], at["title"])) or any(same(r["title"], s["title"]) for s in mine):
            kept.append(r)
        elif at:
            renamed.append((r, at))
        else:
            missing.append(r)
    scheme = lambda ss: list(dict.fromkeys(s["marker"] for s in ss))  # noqa: E731
    return {"total": len(theirs), "kept": kept, "renamed": renamed, "missing": missing,
            "theirs_scheme": scheme(theirs), "mine_scheme": scheme(mine)}


GENRES = "authoring:genres.json"


def _squash(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


def genre_of(title: str = "", doctype: str = "") -> Optional[dict[str, Any]]:
    """장르 표(`authoring:genres.json`)에서 doctype(id) 또는 제목에 든 낱말로 장르를 찾는다."""
    table = (packs.data(GENRES).get("genres") or {})
    if doctype and doctype in table:
        return {"id": doctype, **table[doctype]}
    flat = _squash(title)
    for gid, g in table.items():
        if any(_squash(k) and _squash(k) in flat for k in g.get("match") or []):
            return {"id": gid, **g}
    return None


def genre_items(genre: dict[str, Any], text: str) -> list[dict[str, Any]]:
    """장르 필수 구성마다 문서 글에 있는지 — [{id, label, present}]."""
    flat = _squash(text)
    return [{"id": it["id"], "label": it["label"], "present": any(_squash(k) in flat for k in it.get("any") or [])}
            for it in genre.get("items") or []]


def _lines(htmls: Iterable[str]) -> list[str]:
    out: list[str] = []
    for h in htmls:
        out.extend(line for line in html_to_text(h or "").split("\n") if line.strip())
    return out


def _kind_alias(kind: str) -> str:
    """레퍼런스 추출본과 문서가 같은 블록을 다르게 부르는 이름을 맞춘다 (층위 레지스트리 kindAliases)."""
    alias = registry().get("kindAliases") or {}
    return str(alias.get(kind, kind)) if not str(kind).startswith("_") else str(kind)


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
    # 글머리 체계: 문단 첫머리 기호 종류를 처음 나온 순서대로 (2번 넘게 쓰인 것만 — 우연한 한 줄은 체계가 아니다)
    marker_hits: dict[str, int] = {}
    for line in paras + bullets:
        text = line.replace("**", "").strip()
        text = text[2:].strip() if text.startswith("- ") and len(text) > 2 and not text[2:3].isspace() else text
        for label, rx in lex["markers"]:
            if rx.search(text):
                marker_hits[label] = marker_hits.get(label, 0) + 1
                break
    marker_scheme = [k for k, v in marker_hits.items() if v >= 2]
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
        "block_kinds": sorted({_kind_alias(k) for k in block_kinds or []}),
        "marker_scheme": marker_scheme,
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


def count_metrics() -> set[str]:
    """분량(글 길이 · 재료 양)에 따라 커지는 지표 — 결정의 차이가 아니라 분량의 차이라 비교 · 준수 판단에서 뺀다."""
    return set(registry().get("countMetrics") or [])


def compare(a: dict[str, Any], b: dict[str, Any], set_name: str = "", a_name: str = "A", b_name: str = "B") -> str:
    msg = packs.data("reference:messages.json")["compare"]
    counts = count_metrics()
    rows = [msg["head"].format(a=a_name, b=b_name)]
    for layer in layer_set(set_name):
        diffs = []
        for key in layer.get("metrics") or []:
            va, vb = a.get(key), b.get(key)
            if va == vb or key in counts:
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


# --- 배치(레이아웃) 측정 -------------------------------------------------------------------------
# 글 지표(measure)와 같은 자로, 덩어리의 "배치" 를 잰다: 섹션 단위 리듬 · 사진 서사 · 연결 동선 · 강조.
# 레퍼런스 덩어리(extraction.blocks) 와 내 문서 블록(.vdoc blocks) 둘 다 같은 토큰으로 바꿔 잰다.

_HL = re.compile(r"background(?:-color)?\s*:", re.I)
_COLOR = re.compile(r"(?<![-\w])color\s*:", re.I)


def layout_token(block: dict[str, Any]) -> str:
    """덩어리 하나 → 배치 토큰. H · P · LIST · CAP · IMG · STK · G<n> · LINK · HR · BOX · TABLE · HERO."""
    kind = str(block.get("kind") or "")
    media = block.get("media") or {}
    if kind in ("heading", "form-title"):
        return "H"
    if kind in ("paragraph", "text"):
        return "P"
    if kind == "list":
        return "LIST"
    if kind == "caption":
        return "CAP"
    if kind == "image":
        width = media.get("widthPx")
        if media.get("role") == "sticker":
            return "STK"
        if width is None:
            m = re.match(r"\s*([\d.]+)\s*px", str(block.get("width") or ""))
            width = float(m.group(1)) if m else None
        return "STK" if width is not None and width <= 160 else "IMG"
    if kind == "gallery":
        return f"G{int(media.get('count') or 0)}"
    if kind == "columns-grid":
        cols = block.get("columns") or []
        imgs = [c for c in cols if isinstance(c, dict) and c.get("image")]
        return f"G{len(imgs)}" if imgs and len(imgs) == len(cols) else "P"
    if kind == "link-card":
        return "LINK"
    if kind == "divider":
        return "HR"
    if kind in ("callout", "callout-box"):
        return "BOX"
    if kind in ("table", "structured-table"):
        return "TABLE"
    if kind == "hero":
        return "HERO"
    return "P" if (block.get("text") or block.get("html")) else ""


def _photos(token: str) -> int:
    if token == "IMG":
        return 1
    if token.startswith("G"):
        try:
            return int(token[1:])
        except ValueError:
            return 0
    return 0


def _signature(tokens: list[str]) -> str:
    """섹션 하나의 모양 — 같은 토큰이 이어지면 접고(P P P → P+), 사진 묶음은 G 로 묶는다."""
    out: list[str] = []
    for t in tokens:
        t = "G" if t.startswith("G") else t
        if out and out[-1].rstrip("+") == t:
            out[-1] = t + "+"
        else:
            out.append(t)
    return " ".join(out)


def measure_layout(blocks: Iterable[dict[str, Any]], htmls: Optional[Iterable[str]] = None) -> dict[str, Any]:
    """배치 지표. blocks 는 {kind, media?, style?|align?, html?, text?} 사전들 (레퍼런스 덩어리 · vdoc 블록 공용)."""
    items = [b for b in blocks if isinstance(b, dict)]
    tokens = [layout_token(b) for b in items]
    pairs = [(t, b) for t, b in zip(tokens, items) if t]
    toks = [t for t, _ in pairs]
    sections: list[list[str]] = []
    opening: list[str] = []
    for t in toks:
        if t == "H":
            sections.append([t])
        elif sections:
            sections[-1].append(t)
        else:
            opening.append(t)
    sigs = [_signature(s) for s in sections]
    common = max(set(sigs), key=sigs.count) if sigs else ""
    # 사진 1장 · 사진 묶음을 같은 PHOTO 로 본 섹션 모양 (레퍼런스도 섹션마다 섞어 쓴다)
    psigs = [_signature(["PHOTO" if (x == "IMG" or x.startswith("G")) else x for x in s]) for s in sections]
    pcommon = max(set(psigs), key=psigs.count) if psigs else ""
    photos = sum(_photos(t) for t in toks)
    galleries = [int(t[1:]) for t in toks if t.startswith("G") and t[1:].isdigit()]
    paras = [b for t, b in pairs if t in ("P", "LIST")]
    html_list = list(htmls) if htmls is not None else [str(b.get("html") or "") for _, b in pairs]
    joined = "\n".join(html_list)
    centered = sum(1 for b in paras if (b.get("align") or (b.get("style") or {}).get("align")) == "center")
    n_sec = max(1, len(sections))
    heads = [str(b.get("text") or "") for t, b in pairs if t == "H"]
    return {
        "sections": len(sections),
        "section_signature": common,
        "signature_share": round(sigs.count(common) / max(1, len(sigs)), 2) if sigs else 0.0,
        "photo_signature": pcommon,
        # 섹션 리듬의 고정점: 소제목 바로 다음이 사진인 섹션 · 링크 카드로 끝나는 섹션의 비율
        "photo_first_ratio": round(sum(1 for s in sections if len(s) > 1 and (s[1] == "IMG" or s[1].startswith("G"))) / n_sec, 2)
        if sections else 0.0,
        "link_end_ratio": round(sum(1 for s in sections if s[-1] == "LINK") / n_sec, 2) if sections else 0.0,
        "photo_signature_share": round(psigs.count(pcommon) / max(1, len(psigs)), 2) if psigs else 0.0,
        "opening": _signature(opening),
        "paras_per_section": round(sum(1 for t in toks if t in ("P", "LIST")) / n_sec, 1),
        "photos": photos,
        "photos_per_section": round(photos / n_sec, 1),
        "galleries": len(galleries),
        "gallery_sizes": sorted(set(galleries)),
        "photo_text_ratio": round(photos / max(1, len(paras)), 2),
        "captions": toks.count("CAP"),
        "caption_ratio": round(toks.count("CAP") / max(1, sum(1 for x in toks if x == "IMG" or x.startswith("G"))), 2),
        "gallery_share": round(len(galleries) / max(1, sum(1 for x in toks if x == "IMG" or x.startswith("G"))), 2),
        "stickers": toks.count("STK"),
        "link_cards": toks.count("LINK"),
        "link_cards_per_section": round(toks.count("LINK") / n_sec, 2),
        "link_thumb_ratio": round(sum(1 for t, b in pairs if t == "LINK" and (b.get("thumbnail") or (b.get("media") or {}).get("thumbnail")))
                                  / max(1, toks.count("LINK")), 2),
        "dividers": toks.count("HR"),
        "boxes": toks.count("BOX"),
        "hero": "HERO" in toks,
        "highlight_per_para": round(len(_HL.findall(joined)) / max(1, len(paras)), 2),
        "color_accents": len(_COLOR.findall(joined)),
        "accent_per_para": round(len(_COLOR.findall(joined)) / max(1, len(paras)), 2),
        "centered_ratio": round(centered / max(1, len(paras)), 2),
        "question_headings": round(sum(1 for h in heads if h.strip().endswith("?")) / max(1, len(heads)), 2),
        "layout_tokens": " ".join(toks[:80]),
    }


def measure_all(htmls: Iterable[str], block_kinds: Optional[Iterable[str]] = None,
                blocks: Optional[Iterable[dict[str, Any]]] = None) -> dict[str, Any]:
    """글 지표 + (덩어리가 있으면) 배치 지표."""
    htmls = list(htmls)
    out = measure(htmls, block_kinds)
    if blocks is not None:
        out.update(measure_layout(list(blocks)))
    return out
