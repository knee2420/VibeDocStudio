"""PDF → .vdoc 시각 일치 개선 루프의 도메인 도구 묶음 (CLI 에이전트의 "팔").

`external_pm_08_visual_fidelity_replicator` 스킬의 절차를 CLI 에이전트가 따르도록 도구로 감싼다.
CLI 가 읽는 사용법은 스킬의 `references/cli_loop_guide.md` 에 있다.

    01_extract_pdf_truth   원본 PDF → truth.json (호스트가 시작할 때 한 번, 글꼴 파일과 함께 → 자간 토큰 · F)
    생성기                  truth → 쪽 모델(줄 · 표 격자) → .vdoc (`fidelity_layout`, 결정적)
    evaluate               분할안 + 보정값으로 문서를 만들어 디버그 크롬 탭에 주입 → 02 로 재기 → 03 판정
                           → `fidelity_diagnosis` 가 원인 · L-xx · 처방(바로 실행할 update_tune 인자)을 붙인다
    read_lines/read_tables 원본 PDF 에서 뽑은 줄 · 표 격자 · 글꼴 · 좌표를 본다
    inspect_spans          블록 · 줄 하나를 원본 좌표 vs 그려진 좌표로 자세히 본다
    set_plan               표 밖 글 줄을 블록으로 나누는 분할안과 이름을 바꾼다 (LLM 이 정하는 유일한 구조)
    update_tune            브라우저와 PDF 의 체계적 차이를 미는 보정값만 바꾼다. 좌표를 손으로 고치지 않는다 (스킬 규칙 3)
    finish                 끝. 보고 숫자는 LLM 이 아니라 마지막 03 결과에서 호스트가 채운다 (스킬 규칙 4)

산출물은 전부 `<run_dir>/fidelity/iter_NN/` 에 남는다.
"""
from __future__ import annotations

import base64
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
from harness_kit import packs

from app.form_scaffold.agents.fidelity_diagnosis import diagnose
from app.form_scaffold.agents.fidelity_layout import (
    TUNABLES,
    build_page_model,
    default_plan,
    default_tune,
    line_block_index,
    render_page,
    text_lines,
    validate_plan,
    validate_tune_changes,
)

logger = logging.getLogger(__name__)

PAGE_SELECTOR = "section[id^='vdoc-page-'] > div.bg-white"


def default_font_map(repo_root: Path) -> dict[str, Path]:
    """PDF 글꼴 이름 → 브라우저가 실제로 쓰는 글꼴 파일. 01 이 자간 토큰과 줄 높이 F 를 이 파일로 푼다 (L-03)."""
    studio = repo_root / "apps" / "studio" / "public" / "fonts"
    win = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    pairs = {
        "굴림체": studio / "GulimChe.ttf", "GulimChe": studio / "GulimChe.ttf",
        "굴림": studio / "Gulim.ttf", "Gulim": studio / "Gulim.ttf",
        "돋움": studio / "Dotum.ttf", "Dotum": studio / "Dotum.ttf",
        "DejaVuSans": studio / "DejaVuSans.ttf", "DejaVuSans-Bold": studio / "DejaVuSans-Bold.ttf",
        "TimesNewRoman": win / "times.ttf", "TimesNewRoman,Bold": win / "timesbd.ttf",
        "TimesNewRoman,Italic": win / "timesi.ttf", "TimesNewRomanPSMT": win / "times.ttf",
        "TimesNewRomanPS-BoldMT": win / "timesbd.ttf",
        "Arial": win / "arial.ttf", "Arial,Bold": win / "arialbd.ttf", "ArialMT": win / "arial.ttf",
        "맑은 고딕": win / "malgun.ttf", "MalgunGothic": win / "malgun.ttf",
    }
    return {name: path for name, path in pairs.items() if path.exists()}


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
    min_shift: float = 0.5
    early_exit: bool = True
    mode: str = "balanced"
    #: PDF 글꼴 이름 → 글꼴 파일. 비우면 저장소의 studio 글꼴 + 윈도우 글꼴로 채운다.
    font_map: dict[str, Path] = field(default_factory=dict)


