"""패턴 측정 — 어떤 글(레퍼런스 · 내 문서 · 칸 · 후보)이든 같은 자로 잰다 (표준 라이브러리만).

측정값은 장르를 가리지 않는 원시 지표이고, 어떤 지표가 어느 층위에 속하는지는 registry/layers.json 이 정한다.
정성 층위(서술 프레임워크 등)는 측정값 + 제목 순서를 근거로 모델이 판단한다.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Iterable, Optional

try:
    from .workbench import html_to_text
except ImportError:  # vibefs 서버는 패키지 밖에서 import 한다
    from workbench import html_to_text  # type: ignore[no-redef]

_REGISTRY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "registry", "layers.json")
_registry_cache: Optional[dict[str, Any]] = None


def registry() -> dict[str, Any]:
    global _registry_cache
    if _registry_cache is None:
        with open(_REGISTRY_PATH, "r", encoding="utf-8") as fh:
            _registry_cache = json.load(fh)
    return _registry_cache


def layer_set(name: str = "") -> list[dict[str, Any]]:
    reg = registry()
    return reg["sets"].get(name or reg.get("default", "document")) or reg["sets"][reg.get("default", "document")]


def layer_ids(name: str = "") -> set[str]:
    return {layer["id"] for layer in layer_set(name)}


_ENDINGS = {
    "개조식(~함·~임·~음)": re.compile(r"(함|임|음|됨|필요|예정|완료)\s*[.。]?\s*$"),
    "평서(~다)": re.compile(r"다\s*[.。]\s*$|다$"),
    "해요(~요)": re.compile(r"요\s*[.!?~。]?\s*$"),
    "명사형 종결": re.compile(r"[가-힣A-Za-z0-9)]\s*$"),
}
_EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
_NUMBER = re.compile(r"\d[\d,.]*\s*(%|퍼센트|명|분|일|개|건|원|억|만|조|배|회|시간|주|개월|년)?")
_META = {
    "meta_doc_no": re.compile(r"문서\s*번호|문서번호|Doc(ument)?\s*No|관리\s*번호|[A-Z]{2,}-\d{4}-\d{2,}"),
    "meta_approval": re.compile(r"결\s*재|담당\s*[|·].*(검토|승인)|기안|협조|승인자"),
    "meta_summary": re.compile(r"요\s*약|개\s*요|Executive\s*Summary|핵심\s*요약|TL;?DR", re.I),
    "meta_footnote": re.compile(r"※|\[\d+\]|각주|주\)\s"),
    "meta_version": re.compile(r"\b[vV]\d+(\.\d+)?\b|버전|개정\s*\d|Rev\.?\s*\d"),
}
_CALLOUT = re.compile(r"^\s*(>|\[!|💡|📌|✅|⚠|❗|👉|※)")
_SOURCE = re.compile(r"출처|자료\s*[:：]|Source|기준\)|\(\d{4}[.\-]\d{1,2}")
_CONCLUSION = re.compile(r"결론|요약|핵심|따라서|제안|권고|해답|Answer|TL;?DR", re.I)


def _lines(htmls: Iterable[str]) -> list[str]:
    out: list[str] = []
    for h in htmls:
        out.extend(l for l in html_to_text(h or "").split("\n") if l.strip())
    return out


def measure(htmls: Iterable[str], block_kinds: Optional[Iterable[str]] = None) -> dict[str, Any]:
    htmls = [h or "" for h in htmls]
    lines = _lines(htmls)
    raw = "\n".join(lines)
    plain_text = raw.replace("**", "")
    paras = [l for l in lines if not l.startswith("#") and not l.startswith("- ")]
    bullets = [l for l in lines if l.startswith("- ")]
    headings = [l for l in lines if l.startswith("#")]
    para_chars = [len(l.replace("**", "")) for l in paras] or [0]
    sentences = [s for s in re.split(r"(?<=[.!?。])\s+|\n", plain_text) if len(s.strip()) > 1]
    endings: dict[str, int] = {k: 0 for k in _ENDINGS}
    for line in paras + bullets:
        text = line.replace("**", "").strip()
        for label, rx in _ENDINGS.items():
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
        "callouts": sum(1 for l in lines if _CALLOUT.search(l)),
        "avg_sentence_chars": round(sum(len(s) for s in sentences) / max(1, len(sentences)), 1),
        "numbers_per_100": round(len(_NUMBER.findall(plain_text)) * 100 / total_chars, 2),
        "tables": tables,
        "source_marks": len(_SOURCE.findall(plain_text)),
        "quote_marks": plain_text.count("“") + plain_text.count('"') // 2,
        "headings": len(headings),
        "heading_levels": sorted({len(h) - len(h.lstrip("#")) for h in headings}),
        "heading_sequence": [h.lstrip("# ").strip()[:30] for h in headings[:12]],
        "conclusion_first": bool(_CONCLUSION.search(first_lines)),
        "ending_style": {k: v for k, v in endings.items() if v},
        "emoji": len(_EMOJI.findall(plain_text)),
        "questions": plain_text.count("?"),
        "exclamations": plain_text.count("!"),
        "block_kinds": sorted(set(block_kinds or [])),
    }
    for key, rx in _META.items():
        m[key] = bool(rx.search(plain_text))
    return m


def by_layer(metrics: dict[str, Any], set_name: str = "") -> list[tuple[dict[str, Any], dict[str, Any]]]:
    return [(layer, {k: metrics.get(k) for k in layer.get("metrics") or [] if k in metrics}) for layer in layer_set(set_name)]


def render(metrics: dict[str, Any], set_name: str = "", title: str = "") -> str:
    rows = [f"[패턴 측정{(' — ' + title) if title else ''}] 글자 {metrics.get('chars', 0):,}"]
    for layer, values in by_layer(metrics, set_name):
        vals = ", ".join(f"{k}={json.dumps(v, ensure_ascii=False)}" for k, v in values.items()) or "(측정값 없음 — 정성 판단)"
        rows.append(f"- {layer['id']} {layer['name']}: {vals}")
    rows.append("측정값은 근거일 뿐이다. 층위별 '결정'(무엇을 왜 그렇게 했나)은 원문을 읽고 말로 정리하라.")
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
    rows = [f"[층위별 비교] {a_name} vs {b_name}"]
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
        rows.append(f"- {layer['id']} {layer['name']}: " + ("; ".join(diffs) if diffs else "차이 작음"))
    return "\n".join(rows)


def distance(a: dict[str, Any], b: dict[str, Any], layer_id: str, set_name: str = "") -> float:
    """한 층위에서 두 측정값이 얼마나 다른가 (0 = 같음, 1 = 완전히 다름). 층위 준수 검증에 쓴다."""
    layer = next((l for l in layer_set(set_name) if l["id"] == layer_id), None)
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
