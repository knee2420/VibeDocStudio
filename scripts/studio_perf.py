"""스튜디오 화면 성능 측정 (헤드리스 Chrome, 1920x1080).

앱 안의 `window.__studioPerf` 프로브(`apps/studio/src/app/perfProbe.ts`)를 돌려 문서 전환 · 줌 · 슬롯 커밋 ·
부팅 시간을 잰다. 데스크톱 앱 브라우저 패널처럼 가려진 창은 렌더러가 백그라운드 우선순위로 떨어져 숫자가
몇 배씩 흔들리므로, 측정은 이 스크립트로 한다.

사용:
  python scripts/studio_perf.py                      # 개발 서버 (http://localhost:5180)
  python scripts/studio_perf.py --runs 5            # 프로덕션 빌드: 개발 서버를 끄고
      pnpm --filter @vibe/studio exec vite build && pnpm --filter @vibe/studio exec vite preview --port 5180
      (API CORS 가 5180 만 허용하므로 미리보기도 5180 에서 띄운다)
  python scripts/studio_perf.py --cpu 4             # CPU 4배 느리게 (느린 노트북 흉내)
  python scripts/studio_perf.py --profile switch    # 문서 전환을 JS 프로파일러로 (개발 서버만)

필요: API 서버(8090)와 스튜디오 서버가 떠 있어야 한다. `pip install playwright` (시스템 Chrome 사용).
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys

from playwright.sync_api import sync_playwright


def summarize(runs: list[dict]) -> dict:
    """여러 번 돈 결과를 항목별 중앙값으로 접는다."""

    def med(path: list[str]):
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

    first = runs[0]
    zoom_steps = (first.get("zoom") or {}).get("steps") or {}
    return {
        "env": first.get("env"),
        "boot": {
            "readyMs": med(["boot", "readyMs"]),
            "allDocsLoadedMs": med(["boot", "allDocsLoadedMs"]),
            "docRequests": med(["boot", "docRequests"]),
            "docKB": med(["boot", "docKB"]),
            "autosavePayloadKB": med(["boot", "autosavePayloadKB"]),
        },
        # paint = 다음 화면이 그려질 때까지 (사용자 체감) · total = 커밋 + 강제 레이아웃까지
        "switchWarmPaintMs": {k: med(["switch", "warmPaintMedianMs", k]) for k in ("small", "mid", "large")},
        "switchColdPaintMs": {k: med(["switch", "coldPaintMs", k]) for k in ("small", "mid", "large")},
        "switchWarmTotalMs": {k: med(["switch", "warmMedianMs", k]) for k in ("small", "mid", "large")},
        "zoomMs": {
            step: {
                "sync": med(["zoom", "steps", step, "sync"]),
                "total": med(["zoom", "steps", step, "total"]),
                "paint": med(["zoom", "steps", step, "paint"]),
            }
            for step in zoom_steps
        },
        "slotCommitMs": {
            "sync": med(["slotCommit", "medianSyncMs"]),
            "total": med(["slotCommit", "medianMs"]),
            "paint": med(["slotCommit", "medianPaintMs"]),
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5180")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--cpu", type=float, default=1.0, help="CPU 스로틀 배수 (1 = 그대로)")
    ap.add_argument("--raw", action="store_true", help="요약 대신 원본 결과 전부 출력")
    ap.add_argument("--profile", choices=["switch", "zoom", "slotCommit"], help="측정 대신 시나리오 하나를 JS 프로파일러로 (개발 서버만)")
    args = ap.parse_args()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            channel="chrome",
            headless=True,
            args=["--disable-renderer-backgrounding", "--disable-background-timer-throttling"],
        )
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        if args.cpu != 1.0:
            cdp = page.context.new_cdp_session(page)
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": args.cpu})
        sep = "&" if "?" in args.url else "?"
        page.goto(f"{args.url}{sep}phase=drafting&zoom=project-root&perf", wait_until="load", timeout=120_000)
        page.wait_for_function("() => !!window.__studioPerf && window.__studioDocStore?.getState().docs.length > 0", timeout=120_000)
        page.wait_for_timeout(3000)  # 부팅 뒤 백그라운드 작업(리소스 · 덱 로딩)이 가라앉게
        if args.profile:
            page.evaluate("() => window.__studioPerf.runAll()")  # 한 번 데워 둔다
            prof = page.evaluate(f"() => window.__studioPerf.profile('{args.profile}', 45)")
            browser.close()
            if "error" in prof:
                print(prof["error"])
                return 1
            print(f"samples: {prof.get('samples')}")
            print("--- self ---")
            print("\n".join(prof.get("self", [])))
            print("--- total ---")
            print("\n".join(prof.get("total", [])))
            return 0
        runs = []
        for _ in range(args.runs):
            runs.append(page.evaluate("() => window.__studioPerf.runAll()"))
        browser.close()

    out = runs if args.raw else summarize(runs)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
