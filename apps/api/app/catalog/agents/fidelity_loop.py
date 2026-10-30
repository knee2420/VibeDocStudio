"""PDF → .vdoc 시각 일치 개선 루프의 도메인 도구 묶음.

`external_pm_08_visual_fidelity_replicator` 스킬의 절차를 CLI 에이전트가 따르도록
도구로 감싼다. 판정은 스킬 도구(`.agents/tools/visual_fidelity/01·02·03`)가 내린다.

    01_extract_pdf_truth   원본 PDF → truth.json            (시작할 때 호스트가 한 번)
    evaluate               tune 적용 → 디버그 크롬 탭에 주입 → 02 로 재기 → 03 으로 판정
    update_tune            생성기 보정값(tune.json)만 바꾼다. 코드·문서 JSON 을 손으로 고치지 않는다 (스킬 규칙 3)
    finish                 끝. 보고 숫자는 LLM 이 아니라 마지막 03 결과에서 호스트가 채운다 (스킬 규칙 4)

산출물은 전부 `<run_dir>/fidelity/iter_NN/` 에 남는다.
"""
from __future__ import annotations

import copy
import json
import logging
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

from agent_core.react import RunTrace, Tool, ToolRegistry, ToolResult

logger = logging.getLogger(__name__)

PAGE_SELECTOR = "section[id^='vdoc-page-'] > div.bg-white"

# --- 보정값(tune) ---------------------------------------------------------------
# 값이 None 이면 생성기가 낸 값을 그대로 둔다. 기본값은 생성기 출력과 같아서
# 기본 tune 으로 만든 문서는 보정 전 문서와 동일하다.

TUNABLES: dict[str, dict[str, Any]] = {
    "table_placement": {"type": "enum", "values": ["flow", "frame"], "default": "flow",
                        "doc": "표 블록 배치. flow=본문 흐름에 쌓기, frame=PDF 에서 잰 표 상자 좌표에 고정"},
    "page_margin_top": {"type": "number", "range": [0, 200], "default": None, "doc": "쪽 위 여백 px (flow 배치 블록의 시작 y)"},
    "page_margin_left": {"type": "number", "range": [0, 200], "default": None, "doc": "쪽 왼쪽 여백 px"},
    "page_margin_right": {"type": "number", "range": [0, 200], "default": None, "doc": "쪽 오른쪽 여백 px"},
    "block_gap": {"type": "number", "range": [0, 60], "default": None, "doc": "flow 블록 사이 간격 px"},
    "cell_padding_x": {"type": "number", "range": [0, 16], "default": 6, "doc": "표 셀 좌우 안쪽 여백 px"},
    "cell_padding_y": {"type": "number", "range": [0, 16], "default": 3, "doc": "표 셀 위아래 안쪽 여백 px"},
    "cell_font_px": {"type": "number", "range": [8, 24], "default": 13.44, "doc": "표 셀 글자 크기 px (PDF pt × 96/72)"},
    "title_font_px": {"type": "number", "range": [12, 40], "default": 24, "doc": "표 안 제목 셀 글자 크기 px"},
    "cell_line_height": {"type": "number", "range": [0.8, 2.0], "default": 1.2, "doc": "표 셀 줄 높이 배수"},
    "row_height_scale": {"type": "number", "range": [0.5, 1.5], "default": 1.0, "doc": "표 행 높이 배율 (PDF 에서 잰 높이 × 배율)"},
    "header_h_align": {"type": "enum", "values": ["left", "center", "right"], "default": "center", "doc": "머리 셀 가로 정렬"},
    "header_v_align": {"type": "enum", "values": ["top", "middle", "bottom"], "default": "middle", "doc": "머리 셀 세로 정렬"},
    "body_h_align": {"type": "enum", "values": ["left", "center", "right"], "default": "left", "doc": "값 셀 가로 정렬"},
    "body_v_align": {"type": "enum", "values": ["top", "middle", "bottom"], "default": "top", "doc": "값 셀 세로 정렬"},
    "text_block_dy": {"type": "number", "range": [-40, 40], "default": 0, "doc": "frame 이 있는 글 블록 전체를 세로로 미는 px"},
}


