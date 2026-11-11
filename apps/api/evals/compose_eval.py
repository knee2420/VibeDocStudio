"""문서 짓기 평가 — 레퍼런스(배치) + 리소스(사실 · 사진)로 에이전트가 글 한 편을 혼자 짓는지 잰다.

    python evals/compose_eval.py --label c1 [--model gemini-4-argon-high] [--scenario blog-retro]

시나리오는 (레퍼런스 URL · 리소스 루트 · 요청) 조합이다 — 특정 글에 맞춘 규칙을 하네스에 넣지 않고, 이 매트릭스로
여러 장르 · 레퍼런스 · 자료 묶음에서 같은 기준으로 잰다. 레퍼런스가 라이브러리에 없으면 먼저 넣는다.

채점(자동):
  built       에이전트 초안 문서가 생기고 블록이 있다 (dc_new · dc_build)
  sourced     모든 사진이 리소스(resource:<id>)이고, 마운트 안의 것이다
  rhythm      섹션 고정점(소제목 → 사진으로 열기 · 링크 카드로 맺기)의 비율이 레퍼런스와 0.3 안쪽
  layers      blog 층위의 비율 지표(분량 지표 제외) 중 30% 안쪽인 비율 (높을수록 레퍼런스 결정을 잘 따름)
  no_leak     레퍼런스의 소제목 · 문장이 그대로 들어가지 않았다
  checked     dc_check 를 한 번 이상 불렀다
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
API = HERE.parent
sys.path[:0] = [str(API), str(API.parent.parent / "packages" / "harness-kit")]

from harness_kit import patterns  # noqa: E402
from harness_kit.text import html_to_text  # noqa: E402

BASE = os.environ.get("VIBE_API_BASE", "http://127.0.0.1:8090")
PROJECT = "vproj-enterprise-architecture-suite"
VAULT = os.path.join("C:" + os.sep, "망고독 관련 자료", "프로젝트_매니지먼트", "What-s-in-my-head")

TESTSETS = os.path.join(VAULT, "4.🗄️(Archive) 보관", "각종 테스트셋_dummy 모음")

SCENARIOS: dict[str, dict[str, Any]] = {
    "travel-kaohsiung": {
        "ref_url": "https://m.blog.naver.com/ddubuck2travel/223658610351",
        "roots": [os.path.join(TESTSETS, "여행 블로그 포스팅")],
        "prompt": ("레퍼런스로 켜 둔 여행 블로그 글처럼, 리소스(여행 블로그 포스팅 / 1번째 포스팅)의 사진으로 "
                   "가오슝 3박 4일 여행 포스팅 한 편을 새로 써 줘. "
                   "레이아웃(질문형 섹션 · 사진 배치와 묶음 · 강조 · 링크 카드)은 레퍼런스를 따라 줘."),
    },
    "blog-retro": {
        "ref_url": "https://m.blog.naver.com/ddubuck2travel/223658610351",
        "roots": [os.path.join(VAULT, "1.🎯(Project) 프로젝트", "🐕망고독 R&D 프로젝트 관리")],
        "prompt": ("레퍼런스로 켜 둔 블로그 글처럼, 리소스(망고독 R&D 프로젝트 자료)를 재료로 기술 블로그 포스트 한 편을 새로 써 줘. "
                   "주제는 '망고독 R&D를 하면서 가장 기억에 남는 순간들' 같은 회고 형식이면 좋겠어. "
                   "사진은 리소스에 있는 스크린샷을 골라서 써 주고, 레이아웃(섹션 구성 · 사진 배치 · 강조 · 링크 카드)은 레퍼런스를 따라 줘."),
    },
}


def _call(method: str, path: str, body: Any = None, timeout: float = 3600) -> Any:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=timeout)


def _ref_for(url: str) -> dict[str, Any]:
    items = json.loads(_call("GET", "/api/reference/items").read())
    items = items.get("items", items) if isinstance(items, dict) else items
    for it in items:
        if it.get("sourceUrl") == url and it.get("status") == "ready":
            return it
    return json.loads(_call("POST", "/api/reference/items/url", {"url": url}).read())


def _id_map(roots: list[str]) -> dict[str, str]:
    data = json.loads((API / "data" / "knowledge" / "resource_ledger" / f"{PROJECT}.json").read_text(encoding="utf-8"))
    out: dict[str, str] = {}

    def walk(x: Any) -> None:
        if isinstance(x, dict):
            p = x.get("pathOrUrl") or ""
            if p and not x.get("children") and any(p.startswith(r) for r in roots) and os.path.isfile(p):
                out[p] = x["id"]
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(data)
    return out


def run(sc: dict[str, Any], model: str) -> dict[str, Any]:
    ref = _ref_for(sc["ref_url"])
    id_map = _id_map(sc["roots"])
    payload = {"roots": [{"id": "", "path": r, "title": os.path.basename(r)} for r in sc["roots"]], "files": [], "idMap": id_map}
    wb = {"projectId": PROJECT, "docId": None, "scope": {"mode": "doc"}, "references": [{"refId": ref["refId"], "title": ref["title"]}]}
    ctx = [{"kind": "workbench", "id": "wb:state", "label": "작업대", "content": json.dumps(wb, ensure_ascii=False)},
           {"kind": "resource-mount", "id": "rm:checked-resources", "label": "리소스", "content": json.dumps(payload, ensure_ascii=False)}]
    sess = {"model": model} if model else {}
    sid = json.loads(_call("POST", "/api/assistant/sessions", sess).read())["sessionId"]
    started = time.time()
    events: list[dict[str, Any]] = []
    with _call("POST", f"/api/assistant/sessions/{sid}/messages", {"text": sc["prompt"], "contexts": ctx, "tools": [], **sess}) as resp:
        for raw in resp:
            line = raw.decode("utf-8", "replace").strip()
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    seconds = int(time.time() - started)
    state = json.loads((API / "state" / "assistant" / "workspace" / "workbench.json").read_text(encoding="utf-8")).get(sid) or {}
    try:
        _call("DELETE", f"/api/assistant/sessions/{sid}", timeout=30)
    except Exception:  # noqa: BLE001
        pass
    tools = [str(e.get("name")) for e in events if e.get("type") == "agent_tool" and e.get("name")]
    return {"sid": sid, "ref": ref, "docId": state.get("docId"), "seconds": seconds, "tools": tools, "ids": set(id_map.values()),
            "answer": "".join(e.get("text", "") for e in events if e.get("type") == "text_delta")}


def score(res: dict[str, Any]) -> dict[str, Any]:
    checks: dict[str, Any] = {}
    doc = json.loads(_call("GET", f"/api/documents/{res['docId']}").read())["document"] if res.get("docId") else None
    blocks = [b for p in (doc or {}).get("pages", []) for b in p.get("blocks", [])]
    checks["built"] = bool(doc and (doc.get("origin") or {}).get("createdBy") == "agent" and blocks)
    slots = (doc or {}).get("slots", {})
    srcs = []
    for b in blocks:
        for key in ("src", "thumbnail", "image"):
            if b.get(key):
                srcs.append(b[key])
        srcs += [c["image"]["src"] for c in b.get("columns") or [] if isinstance(c, dict) and c.get("image")]
    checks["sourced"] = all(s.startswith("resource:") and s[9:] in res["ids"] for s in srcs) and bool(srcs)
    for b in blocks:
        sid = b.get("slotId") or b.get("titleSlotId")
        html = (slots.get(sid) or {}).get("content", "") if sid else ""
        b["text"] = html_to_text(html)
        b["html"] = f"<h2>{b['text']}</h2>" if b.get("kind") == "heading" else html
    mine = patterns.measure_layout(blocks)
    ref_dir = API / "data" / "knowledge" / "references" / "items" / res["ref"]["refId"]
    stored = json.loads((ref_dir / "layers.json").read_text(encoding="utf-8"))
    theirs = stored.get("metrics") or {}
    # 리듬: 레퍼런스 섹션의 고정점(소제목 → 사진으로 열기 · 링크 카드로 맺기)을 비슷한 비율로 지키는가
    checks["rhythm"] = all(
        abs(float(mine.get(k) or 0) - float(theirs.get(k) or 0)) <= 0.3 for k in ("photo_first_ratio", "link_end_ratio"))
    near = total = 0
    counts = patterns.count_metrics()
    for layer in patterns.layer_set(stored.get("set") or "blog"):
        for key in layer.get("metrics") or []:
            if key in counts:
                continue
            a, b = theirs.get(key), mine.get(key)
            if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and key in mine:
                total += 1
                near += int(max(abs(a), abs(b)) == 0 or abs(a - b) / max(abs(a), abs(b)) <= 0.3)
    checks["layers"] = round(near / max(1, total), 2)
    extraction = json.loads((ref_dir / "extraction.json").read_text(encoding="utf-8"))
    ref_heads = {b.get("text") for b in extraction.get("blocks", []) if b.get("kind") == "heading"}
    my_text = " ".join(str(s.get("content") or "") for s in slots.values())
    checks["no_leak"] = not any(h and len(h) > 8 and h in my_text for h in ref_heads)
    checks["checked"] = any(t.endswith("dc_check") for t in res["tools"])
    return {"checks": checks, "mine": {k: mine.get(k) for k in ("photo_signature", "sections", "photos", "link_cards", "highlight_per_para")}}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="compose")
    ap.add_argument("--model", default="")
    ap.add_argument("--scenario", default="blog-retro", choices=sorted(SCENARIOS))
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    res = run(SCENARIOS[args.scenario], args.model)
    result = score(res)
    out = HERE / "results" / f"{args.label}-{time.strftime('%Y%m%d-%H%M%S')}"
    out.mkdir(parents=True, exist_ok=True)
    (out / "result.json").write_text(json.dumps({**result, "docId": res["docId"], "seconds": res["seconds"], "tools": res["tools"],
                                                  "answer": res["answer"]}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({**result, "docId": res["docId"], "seconds": res["seconds"]}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