def create_fidelity_config(
    tools_dir: Path,
    mode: str = "balanced",
    cdp_http: str = "http://127.0.0.1:9222",
    studio_url: str = "http://localhost:5180/",
) -> FidelityConfig:
    """모드별 정밀도 및 루프 엄격도 프로파일 생성."""
    m = (mode or "balanced").strip().lower()
    if m == "fast":
        return FidelityConfig(
            tools_dir=tools_dir,
            cdp_http=cdp_http,
            studio_url=studio_url,
            target_score=90.0,
            tol_pos=2.0,
            min_shift=1.0,
            early_exit=True,
            mode="fast",
        )
    elif m == "strict":
        return FidelityConfig(
            tools_dir=tools_dir,
            cdp_http=cdp_http,
            studio_url=studio_url,
            target_score=95.0,
            tol_pos=1.0,
            min_shift=0.5,
            early_exit=False,
            mode="strict",
        )
    # balanced (기본값)
    return FidelityConfig(
        tools_dir=tools_dir,
        cdp_http=cdp_http,
        studio_url=studio_url,
        target_score=95.0,
        tol_pos=1.5,
        min_shift=0.75,
        early_exit=True,
        mode="balanced",
    )



@dataclass
class Iteration:
    index: int
    tune: dict[str, Any]
    plan: dict[str, Any]
    out_dir: Path
    verdict: Optional[str] = None
    score: Optional[float] = None
    summary: dict[str, Any] = field(default_factory=dict)
    diagnosis: dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    changed: str = ""


def _run_tool(cmd: list[str], *, timeout: int) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, env=env)


def _num(v: Any) -> Any:
    return round(v, 2) if isinstance(v, float) else v


