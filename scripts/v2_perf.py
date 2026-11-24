"""playground v2 화면 성능 측정 (헤드리스 Chrome, 1920x1080).

앱 안의 `window.__v2Perf` 프로브(`apps/playground/src/mocks/v2-ide/ui/perfProbe.ts`)를 돌려 문서 열기 · 블록 선택 ·
호버 · 바깥 쓰기(다른 창 · AI) · 탐색기 펼치기 · 멀티 선택을 잰다. 데스크톱 앱 브라우저 패널처럼 가려진 창은
숫자가 몇 배씩 흔들리므로 측정은 이 스크립트로 한다.

쓰기 측정은 메모리 볼트에서만 한다: API(8090)를 띄우지 않은 상태로 재면 앱이 메모리 볼트로 떨어진다.
측정 문서는 디스크 볼트의 .vdoc 를 읽어 메모리 볼트 `__perf__/` 에 넣는다 (디스크 파일은 건드리지 않는다).

사용:
  python scripts/v2_perf.py                                   # 개발 서버 http://localhost:5181
  python scripts/v2_perf.py --runs 5 --cpu 4 --out out.json  # CPU 4배 느리게
  python scripts/v2_perf.py --doc "<볼트 상대 경로.vdoc>"
필요: playground 서버(5181). `pip install playwright` (시스템 Chrome 사용).
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VAULT = os.path.join(ROOT, "apps", "playground", "data", "vaults", "default-vault")
DEFAULT_DOC = "05. AI Eval/[입찰 공고서] 차세대 지식 근거형 AI 문서 스캐폴딩 엔진 구축 사업 제안요청서.vdoc"


def collect_ids(node, out: set[str]) -> None:
    """블록 · 칸 · 표 하위 노드 id 를 모은다 (복제할 때 겹치지 않게 바꾼다)."""
    if isinstance(node, dict):
        for k, v in node.items():
            if isinstance(v, str) and (k.endswith("Id") or k == "id") and k not in ("docId", "pageId"):
                out.add(v)
            else:
                collect_ids(v, out)
    elif isinstance(node, list):
        for v in node:
            collect_ids(v, out)


def scale_doc(raw: str, times: int) -> str:
    """쪽을 times 배로 늘린 측정용 문서 (id 는 접미사로 겹치지 않게)."""
    if times <= 1:
        return raw
    doc = json.loads(raw)
    pages, slots = doc["pages"], doc["slots"]
    out_pages, out_slots = list(pages), dict(slots)
    for k in range(1, times):
        for page in pages:
            ids: set[str] = set()
            collect_ids(page["blocks"], ids)
            text = json.dumps(page, ensure_ascii=False)
            for i in sorted(ids, key=len, reverse=True):
                text = text.replace(f'"{i}"', f'"{i}__x{k}"')
            text = text.replace(f'"{page["pageId"]}"', f'"{page["pageId"]}__x{k}"', 1)
            out_pages.append(json.loads(text))
            for i in ids:
                if i in slots:
                    out_slots[f"{i}__x{k}"] = {**slots[i], "slotId": f"{i}__x{k}"}
    doc["pages"], doc["slots"] = out_pages, out_slots
    return json.dumps(doc, ensure_ascii=False)


def med(runs: list[dict], path: list[str]):
    vals = []
    for r in runs:
        cur = r
        for key in path:
            cur = cur.get(key) if isinstance(cur, dict) else None
            if cur is None:
                break
        if isinstance(cur, (int, float)):
            vals.append(cur)
    return round(statistics.median(vals), 1) if vals else None


def summarize(runs: list[dict]) -> dict:
    first = runs[0]
    out = {"env": first.get("env"), "doc": first.get("doc"), "runs": len(runs)}
    for key in ("openCold", "explorerExpandAll", "explorerCollapseAll", "multiSelect50", "multiClear"):
        if key in first:
            out[key] = {k: med(runs, [key, k]) for k in ("ms", "paintMs", "mutations")}
    for key in ("selectBlock", "hover", "externalSlotWrite"):
        if key in first:
            out[key] = {k: med(runs, [key, k]) for k in ("medianMs", "p95Ms", "medianPaintMs", "medianMutations")}
    for key in ("renderedBlocks", "explorerRows", "heapMB"):
        out[key] = med(runs, [key])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5181/v2-ide")
    ap.add_argument("--doc", default=DEFAULT_DOC)
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--cpu", type=float, default=1)
    ap.add_argument("--scale", type=int, default=5, help="쪽을 몇 배로 늘려 잴지 (큰 문서)")
    ap.add_argument("--out")
    args = ap.parse_args()

    with open(os.path.join(VAULT, args.doc), encoding="utf-8") as fh:
        raw = scale_doc(fh.read(), args.scale)

    runs: list[dict] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True, args=["--enable-precise-memory-info"])
        for i in range(args.runs):
            ctx = browser.new_context(viewport={"width": 1920, "height": 1080})
            page = ctx.new_page()
            if args.cpu > 1:
                cdp = ctx.new_cdp_session(page)
                cdp.send("Emulation.setCPUThrottlingRate", {"rate": args.cpu})
            sep = "&" if "?" in args.url else "?"
            page.goto(f"{args.url}{sep}perf", wait_until="load", timeout=120_000)
            page.wait_for_function("() => !!window.__v2Perf && window.__v2Perf.ready()", timeout=120_000)
            path =page.evaluate("([n, r]) => window.__v2Perf.seed(n, r)", ["large.vdoc", raw])
            res = page.evaluate("(p) => window.__v2Perf.runAll({ docPath: p })", path)
            print(f"run {i + 1}: open {res['openCold']['ms']:.0f}ms · select {res['selectBlock']['medianMs']}ms", file=sys.stderr)
            runs.append(res)
            ctx.close()
        browser.close()

    summary = summarize(runs)
    text = json.dumps({"summary": summary, "runs": runs}, ensure_ascii=False, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