def default_tune() -> dict[str, Any]:
    return {k: spec["default"] for k, spec in TUNABLES.items()}


def validate_tune_changes(changes: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    accepted: dict[str, Any] = {}
    errors: list[str] = []
    for key, value in changes.items():
        spec = TUNABLES.get(key)
        if spec is None:
            errors.append(f"모르는 보정 키 '{key}'")
            continue
        if value is None:
            accepted[key] = None
            continue
        if spec["type"] == "enum":
            if value not in spec["values"]:
                errors.append(f"{key}={value!r} 는 {spec['values']} 중 하나여야 함")
                continue
            accepted[key] = value
        else:
            try:
                num = float(value)
            except (TypeError, ValueError):
                errors.append(f"{key}={value!r} 는 숫자여야 함")
                continue
            lo, hi = spec["range"]
            if not lo <= num <= hi:
                errors.append(f"{key}={num} 는 [{lo}, {hi}] 범위 밖")
                continue
            accepted[key] = round(num, 3)
    return accepted, errors


def apply_tune(vdoc: dict[str, Any], tune: dict[str, Any]) -> dict[str, Any]:
    """생성기가 낸 문서에 보정값을 입힌 사본을 돌려준다."""
    doc = copy.deepcopy(vdoc)
    pad = f"{tune['cell_padding_y']}px {tune['cell_padding_x']}px"
    for page in doc.get("pages", []):
        layout = page.setdefault("layout", {})
        margin = layout.setdefault("margin", {})
        for side in ("top", "left", "right"):
            override = tune.get(f"page_margin_{side}")
            if override is not None:
                margin[side] = override
        if tune.get("block_gap") is not None:
            layout["blockGap"] = tune["block_gap"]

        for block in page.get("blocks", []):
            if block.get("kind") == "structured-table":
                box = block.get("sourceBox")
                if tune["table_placement"] == "frame" and box:
                    block["frame"] = dict(box)
                else:
                    block.pop("frame", None)
                for row in block.get("rows", []):
                    height = str(row.get("height", "")).removesuffix("px")
                    try:
                        row["height"] = f"{round(float(height) * tune['row_height_scale'], 2)}px"
                    except ValueError:
                        pass
                    for cell in row.get("cells", []):
                        is_title = cell.get("fontSize") == "24px"
                        cell["padding"] = pad
                        cell["lineHeight"] = str(tune["cell_line_height"])
                        cell["fontSize"] = f"{tune['title_font_px' if is_title else 'cell_font_px']}px"
                        if is_title:
                            continue
                        if cell.get("isHeader"):
                            cell["hAlign"], cell["vAlign"] = tune["header_h_align"], tune["header_v_align"]
                        else:
                            cell["hAlign"], cell["vAlign"] = tune["body_h_align"], tune["body_v_align"]
            elif block.get("frame") and tune["text_block_dy"]:
                block["frame"]["y"] = round(block["frame"]["y"] + tune["text_block_dy"], 2)
    return doc


# --- 디버그 크롬(CDP) -----------------------------------------------------------


class CdpTab:
    """디버그 크롬에 측정 전용 탭을 하나 띄워 문서를 주입한다. 사용자의 편집 탭은 건드리지 않는다."""

    def __init__(self, cdp_http: str, target: dict[str, Any]) -> None:
        import websocket  # websocket-client

        self._cdp_http = cdp_http
        self.target_id = target["id"]
        self._ws = websocket.create_connection(target["webSocketDebuggerUrl"], suppress_origin=True, timeout=30)
        self._msg_id = 0

    @classmethod
    def open(cls, cdp_http: str, url: str) -> "CdpTab":
        req = urllib.request.Request(f"{cdp_http}/json/new?{urllib.parse.quote(url, safe=':/?=&')}", method="PUT")
        with urllib.request.urlopen(req, timeout=10) as res:
            target = json.loads(res.read())
        return cls(cdp_http, target)

    def call(self, method: str, **params: Any) -> dict[str, Any]:
        self._msg_id += 1
        my_id = self._msg_id
        self._ws.send(json.dumps({"id": my_id, "method": method, "params": params}))
        while True:
            msg = json.loads(self._ws.recv())
            if msg.get("id") == my_id:
                if "error" in msg:
                    raise RuntimeError(f"CDP {method}: {msg['error']}")
                return msg.get("result", {})

    def evaluate(self, expression: str) -> Any:
        res = self.call("Runtime.evaluate", expression=expression, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in res:
            raise RuntimeError(f"JS 예외: {res['exceptionDetails'].get('text')}")
        return res.get("result", {}).get("value")

    def wait_for(self, expression: str, *, timeout: float, interval: float = 0.25) -> Any:
        deadline = time.monotonic() + timeout
        last: Any = None
        while time.monotonic() < deadline:
            try:
                last = self.evaluate(expression)
            except Exception:
                last = None
            if last:
                return last
            time.sleep(interval)
        raise TimeoutError(f"{timeout}s 안에 조건을 만족하지 못함: {expression[:120]}")

    def close(self) -> None:
        try:
            self._ws.close()
        finally:
            try:
                urllib.request.urlopen(f"{self._cdp_http}/json/close/{self.target_id}", timeout=5).read()
            except Exception:
                pass


# --- 작업 공간 + 도구 -----------------------------------------------------------


@dataclass
class FidelityConfig:
    tools_dir: Path
    cdp_http: str = "http://127.0.0.1:9222"
    studio_url: str = "http://localhost:5180/"
    python_exe: str = sys.executable
    target_score: float = 95.0
    tol_pos: float = 1.0


@dataclass
class Iteration:
    index: int
    tune: dict[str, Any]
    out_dir: Path
    verdict: Optional[str] = None
    score: Optional[float] = None
    summary: dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


def _run_tool(cmd: list[str], *, timeout: int) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, env=env)


class FidelityWorkspace:
    """실행 한 건의 정답·보정값·반복 결과를 들고 있는 상태."""

    def __init__(
        self,
        *,
        run_id: str,
        run_dir: Path,
        pdf_path: Path,
        build_vdoc: Callable[[], dict[str, Any]],
        trace: RunTrace,
        config: FidelityConfig,
    ) -> None:
        self.run_id = run_id
        self.dir = run_dir / "fidelity"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.pdf_path = pdf_path
        self._build_vdoc = build_vdoc
        self._trace = trace
        self.cfg = config
        self.tune = default_tune()
        self.iterations: list[Iteration] = []
        self.truth_path = self.dir / "truth.json"
        self.truth_summary: dict[str, Any] = {}
        self._page_text = ""

    # --- 01 정답 -------------------------------------------------------------

    def extract_truth(self) -> dict[str, Any]:
        cmd = [self.cfg.python_exe, str(self.cfg.tools_dir / "01_extract_pdf_truth.py"),
               "--pdf", str(self.pdf_path), "--page", "1", "--out-dir", str(self.dir)]
        t0 = time.monotonic()
        proc = _run_tool(cmd, timeout=180)
        (self.dir / "01_stdout.txt").write_text(proc.stdout + "\n--- stderr ---\n" + proc.stderr, encoding="utf-8")
        self._trace.event("tool_exec", tool="01_extract_pdf_truth", cmd=cmd, exit_code=proc.returncode,
                          duration_s=round(time.monotonic() - t0, 2), stdout_tail=proc.stdout[-1500:], stderr_tail=proc.stderr[-800:])
        if proc.returncode != 0 or not self.truth_path.exists():
            raise RuntimeError(f"01_extract_pdf_truth 실패 (code={proc.returncode}): {proc.stderr[-500:]}")
        truth = json.loads(self.truth_path.read_text(encoding="utf-8"))
        spans = truth.get("spans", [])
        sizes: dict[str, int] = {}
        for s in spans:
            sizes[str(s.get("pt"))] = sizes.get(str(s.get("pt")), 0) + 1
        self._page_text = max(spans, key=lambda s: s.get("pt", 0)).get("text", "") if spans else ""
        self.truth_summary = {
            "page": truth.get("page"),
            "page_layout": truth.get("page_layout"),
            "spans_total": len(spans),
            "spans_by_pt": sizes,
            "rules": len(truth.get("rules", [])),
            "images": len(truth.get("images", [])),
            "first_spans": [{"text": s.get("text"), "x": s.get("x"), "y": s.get("y"), "pt": s.get("pt")} for s in spans[:12]],
            "tool_stdout": proc.stdout.strip()[-1200:],
        }
        return self.truth_summary

    # --- 생성 → 주입 → 02 → 03 ------------------------------------------------

    def _render_in_browser(self, vdoc: dict[str, Any]) -> str:
        """측정 탭을 열어 문서를 주입하고, 02 가 찾을 탭 URL 조각을 돌려준다."""
        marker = f"fidelity_run={self.run_id}"
        url = f"{self.cfg.studio_url}?{marker}"
        tab = CdpTab.open(self.cfg.cdp_http, url)
        self._tab = tab
        # 앱이 처음 띄우는 문서를 다 그린 뒤에 주입해야 초기 로딩이 활성 문서를 되돌리지 않는다.
        tab.wait_for(f"!!window.__studioDocStore && !!document.querySelector({json.dumps(PAGE_SELECTOR)})", timeout=30)
        inject = (
            "(() => { const doc = %s; const store = window.__studioDocStore;"
            " if (store.getState().activeDocId !== doc.docId) store.getState().upsertDocument(doc);"
            " return store.getState().activeDocId; })()" % json.dumps(vdoc, ensure_ascii=False)
        )
        injected = tab.evaluate(inject)
        if injected != vdoc["docId"]:
            raise RuntimeError(f"문서 주입 실패: activeDocId={injected!r}")
        page_ready = (
            "(() => { const p = document.querySelector(%s); return !!p && p.innerText.includes(%s); })()"
            % (json.dumps(PAGE_SELECTOR), json.dumps(self._page_text[:12]))
        )
        try:
            tab.wait_for(page_ready, timeout=10)
        except TimeoutError:
            tab.evaluate(inject)  # 늦게 끝난 초기 로딩이 덮어쓴 경우 한 번 더
            tab.wait_for(page_ready, timeout=15)
        tab.evaluate("document.fonts.ready.then(() => true)")
        time.sleep(0.8)
        return marker

    def evaluate(self) -> Iteration:
        it = Iteration(index=len(self.iterations), tune=dict(self.tune), out_dir=self.dir / f"iter_{len(self.iterations):02d}")
        it.out_dir.mkdir(parents=True, exist_ok=True)
        self.iterations.append(it)
        (it.out_dir / "tune.json").write_text(json.dumps(it.tune, ensure_ascii=False, indent=2), encoding="utf-8")

        vdoc = apply_tune(self._build_vdoc(), it.tune)
        vdoc["docId"] = f"{vdoc['docId']}-fid{it.index:02d}"
        (it.out_dir / "candidate.vdoc.json").write_text(json.dumps(vdoc, ensure_ascii=False, indent=2), encoding="utf-8")

        self._tab: Optional[CdpTab] = None
        try:
            marker = self._render_in_browser(vdoc)
            measure_cmd = [
                self.cfg.python_exe, str(self.cfg.tools_dir / "02_measure_browser_page.py"),
                "--truth", str(self.truth_path), "--out-dir", str(it.out_dir), "--cdp", self.cfg.cdp_http,
                "--target-url-contains", marker, "--page-selector", PAGE_SELECTOR,
                "--page-text", self._page_text[:12], "--hide-selector", f"{PAGE_SELECTOR} button",
            ]
            t0 = time.monotonic()
            m = _run_tool(measure_cmd, timeout=120)
            (it.out_dir / "02_stdout.txt").write_text(m.stdout + "\n--- stderr ---\n" + m.stderr, encoding="utf-8")
            self._trace.event("tool_exec", tool="02_measure_browser_page", iteration=it.index, cmd=measure_cmd,
                              exit_code=m.returncode, duration_s=round(time.monotonic() - t0, 2),
                              stdout_tail=m.stdout[-1200:], stderr_tail=m.stderr[-600:])
            if m.returncode != 0 or not (it.out_dir / "measure.json").exists():
                raise RuntimeError(f"02 측정 실패 (code={m.returncode}): {(m.stderr or m.stdout)[-400:]}")
        except Exception as exc:
            it.error = f"{type(exc).__name__}: {exc}"
            return it
        finally:
            if self._tab is not None:
                self._tab.close()

        verify_cmd = [
            self.cfg.python_exe, str(self.cfg.tools_dir / "03_verify_fidelity.py"),
            "--truth", str(self.truth_path), "--measure", str(it.out_dir / "measure.json"),
            "--tol-pos", str(self.cfg.tol_pos),
            "--json", str(it.out_dir / "verify.json"), "--diff", str(it.out_dir / "diff.png"),
        ]
        t0 = time.monotonic()
        v = _run_tool(verify_cmd, timeout=120)
        (it.out_dir / "03_stdout.txt").write_text(v.stdout + "\n--- stderr ---\n" + v.stderr, encoding="utf-8")
        self._trace.event("tool_exec", tool="03_verify_fidelity", iteration=it.index, cmd=verify_cmd,
                          exit_code=v.returncode, duration_s=round(time.monotonic() - t0, 2),
                          stdout_tail=v.stdout[-1500:], stderr_tail=v.stderr[-600:])
        verify_path = it.out_dir / "verify.json"
        if not verify_path.exists():
            it.error = f"03 판정 실패 (code={v.returncode}): {(v.stderr or v.stdout)[-400:]}"
            return it
        it.summary = self._summarize_verify(json.loads(verify_path.read_text(encoding="utf-8")), v.stdout)
        it.verdict = it.summary["verdict"]
        it.score = it.summary["span_score"]
        return it

    @staticmethod
    def _summarize_verify(verify: dict[str, Any], stdout: str) -> dict[str, Any]:
        s = verify.get("summary", {})
        total = s.get("spans_total") or 0
        within = s.get("spans_within_tol") or 0
        fails: dict[str, int] = {}
        for f in verify.get("findings", []):
            if f.get("level") == "FAIL":
                fails[f.get("rule", "?")] = fails.get(f.get("rule", "?"), 0) + 1
        worst = sorted(
            (f for f in verify.get("findings", []) if f.get("level") == "FAIL" and f.get("rule") == "F-POS-001"),
            key=lambda f: -max(abs(f.get("dx", 0) or 0), abs(f.get("dy", 0) or 0)),
        )
        span_text = {sp.get("i"): sp.get("text") for sp in verify.get("spans", []) if isinstance(sp, dict)}
        return {
            "verdict": verify.get("verdict"),
            "span_score": round(within / total * 100, 2) if total else 0.0,
            "spans_within_tol": within,
            "spans_total": total,
            "tol_pos": s.get("tol_pos"),
            "mean_abs_dx": s.get("mean_abs_dx"),
            "mean_abs_dy": s.get("mean_abs_dy"),
            "max_err": s.get("max_err"),
            "pixels": s.get("pixels"),
            "noise_floor": s.get("noise_floor"),
            "fail_counts": fails,
            "offset_suggestions_px": verify.get("offset_suggestions_px"),
            "diagnostics": verify.get("diagnostics"),
            "worst_positions": [
                {"span": f.get("span"), "text": span_text.get(f.get("span")), "dx": f.get("dx"), "dx1": f.get("dx1"), "dy": f.get("dy")}
                for f in worst[:10]
            ],
            "other_fails": [
                {"rule": f.get("rule"), "msg": f.get("msg")}
                for f in verify.get("findings", []) if f.get("level") == "FAIL" and f.get("rule") != "F-POS-001"
            ][:6],
            "verdict_line": next((ln.strip() for ln in stdout.splitlines() if "VERDICT" in ln), ""),
        }

    def best(self) -> Optional[Iteration]:
        scored = [it for it in self.iterations if it.score is not None]
        if not scored:
            return None
        return max(scored, key=lambda it: (it.verdict == "PASS", it.score))

    def history(self) -> list[dict[str, Any]]:
        return [
            {"iter": it.index, "verdict": it.verdict, "span_score": it.score, "error": it.error,
             "changed": {k: v for k, v in it.tune.items() if v != TUNABLES[k]["default"]}}
            for it in self.iterations
        ]

    # --- 도구 --------------------------------------------------------------------

    def _iteration_observation(self, it: Iteration) -> dict[str, Any]:
        if it.error:
            return {"iter": it.index, "error": it.error}
        return {"iter": it.index, **it.summary, "target_score": self.cfg.target_score, "history": self.history()}

    def build_tools(self) -> ToolRegistry:
        def get_state(_: dict[str, Any]) -> ToolResult:
            return ToolResult(True, {
                "tune": self.tune,
                "tunables": {k: {kk: vv for kk, vv in spec.items() if kk != "default"} | {"default": spec["default"]} for k, spec in TUNABLES.items()},
                "truth": {k: v for k, v in self.truth_summary.items() if k != "tool_stdout"},
                "history": self.history(),
            })

        def update_tune(args: dict[str, Any]) -> ToolResult:
            changes = args.get("changes")
            if not isinstance(changes, dict) or not changes:
                return ToolResult.fail("args.changes 에 {보정키: 값} 을 넣어야 함")
            accepted, errors = validate_tune_changes(changes)
            before = {k: self.tune[k] for k in accepted}
            self.tune.update(accepted)
            self._trace.event("tune_update", before=before, after=accepted, rejected=errors, reason=args.get("reason"))
            return ToolResult(not errors or bool(accepted), {
                "applied": accepted, "before": before, "rejected": errors,
                "note": "아직 평가 전이다. evaluate 를 불러야 효과를 안다.",
            })

        def evaluate(_: dict[str, Any]) -> ToolResult:
            it = self.evaluate()
            return ToolResult(it.error is None, self._iteration_observation(it),
                              artifacts={"iter_dir": str(it.out_dir)})

        def inspect_findings(args: dict[str, Any]) -> ToolResult:
            target = self.iterations[-1] if self.iterations else None
            if target is None or not (target.out_dir / "verify.json").exists():
                return ToolResult.fail("아직 판정 결과가 없다. evaluate 를 먼저 부른다.")
            verify = json.loads((target.out_dir / "verify.json").read_text(encoding="utf-8"))
            rule = args.get("rule")
            limit = int(args.get("limit", 25))
            rows = [f for f in verify.get("findings", []) if not rule or f.get("rule") == rule]
            return ToolResult(True, {"iter": target.index, "rule": rule, "count": len(rows), "findings": rows[:limit]})

        def finish(args: dict[str, Any]) -> ToolResult:
            best = self.best()
            return ToolResult(True, {
                "agent_summary": args.get("summary", ""),
                "host_verified": None if best is None else {
                    "best_iter": best.index, "verdict": best.verdict, "span_score": best.score,
                    "verify_json": str(best.out_dir / "verify.json"), "verdict_line": best.summary.get("verdict_line"),
                },
                "target_score": self.cfg.target_score,
                "history": self.history(),
            }, terminal=True)

        return ToolRegistry([
            Tool("get_state", "현재 보정값, 바꿀 수 있는 보정 키와 범위, 정답 요약, 반복 이력을 본다", {}, get_state),
            Tool("update_tune", "생성기 보정값을 바꾼다 (평가는 하지 않음). 한 번에 원인 하나만 바꾼다",
                 {"changes": "{보정키: 값} 객체", "reason": "verify 의 어떤 숫자 때문에 바꾸는지"}, update_tune),
            Tool("evaluate", "현재 보정값으로 문서를 만들어 디버그 크롬에 띄우고 02 로 재고 03 으로 판정한다 (약 10~20초)", {}, evaluate),
            Tool("inspect_findings", "마지막 판정의 findings 를 규칙별로 자세히 본다",
                 {"rule": "선택. 예: F-POS-001, F-WRAP-001, F-BLOCK-001", "limit": "선택. 기본 25"}, inspect_findings),
            Tool("finish", "작업을 끝낸다. 목표 점수 도달, 또는 더 나아질 보정이 없을 때",
                 {"summary": "무엇을 바꿨고 무엇이 남았는지 (숫자는 관찰에 있던 것만)"}, finish),
        ])