class FidelityWorkspace:
    """실행 한 건의 정답 · 쪽 모델 · 분할안 · 보정값 · 반복 결과를 들고 있는 상태."""

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
        if not self.cfg.font_map:
            self.cfg.font_map = default_font_map(self.cfg.tools_dir.parents[2])
        self.tune = default_tune()
        self.plan: dict[str, Any] = {"blocks": [], "table_titles": {}}
        self.iterations: list[Iteration] = []
        self.truth_path = self.dir / "truth.json"
        self.truth: dict[str, Any] = {}
        self.model: dict[str, Any] = {}
        self.truth_summary: dict[str, Any] = {}
        self._page_text = ""
        self._image_srcs: dict[int, str] = {}
        self._pending_change = "기본 분할안 · 기본 보정값"

    # --- 01 정답 + 쪽 모델 ------------------------------------------------------

    def extract_truth(self) -> dict[str, Any]:
        cmd = [self.cfg.python_exe, str(self.cfg.tools_dir / "01_extract_pdf_truth.py"),
               "--pdf", str(self.pdf_path), "--page", "1", "--out-dir", str(self.dir)]
        for name, path in self.cfg.font_map.items():
            cmd += ["--font", f"{name}={path}"]
        t0 = time.monotonic()
        proc = _run_tool(cmd, timeout=180)
        (self.dir / "01_stdout.txt").write_text(proc.stdout + "\n--- stderr ---\n" + proc.stderr, encoding="utf-8")
        self._trace.event("tool_exec", tool="01_extract_pdf_truth", cmd=cmd, exit_code=proc.returncode,
                          duration_s=round(time.monotonic() - t0, 2), stdout_tail=proc.stdout[-1500:], stderr_tail=proc.stderr[-800:])
        if proc.returncode != 0 or not self.truth_path.exists():
            raise RuntimeError(f"01_extract_pdf_truth 실패 (code={proc.returncode}): {proc.stderr[-500:]}")
        self.truth = json.loads(self.truth_path.read_text(encoding="utf-8"))
        self.model = build_page_model(self.truth)
        self.plan = default_plan(self.model)
        (self.dir / "page_model.json").write_text(json.dumps(self.model, ensure_ascii=False, indent=1), encoding="utf-8")
        self._image_srcs = self._extract_images()

        spans = self.truth.get("spans", [])
        biggest = max(spans, key=lambda s: (s.get("pt", 0), len(s.get("text", "")))) if spans else {}
        self._page_text = max(biggest.get("text", "").split(), key=len, default="")
        sizes: dict[str, int] = {}
        for s in spans:
            sizes[str(s.get("pt"))] = sizes.get(str(s.get("pt")), 0) + 1
        no_tokens = sum(1 for s in spans if not s.get("tokens"))
        self.truth_summary = {
            "page": self.truth.get("page"),
            "content_box": self.model["content_box"],
            "spans_total": len(spans),
            "spans_by_pt": sizes,
            "fonts": sorted({ln["font"] for ln in self.model["lines"]}),
            "font_F": self.model["fonts_f"],
            "spans_without_tokens": no_tokens,
            "lines_total": len(self.model["lines"]),
            "text_lines": len(text_lines(self.model)),
            "tables": [{"id": t["id"], "rows": len(t["row_ys"]) - 1, "cols": len(t["col_xs"]) - 1, "cells": len(t["cells"]),
                        "box": [t["x"], t["y"], t["x1"], t["y1"]]} for t in self.model["tables"]],
            "images": len(self.model["images"]),
            "warnings": sorted(set(self.truth.get("warnings", [])))[:6],
        }
        return self.truth_summary

    def _extract_images(self) -> dict[int, str]:
        """PDF 그림을 data URI 로. truth 의 images 와 같은 순서 (page.get_image_info)."""
        try:
            import pymupdf
        except ImportError:
            return {}
        out: dict[int, str] = {}
        try:
            doc = pymupdf.open(self.pdf_path)
            page = doc[0]
            for k, info in enumerate(page.get_image_info(xrefs=True)):
                png: Optional[bytes] = None
                xref = info.get("xref") or 0
                if xref:
                    try:
                        pix = pymupdf.Pixmap(doc, xref)
                        if pix.n - pix.alpha >= 4:
                            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                        png = pix.tobytes("png")
                    except Exception:
                        png = None
                if png is None:
                    png = page.get_pixmap(clip=pymupdf.Rect(info["bbox"]), matrix=pymupdf.Matrix(2, 2)).tobytes("png")
                out[k] = "data:image/png;base64," + base64.b64encode(png).decode("ascii")
        except Exception as exc:
            logger.warning("[fidelity] 그림 추출 실패: %s", exc)
        return out

    # --- 생성 -------------------------------------------------------------------

    def render(self, plan: dict[str, Any], tune: dict[str, Any], *, doc_id_suffix: str = "") -> dict[str, Any]:
        """현재 분할안 · 보정값으로 1쪽을 만든 .vdoc (1쪽짜리)."""
        base = self._build_vdoc()
        page, slots = render_page(self.model, self.truth, plan, tune, page_number=1,
                                  page_label=f"{base.get('title', '')} (1p)", image_srcs=self._image_srcs)
        doc = {k: v for k, v in base.items() if k not in ("pages", "slots")}
        doc["docId"] = f"{base['docId']}{doc_id_suffix}"
        doc["pages"], doc["slots"] = [page], slots
        return doc

    def merge_into(self, base: dict[str, Any], plan: dict[str, Any], tune: dict[str, Any]) -> dict[str, Any]:
        """생성기가 낸 여러 쪽 문서의 1쪽을 이 루프의 1쪽으로 바꾼다 (truth 는 1쪽만 뽑는다)."""
        page, slots = render_page(self.model, self.truth, plan, tune, page_number=1,
                                  page_label=(base.get("pages") or [{}])[0].get("pageLabel", "1p"), image_srcs=self._image_srcs)
        doc = copy.deepcopy(base)
        old = doc["pages"][0] if doc.get("pages") else None
        if old:
            used = {b.get("slotId") for b in old.get("blocks", [])} | {old.get("headerSlotId"), old.get("footerSlotId")}
            for b in old.get("blocks", []):
                for row in b.get("rows", []):
                    used |= {c.get("slotId") for c in row.get("cells", [])}
            for sid in used:
                doc["slots"].pop(sid, None)
            doc["pages"][0] = page
        else:
            doc["pages"] = [page]
        doc["slots"].update(slots)
        return doc

    # --- 브라우저 → 02 → 03 → 진단 ------------------------------------------------

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
            "(() => { const p = document.querySelector(%s); return !!p && p.innerText.replace(/\\u00a0/g, ' ').includes(%s); })()"
            % (json.dumps(PAGE_SELECTOR), json.dumps(self._page_text))
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
        idx = len(self.iterations)
        it = Iteration(index=idx, tune=copy.deepcopy(self.tune), plan=copy.deepcopy(self.plan),
                       out_dir=self.dir / f"iter_{idx:02d}", changed=self._pending_change)
        self._pending_change = ""
        it.out_dir.mkdir(parents=True, exist_ok=True)
        self.iterations.append(it)
        (it.out_dir / "tune.json").write_text(json.dumps(it.tune, ensure_ascii=False, indent=2), encoding="utf-8")
        (it.out_dir / "plan.json").write_text(json.dumps(it.plan, ensure_ascii=False, indent=2), encoding="utf-8")

        vdoc = self.render(it.plan, it.tune, doc_id_suffix=f"-fid{idx:02d}")
        (it.out_dir / "candidate.vdoc.json").write_text(json.dumps(vdoc, ensure_ascii=False, indent=2), encoding="utf-8")

        self._tab: Optional[CdpTab] = None
        try:
            marker = self._render_in_browser(vdoc)
            measure_cmd = [
                self.cfg.python_exe, str(self.cfg.tools_dir / "02_measure_browser_page.py"),
                "--truth", str(self.truth_path), "--out-dir", str(it.out_dir), "--cdp", self.cfg.cdp_http,
                "--target-url-contains", marker, "--page-selector", PAGE_SELECTOR,
                "--page-text", self._page_text, "--hide-selector", f"{PAGE_SELECTOR} button",
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
        verify = json.loads(verify_path.read_text(encoding="utf-8"))
        measure = json.loads((it.out_dir / "measure.json").read_text(encoding="utf-8"))
        it.summary = self._summarize_verify(verify, v.stdout)
        it.verdict = it.summary["verdict"]
        it.score = it.summary["span_score"]
        it.diagnosis = diagnose(model=self.model, truth=self.truth, measure=measure, verify=verify,
                                line_block=line_block_index(self.model, it.plan), tune=it.tune,
                                min_shift=self.cfg.min_shift)
        it.diagnosis["by_block"] = self._by_block(verify, it.plan)
        (it.out_dir / "diagnosis.json").write_text(json.dumps(it.diagnosis, ensure_ascii=False, indent=2), encoding="utf-8")
        self._trace.event("diagnosis", iteration=it.index, prescriptions=len(it.diagnosis["prescriptions"]),
                          engine_issues=[e["rule"] for e in it.diagnosis["engine_issues"]])
        return it

    def _by_block(self, verify: dict[str, Any], plan: dict[str, Any]) -> list[dict[str, Any]]:
        """블록 · 칸마다 글자 수, 실패 수, dx · dy 중앙값. 실패가 있는 것만."""
        import statistics

        line_block = line_block_index(self.model, plan)
        span_block = {i: line_block.get(ln["id"], "?") for ln in self.model["lines"] for i in ln["spans"]}
        tol = self.cfg.tol_pos
        groups: dict[str, list[dict[str, Any]]] = {}
        for r in verify.get("spans", []):
            groups.setdefault(span_block.get(r["i"], "?"), []).append(r)
        missing: dict[str, int] = {}
        for f in verify.get("findings", []):
            if f.get("rule") == "F-ELEM-001" and "span" in f:
                b = span_block.get(f["span"], "?")
                missing[b] = missing.get(b, 0) + 1
        out = []
        for b in sorted(set(groups) | set(missing)):
            rs = groups.get(b, [])
            fails = sum(1 for r in rs if r["err"] > tol)
            if not fails and not missing.get(b):
                continue
            out.append({"block": b, "spans": len(rs) + missing.get(b, 0), "fail": fails, "missing": missing.get(b, 0),
                        "dx_med": round(statistics.median(r["dx"] for r in rs), 2) if rs else None,
                        "dy_med": round(statistics.median(r["dy"] for r in rs), 2) if rs else None})
        return out[:20]

    @staticmethod
    def _summarize_verify(verify: dict[str, Any], stdout: str) -> dict[str, Any]:
        s = verify.get("summary", {})
        total = s.get("spans_total") or 0
        within = s.get("spans_within_tol") or 0
        fails: dict[str, int] = {}
        for f in verify.get("findings", []):
            if f.get("level") == "FAIL":
                fails[f.get("rule", "?")] = fails.get(f.get("rule", "?"), 0) + 1
        pix, floor = s.get("pixels") or {}, s.get("noise_floor") or {}
        return {
            "verdict": verify.get("verdict"),
            "span_score": round(within / total * 100, 2) if total else 0.0,
            "spans_within_tol": within,
            "spans_total": total,
            "mean_abs_dx": s.get("mean_abs_dx"),
            "mean_abs_dy": s.get("mean_abs_dy"),
            "max_err": s.get("max_err"),
            "ink_f1": f"{pix.get('ink_f1_1px')}% (잡음 하한선 {floor.get('ink_f1_1px')}%)" if pix else None,
            "fail_counts": fails,
            "verdict_line": next((ln.strip() for ln in stdout.splitlines() if "VERDICT" in ln), ""),
        }

    def best(self) -> Optional[Iteration]:
        scored = [it for it in self.iterations if it.score is not None]
        if not scored:
            return None
        return max(scored, key=lambda it: (it.verdict == "PASS", it.score))

    def history(self) -> list[dict[str, Any]]:
        return [{"iter": it.index, "verdict": it.verdict, "span_score": it.score, "error": it.error, "changed": it.changed}
                for it in self.iterations]

    # --- 관찰 ---------------------------------------------------------------------

    def iteration_observation(self, it: Iteration) -> dict[str, Any]:
        if it.error:
            return {"iter": it.index, "error": it.error, "history": self.history()}
        d = it.diagnosis
        return {
            "iter": it.index, **it.summary, "target_score": self.cfg.target_score,
            "prescriptions": d.get("prescriptions", []),
            "engine_issues": d.get("engine_issues", []),
            "by_block": d.get("by_block", []),
            "individual": d.get("individual", []),
            "notes": d.get("notes", []),
            "history": self.history(),
        }

    def lines_table(self, *, start: Optional[str] = None, end: Optional[str] = None, where: Optional[str] = None) -> list[str]:
        """원본 줄을 한 줄 텍스트로: id | 위치(칸 · 블록) | y | x→x1 | pt 글꼴 굵기 | 글자."""
        line_block = line_block_index(self.model, self.plan)
        ids = [ln["id"] for ln in self.model["lines"]]
        a = ids.index(start) if start in ids else 0
        z = ids.index(end) if end in ids else len(ids) - 1
        rows = []
        for ln in self.model["lines"][a:z + 1]:
            loc = line_block.get(ln["id"], "?")
            if where and not (loc == where or loc.startswith(where) or ln["where"].startswith(where)):
                continue
            rows.append(f"{ln['id']} | {loc} | y {ln['y']} | x {ln['x']}→{ln['x1']} | {ln['pt']}pt {ln['font']}"
                        f"{' bold' if ln['bold'] else ''} | {ln['text'][:60]}")
        return rows

    # --- 도구 ---------------------------------------------------------------------

    def build_tools(self) -> ToolRegistry:
        def get_state(_: dict[str, Any]) -> ToolResult:
            return ToolResult(True, {
                "tune": self.tune,
                "tunables": {k: {"doc": spec["doc"], "range": spec["range"], "default": spec["default"]} for k, spec in TUNABLES.items()},
                "plan": self.plan,
                "page": self.truth_summary,
                "history": self.history(),
            })

        def read_lines(args: dict[str, Any]) -> ToolResult:
            rows = self.lines_table(start=args.get("from"), end=args.get("to"), where=args.get("where"))
            return ToolResult(True, {"format": "id | 위치(블록 id 또는 표 칸 id) | y | x→x1 | 크기 글꼴 | 글자", "count": len(rows), "lines": rows[:80]})

        def read_tables(args: dict[str, Any]) -> ToolResult:
            tid = args.get("table")
            tables = [t for t in self.model["tables"] if not tid or t["id"] == tid]
            if not tables:
                return ToolResult.fail(f"표 '{tid}' 없음. 있는 표: {[t['id'] for t in self.model['tables']]}")
            out = []
            for t in tables:
                cells = []
                for c in t["cells"]:
                    span = f" span {c['row_span']}x{c['col_span']}" if c["row_span"] > 1 or c["col_span"] > 1 else ""
                    edges = "".join(k[0].upper() if v else "-" for k, v in c["borders"].items())
                    texts = " / ".join(next(ln["text"][:18] for ln in self.model["lines"] if ln["id"] == lid) for lid in c["lines"][:3])
                    cells.append(f"{c['id']}{span} | 상자 ({c['x']},{c['y']})-({c['x1']},{c['y1']}) | 테두리 {edges} | 줄 {c['lines'][:6]} | {texts}")
                out.append({"id": t["id"], "box": [t["x"], t["y"], t["x1"], t["y1"]], "col_xs": t["col_xs"], "row_ys": t["row_ys"],
                            "title": (self.plan.get("table_titles") or {}).get(t["id"]), "cells": cells})
            return ToolResult(True, {"tables": out, "note": "칸 위치 · 크기 · 합친 칸은 PDF 선에서 결정적으로 정한다. 바꿀 수 있는 것은 표 이름(set_plan.table_titles)과 보정값뿐."})

        def inspect_spans(args: dict[str, Any]) -> ToolResult:
            target = self.iterations[-1] if self.iterations else None
            if target is None or not (target.out_dir / "verify.json").exists():
                return ToolResult.fail("아직 판정 결과가 없다. evaluate 를 먼저 부른다.")
            verify = json.loads((target.out_dir / "verify.json").read_text(encoding="utf-8"))
            measure = json.loads((target.out_dir / "measure.json").read_text(encoding="utf-8"))
            rows = {r["i"]: r for r in verify.get("spans", [])}
            line_block = line_block_index(self.model, target.plan)
            want_block, want_line = args.get("block"), args.get("line")
            out = []
            for ln in self.model["lines"]:
                loc = line_block.get(ln["id"], "?")
                if want_block and loc != want_block and not loc.startswith(f"{want_block}."):
                    continue
                if want_line and ln["id"] != want_line:
                    continue
                for i in ln["spans"]:
                    t, m, r = self.truth["spans"][i], (measure.get("spans") or [None] * (i + 1))[i], rows.get(i)
                    item = {"span": i, "line": ln["id"], "where": loc, "text": t["text"][:24], "pt": t["pt"],
                            "truth": [t["x"], t["y"], t["x1"]], "tokens": bool(t.get("tokens"))}
                    if m:
                        item["drawn"] = [round(m["x"], 2), round(m["y"], 2), round(m["x1"], 2)]
                        item["drawn_font"] = [f["family"] for f in m.get("rendered_fonts", []) if f.get("glyphs")] or m.get("font_family")
                    if r:
                        item.update({"dx": _num(r["dx"]), "dx1": _num(r["dx1"]), "dy": _num(r["dy"])})
                    else:
                        item["missing"] = True
                    out.append(item)
            if not out:
                return ToolResult.fail("해당하는 글자 없음. block 은 B1 같은 블록 id 나 T1.r2c1 같은 칸 id, line 은 L03 같은 줄 id")
            return ToolResult(True, {"iter": target.index, "count": len(out), "spans": out[:30]})

        def set_plan(args: dict[str, Any]) -> ToolResult:
            new_plan = {"blocks": args.get("blocks", self.plan.get("blocks", [])),
                        "table_titles": {**(self.plan.get("table_titles") or {}), **(args.get("table_titles") or {})},
                        "source": "agent"}
            errors = validate_plan(self.model, new_plan)
            unknown_tables = [k for k in (args.get("table_titles") or {}) if k not in {t["id"] for t in self.model["tables"]}]
            if unknown_tables:
                errors.append(f"없는 표 id: {unknown_tables}")
            if errors:
                return ToolResult.fail("분할안 거부", errors=errors[:8], text_lines=[ln["id"] for ln in text_lines(self.model)])
            before = len(self.plan.get("blocks", []))
            self.plan = new_plan
            self._pending_change = (self._pending_change + "; " if self._pending_change else "") + f"분할안 {before}→{len(new_plan['blocks'])}블록"
            self._trace.event("plan_update", blocks=len(new_plan["blocks"]), reason=args.get("reason"))
            return ToolResult(True, {"applied": True, "blocks": [(b["id"], b["lines"], b.get("title")) for b in new_plan["blocks"]],
                                     "note": "아직 평가 전이다. evaluate 를 불러야 효과를 안다."})

        def update_tune(args: dict[str, Any]) -> ToolResult:
            changes = args.get("changes")
            if not isinstance(changes, dict) or not changes:
                return ToolResult.fail("args.changes 에 {보정키: 값} 을 넣어야 함 (처방의 action.args 를 그대로 넘겨도 된다)")
            accepted, errors = validate_tune_changes(changes)
            before = {k: self.tune[k] for k in accepted}
            self.tune.update(accepted)
            if accepted:
                self._pending_change = (self._pending_change + "; " if self._pending_change else "") + json.dumps(accepted, ensure_ascii=False)
            self._trace.event("tune_update", before=before, after=accepted, rejected=errors, reason=args.get("reason"))
            return ToolResult(bool(accepted), {
                "applied": accepted, "before": before, "rejected": errors,
                "note": "아직 평가 전이다. evaluate 를 불러야 효과를 안다.",
            })

        def evaluate(_: dict[str, Any]) -> ToolResult:
            it = self.evaluate()
            return ToolResult(it.error is None, self.iteration_observation(it), artifacts={"iter_dir": str(it.out_dir)})

        def revert(args: dict[str, Any]) -> ToolResult:
            want = args.get("iter")
            target = next((it for it in self.iterations if it.index == want), None) if want is not None else self.best()
            if target is None:
                return ToolResult.fail("되돌릴 반복이 없다")
            self.tune, self.plan = copy.deepcopy(target.tune), copy.deepcopy(target.plan)
            self._pending_change = f"iter {target.index} 로 되돌림"
            return ToolResult(True, {"reverted_to": target.index, "span_score": target.score, "tune": self.tune})

        def finish(args: dict[str, Any]) -> ToolResult:
            best = self.best()
            # 조기 종료(early_exit) 조건:
            # 설정된 target_score 이상이고 VERDICT가 PASS인 이터레이션이 존재하면
            # 분할안 명칭 변경을 강제하지 않고 즉시 종료를 허용한다.
            is_early_pass = (
                self.cfg.early_exit
                and best is not None
                and best.score is not None
                and best.score >= self.cfg.target_score
                and best.verdict == "PASS"
            )
            # 좌표는 처방만으로 맞을 수 있지만 블록 · 표 이름은 LLM 만 정한다. 기본안 이름(첫 줄 글자)으로 끝내지 않는다.
            if not is_early_pass and self.plan.get("source") != "agent" and (text_lines(self.model) or self.model["tables"]):
                return ToolResult.fail(
                    packs.message("form-scaffold:prompts.json", "finishRefused"),
                    blocks=[(b["id"], b["lines"], b.get("title")) for b in self.plan.get("blocks", [])],
                    tables=[t["id"] for t in self.model["tables"]],
                )
            return ToolResult(True, {
                "agent_summary": args.get("summary", ""),
                "host_verified": None if best is None else {
                    "best_iter": best.index, "verdict": best.verdict, "span_score": best.score,
                    "verify_json": str(best.out_dir / "verify.json"), "verdict_line": best.summary.get("verdict_line"),
                },
                "target_score": self.cfg.target_score,
                "fidelity_mode": self.cfg.mode,
                "history": self.history(),
            }, terminal=True)


        #: 도구 명세(이름 · 설명 · 인자)는 하네스 form-scaffold 팩(`tools.loop.json`) — 여기는 실행 함수만 잇는다
        handlers: dict[str, Callable[[dict[str, Any]], ToolResult]] = {
            "read_lines": read_lines,
            "read_tables": read_tables,
            "set_plan": set_plan,
            "update_tune": update_tune,
            "evaluate": evaluate,
            "inspect_spans": inspect_spans,
            "revert": revert,
            "get_state": get_state,
            "finish": finish,
        }
        return ToolRegistry([
            Tool(spec["name"], spec["description"], spec["args"], handlers[spec["name"]])
            for spec in packs.data("form-scaffold:tools.loop.json")
        ])
