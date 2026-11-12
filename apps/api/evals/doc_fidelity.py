"""결과 문서 채점기 — 화면에서 에이전트가 만든 문서를 레퍼런스 · 리소스와 대조해 단계별 지표를 잰다.

실행은 하지 않는다 (요청은 반드시 앱 화면의 AI Composer 에서 보낸다). 여기는 저장된 결과를 재기만 한다.

    python evals/doc_fidelity.py --doc <docId> --ref <refId> --pages 1-23 \
        --resources "<리소스 루트>" --genre bid-notice --label baseline

결과: evals/results/doc-fidelity/<label>.json · .md
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from html import unescape
from pathlib import Path
from typing import Any, Iterable

HERE = Path(__file__).resolve().parent
API = HERE.parent
ROOT = API.parent.parent
sys.path.insert(0, str(ROOT / "packages" / "harness-kit"))

from harness_kit import patterns  # noqa: E402

DOCS = API / "data" / "knowledge" / "documents"
REFS = API / "data" / "knowledge" / "references" / "items"
WORKBENCH = API / "state" / "assistant" / "workspace" / "workbench.json"
AGY_CONV = Path.home() / ".gemini" / "antigravity-cli" / "conversations"
TARGETS = json.loads((HERE / "doc_fidelity_targets.json").read_text(encoding="utf-8"))
LAYERS = json.loads((ROOT / "packages" / "harness-packs" / "reference" / "layers.json").read_text(encoding="utf-8"))
OUT = HERE / "results" / "doc-fidelity"

TEXT_EXT = {".md", ".outline", ".base", ".txt", ".csv", ".json"}
TABLE_KINDS = {"table", "structured-table"}

# --- 글 다루기 -----------------------------------------------------------------

_BREAK = re.compile(r"<\s*(br|/p|/li|/h\d|/div|/tr)\s*/?>", re.I)


def html_lines(html: str) -> list[str]:
    text = _BREAK.sub("\n", html or "")
    text = unescape(re.sub(r"<[^>]+>", "", text))
    return [re.sub(r"[ \t ]+", " ", ln).strip() for ln in text.split("\n") if ln.strip()]


def plain(html: str) -> str:
    return " ".join(html_lines(html))


def norm(s: str) -> str:
    return re.sub(r"[\s·.:()\[\]「」『』<>-]+", "", s).lower()


# 글머리 · 번호 기호는 dc_check 와 같은 어휘(core:lexicon measure.markers)로 잰다. 장 · 절 번호(sections.markers)는
# C2(번호 체계)가 재므로 B1(글머리 체계)에서는 뺀다.
_MARKERS: list[tuple[str, re.Pattern[str]]] = patterns.marker_patterns()
_SECTION_MARKERS = set((patterns.packs.data(patterns.LEXICON)["measure"].get("sections") or {}).get("markers") or [])


def marker_of(line: str) -> str | None:
    for name, rx in _MARKERS:
        if rx.match(line):
            return name
    return None


_PARA_STYLES = patterns.packs.data("editor:paragraph-styles.json")
_STYLE_SPECS = [(sid, spec) for st in (_PARA_STYLES.get("sets") or {}).values() for sid, spec in (st.get("styles") or {}).items()]
_HANGING_IDS = {sid for sid, spec in _STYLE_SPECS if spec.get("hanging")}
_STYLE_MATCH = [(sid, re.compile(rx)) for sid, spec in _STYLE_SPECS for rx in spec.get("match") or []]


def _hanging_style_for(line: str) -> str | None:
    sid = next((s for s, rx in _STYLE_MATCH if rx.search(line.lstrip())), None)
    return sid if sid in _HANGING_IDS else None


def bullet_of(line: str) -> str | None:
    m = marker_of(line)
    return m if m not in _SECTION_MARKERS else None


def jaccard(a: Iterable[Any], b: Iterable[Any]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 1.0
    return round(len(sa & sb) / max(1, len(sa | sb)), 3)


def bigrams(s: str) -> set[str]:
    s = norm(s)
    return {s[i:i + 2] for i in range(len(s) - 1)} or {s}


def dice(a: str, b: str) -> float:
    x, y = bigrams(a), bigrams(b)
    return 2 * len(x & y) / max(1, len(x) + len(y))


# --- 입력 읽기 -----------------------------------------------------------------

def load_doc(doc_id: str) -> dict[str, Any]:
    return json.loads((DOCS / doc_id / "document.vdoc.json").read_text(encoding="utf-8"))


def doc_blocks(doc: dict[str, Any]) -> list[dict[str, Any]]:
    """블록마다 (쪽 · 종류 · 칸 HTML 목록)."""
    slots = doc.get("slots") or {}
    out = []
    for pi, page in enumerate(doc.get("pages") or []):
        for b in page.get("blocks") or []:
            ids: list[str] = []
            if b.get("slotId"):
                ids.append(b["slotId"])
            for key in ("slotIds",):
                ids += [x for x in b.get(key) or [] if isinstance(x, str)]
            for row in b.get("rows") or []:
                ids += [c.get("slotId") for c in row.get("cells") or [] if c.get("slotId")]
            for col in b.get("columns") or []:
                if isinstance(col, dict):
                    ids += [x for x in col.get("slotIds") or [] if isinstance(x, str)]
                    if col.get("slotId"):
                        ids.append(col["slotId"])
            htmls = [str((slots.get(i) or {}).get("content") or "") for i in ids]
            out.append({"page": pi + 1, "kind": b.get("kind"), "block": b, "htmls": htmls})
    return out


def load_ref(ref_id: str, pages: tuple[int, int]) -> list[dict[str, Any]]:
    ex = json.loads((REFS / ref_id / "extraction.json").read_text(encoding="utf-8"))
    lo, hi = pages
    return [b for b in ex["blocks"] if lo <= int(b.get("page") or 0) <= hi]


def load_ref_all_text(ref_id: str) -> str:
    ex = json.loads((REFS / ref_id / "extraction.json").read_text(encoding="utf-8"))
    return "\n".join(str(b.get("text") or "") for b in ex["blocks"])


def resource_corpus(root: Path) -> str:
    parts = []
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in TEXT_EXT:
            try:
                parts.append(p.read_text(encoding="utf-8", errors="replace"))
            except OSError:
                pass
    return "\n".join(parts)


def run_for_doc(doc_id: str) -> tuple[str | None, list[str]]:
    """그 문서를 대상으로 한 가장 최근 Composer 세션과 agy 대화 id."""
    try:
        wb = json.loads(WORKBENCH.read_text(encoding="utf-8"))
    except OSError:
        return None, []
    best = None
    for sid, v in wb.items():
        if isinstance(v, dict) and v.get("docId") == doc_id:
            if best is None or float(v.get("updatedAt") or 0) > float(wb[best].get("updatedAt") or 0):
                best = sid
    return best, list((wb.get(best) or {}).get("conversationIds") or []) if best else []


def files_read(conv_ids: list[str], root: Path) -> list[str]:
    seen: set[str] = set()
    root_s = str(root).replace("/", "\\").lower()
    for cid in conv_ids:
        db = AGY_CONV / f"{cid}.db"
        if not db.is_file():
            continue
        con = sqlite3.connect(db)
        for (payload,) in con.execute("select step_payload from steps"):
            s = (payload or b"").decode("utf-8", "replace")
            for m in re.finditer(r'"(?:Path|path|AbsolutePath)"\s*:\s*"((?:[^"\\]|\\.)+)"', s):
                try:
                    p = json.loads(f'"{m.group(1)}"')
                except json.JSONDecodeError:
                    continue
                if p.replace("/", "\\").lower().startswith(root_s):
                    seen.add(p)
        con.close()
    return sorted(seen)


# --- 지표 ----------------------------------------------------------------------

_REQ_ID = re.compile(r"\b[A-Z]{2,4}-\d{2,3}\b")

def value_key(v: str) -> str:
    return re.sub(r"\s+", "", v)


def measure_layers(htmls: list[str], kinds: list[str]) -> dict[str, Any]:
    return patterns.measure(htmls, kinds)


def layer_gaps(ref_m: dict[str, Any], doc_m: dict[str, Any]) -> list[dict[str, Any]]:
    gaps = []
    names: list[str] = []
    for layer in LAYERS["sets"]["document"]:
        names += list(layer.get("metrics") or [])
    # 분량 지표(문단 수 · 표 수 …)는 결정이 아니라 분량의 차이 — 층위 레지스트리 countMetrics 를 dc_check 처럼 뺀다
    counts = patterns.count_metrics()
    for k in dict.fromkeys(n for n in names if n not in counts):
        a, b = ref_m.get(k), doc_m.get(k)
        if isinstance(a, bool) or isinstance(b, bool):
            if a != b:
                gaps.append({"metric": k, "ref": a, "doc": b})
        elif isinstance(a, (int, float)) and isinstance(b, (int, float)):
            base = max(abs(a), 1e-9)
            if abs(a - b) / base > 0.3 and not (a == 0 and b == 0):
                gaps.append({"metric": k, "ref": round(a, 3), "doc": round(b, 3)})
        elif isinstance(a, list) and isinstance(b, list) and k in ("heading_levels", "block_kinds"):
            if jaccard(map(str, a), map(str, b)) < 0.7:
                gaps.append({"metric": k, "ref": a, "doc": b})
    return gaps


def score(args: argparse.Namespace) -> dict[str, Any]:
    lo, hi = (int(x) for x in args.pages.split("-"))
    doc = load_doc(args.doc)
    blocks = doc_blocks(doc)
    ref_blocks = load_ref(args.ref, (lo, hi))
    root = Path(args.resources)

    # 문서 줄 (블록 종류 · 줄)
    doc_lines: list[tuple[str, str]] = []
    for b in blocks:
        for h in b["htmls"]:
            for ln in html_lines(h):
                doc_lines.append((str(b["kind"]), ln))
    doc_text = "\n".join(ln for _, ln in doc_lines)
    headings = [ln for k, ln in doc_lines if k == "heading"]
    body = [ln for k, ln in doc_lines if k not in TABLE_KINDS and k != "heading"]

    # A. 표현력
    table_blocks = [b for b in blocks if b["kind"] in TABLE_KINDS]
    # 문단 단위 — 한 칸에 이름 있는 문단 여러 개가 들어 있으면 각각 잰다 (<br> 로 붙은 줄은 한 문단으로 남는다)
    long_paras = sum(
        1
        for b in blocks
        if b["kind"] == "text"
        for h in b["htmls"]
        for para in (re.findall(r"<(?:p|li)\b[^>]*>.*?</(?:p|li)>", h, re.S) or [h])
        if len(plain(para)) > 320
    )
    req_all = _REQ_ID.findall(doc_text)
    req_in_tables = _REQ_ID.findall("\n".join(plain(h) for b in table_blocks for h in b["htmls"]))
    a4 = round(len(set(req_in_tables)) / len(set(req_all)), 3) if req_all else 0.0

    # B. 문단 · 서식
    ref_lines = [ln.strip() for b in ref_blocks if lo + 2 < 99 for ln in str(b.get("text") or "").split("\n") if ln.strip()]
    toc_pages = {p for p in range(lo, hi + 1) if any("목 차" in str(b.get("text")) or "목차" == str(b.get("text")).strip() for b in ref_blocks if b.get("page") == p)}
    ref_body_lines = [ln.strip() for b in ref_blocks if b.get("page") not in toc_pages and b.get("kind") != "table"
                      for ln in str(b.get("text") or "").split("\n") if ln.strip()]
    ref_markers = {m for m in (bullet_of(ln) for ln in ref_body_lines) if m}
    doc_markers = {m for m in (bullet_of(ln) for ln in body) if m}
    marked_paras = 0
    styled = 0
    hanging = 0
    total_paras = 0
    for b in blocks:
        if b["kind"] in TABLE_KINDS or b["kind"] == "heading":
            continue
        for h in b["htmls"]:
            for m in re.finditer(r"<(p|li)\b([^>]*)>(.*?)</\1>", h or "", re.S | re.I):
                attrs, inner = m.group(2), m.group(3)
                total_paras += 1
                if re.search(r'data-style=|data-para-style=', attrs):
                    styled += 1
                # 내어쓰기를 기대하는 문단 = 레지스트리에서 그 줄에 맞는 스타일이 hanging 을 가진 글머리 문단
                # (가. · 1) 같은 제목형 번호 문단은 내어쓰기 대상이 아니다)
                want = _hanging_style_for(plain(inner))
                if want:
                    marked_paras += 1
                    sid = re.search(r'data-(?:para-)?style="([^"]+)"', attrs)
                    if re.search(r"text-indent:\s*-", attrs) or (sid and sid.group(1) in _HANGING_IDS):
                        hanging += 1

    # C. 레퍼런스 구조 — dc_check 와 같은 자(harness_kit.patterns.section_lines · skeleton_diff · genre_items)로 잰다
    not_table = lambda k: "table" not in str(k or "")  # noqa: E731
    ref_skel = patterns.section_lines((str(b.get("text") or ""), str(b.get("kind") or ""))
                                      for b in ref_blocks if not_table(b.get("kind")))
    doc_skel = patterns.section_lines(("\n".join(ln for h in b["htmls"] for ln in html_lines(h)), str(b["kind"]))
                                      for b in blocks if not_table(b["kind"]))
    skel = patterns.skeleton_diff(ref_skel, doc_skel)
    ref_sections = [s["path"] + " " + s["title"] for s in ref_skel]
    covered = [s["path"] + " " + s["title"] for s in skel["kept"]]
    c1 = round(len(skel["kept"]) / skel["total"], 3) if skel["total"] else 1.0
    ref_head_scheme = set(skel["theirs_scheme"])
    doc_head_scheme = set(skel["mine_scheme"])
    ref_m = measure_layers([str(b.get("html") or "") for b in ref_blocks], [str(b.get("kind") or "") for b in ref_blocks])
    doc_m = measure_layers([h for b in blocks for h in b["htmls"]], [str(b["kind"]) for b in blocks])
    gaps = layer_gaps(ref_m, doc_m)

    genre = patterns.genre_of(doctype=args.genre) if args.genre else None
    genre_rows = patterns.genre_items(genre, doc_text) if genre else []
    e1 = round(sum(r["present"] for r in genre_rows) / len(genre_rows), 3) if genre_rows else 1.0

    # D. 사실 근거
    # 값 = dc_check 와 같은 어휘(measure.factValue). 채점 말뭉치는 리소스 전체(에이전트가 읽었든 안 읽었든)
    unsourced, leaks = patterns.unsourced_values(doc_text, resource_corpus(root), load_ref_all_text(args.ref))
    unsourced, leaks = sorted(unsourced), sorted(leaks)
    session, convs = run_for_doc(args.doc)
    read = files_read(convs, root)

    metrics = {
        "A1_table_blocks": len(table_blocks),
        "A2_long_paragraphs": long_paras,
        "A4_req_ids_in_tables": a4,
        "B1_marker_jaccard": jaccard(ref_markers, doc_markers),
        "B2_styled_ratio": round(styled / total_paras, 3) if total_paras else 0.0,
        "B3_hanging_ratio": round(hanging / marked_paras, 3) if marked_paras else 0.0,
        "C1_section_coverage": c1,
        "C2_heading_scheme_jaccard": jaccard(ref_head_scheme, doc_head_scheme),
        "C4_layer_gaps": len(gaps),
        "E1_genre_items": e1,
        "D1_unsourced_values": len(unsourced),
        "D2_reference_leaks": len(leaks),
        "D3_resource_files_read": len(read),
    }
    stages = {}
    for stage, checks in TARGETS["stages"].items():
        rows = []
        for key, t in checks.items():
            v = metrics[key]
            ok = v >= t["value"] if t["op"] == ">=" else v <= t["value"]
            rows.append({"metric": key, "label": t["label"], "value": v, "target": f'{t["op"]} {t["value"]}', "pass": ok})
        stages[stage] = {"pass": all(r["pass"] for r in rows), "rows": rows}

    return {
        "label": args.label,
        "doc": args.doc,
        "title": doc.get("title"),
        "ref": args.ref,
        "pages": args.pages,
        "session": session,
        "conversations": convs,
        "metrics": metrics,
        "stages": stages,
        "details": {
            "pages": len(doc.get("pages") or []),
            "block_kinds": sorted({str(b["kind"]) for b in blocks}),
            "ref_markers": sorted(ref_markers),
            "doc_markers": sorted(doc_markers),
            "ref_sections": ref_sections,
            "covered_sections": covered,
            "ref_heading_scheme": sorted(ref_head_scheme),
            "doc_heading_scheme": sorted(doc_head_scheme),
            "layer_gaps": gaps,
            "genre": genre_rows,
            "unsourced_values": unsourced,
            "reference_leaks": leaks,
            "files_read": read,
        },
    }


def to_md(r: dict[str, Any]) -> str:
    lines = [f"# 결과 문서 채점 — {r['label']}", "", f"- 문서: `{r['doc']}` 「{r['title']}」",
             f"- 레퍼런스: `{r['ref']}` 쪽 {r['pages']} · 세션 `{r['session']}`", ""]
    for stage, s in r["stages"].items():
        lines.append(f"## {stage} — {'통과' if s['pass'] else '미달'}")
        lines.append("| 지표 | 값 | 목표 | |")
        lines.append("|---|---|---|---|")
        for row in s["rows"]:
            lines.append(f"| {row['label']} | {row['value']} | {row['target']} | {'✅' if row['pass'] else '❌'} |")
        lines.append("")
    d = r["details"]
    lines += ["## 세부", f"- 블록 종류: {', '.join(d['block_kinds'])}",
              f"- 글머리 기호: 레퍼런스 {d['ref_markers']} · 문서 {d['doc_markers']}",
              f"- 장 · 절 번호: 레퍼런스 {d['ref_heading_scheme']} · 문서 {d['doc_heading_scheme']}",
              f"- 레퍼런스 장 · 절 {len(d['ref_sections'])}개 중 갖춤 {len(d['covered_sections'])}개",
              f"- 층위 차이: {', '.join(g['metric'] for g in d['layer_gaps']) or '없음'}",
              f"- 장르 구성: {', '.join(('✓' if g['present'] else '✗') + g['label'] for g in d['genre'])}",
              f"- 근거 없는 값: {', '.join(d['unsourced_values']) or '없음'} (레퍼런스에서 온 값: {', '.join(d['reference_leaks']) or '없음'})",
              f"- 읽은 리소스 파일 {len(d['files_read'])}개"]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", required=True)
    ap.add_argument("--ref", required=True)
    ap.add_argument("--pages", default="1-23")
    ap.add_argument("--resources", required=True)
    ap.add_argument("--genre", default="")
    ap.add_argument("--label", default="run")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    r = score(args)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{args.label}.json").write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    md = to_md(r)
    (OUT / f"{args.label}.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
