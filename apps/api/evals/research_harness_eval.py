"""라이브 Research 하네스 종합 평가 실행기 (`evals/research_harness_eval.py`).

실행 중인 로컬 API(`:8090`, 실제 `agy` ACP 엔진)에 격리된 임시 볼트를 마운트한 뒤
4가지 리서치 시나리오를 실제 에이전트에게 수행시키고, 볼트 산출물 · 도구 호출 로그 ·
읽기 원장 · 최종 답변을 6대 채점 축으로 자동 채점한다.

    python evals/research_harness_eval.py --label iter0-baseline [--only RS1,RS2] [--model gemini-3.8-flash-medium]

채점 축 (각 시나리오 100점 만점):
  A. 역할 분리 & `.ref` 무오염 (Role Separation)
  B. 도구 선택 & 수집 깊이 정합성 (Tool & Mode Routing)
  C. 저장 위치 규약 (`sources/` 동레이어 배치 등 Vault Hygiene)
  D. 수집 품질 & 다양성 (Source Quality, Diversity, Archive/Fallback)
  E. 탐색 전략 & 본문 검증 (Multi-angle Search & Body Read Verification)
  F. 결과 보고 & 근거 품질 (Structured Answer, Evidence Tags, Honesty)
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).resolve().parent
API_ROOT = HERE.parent
STATE = API_ROOT / "state"
WS = STATE / "assistant" / "workspace"
EVAL_VAULT_ROOT = API_ROOT.parent / "playground" / "data" / "vaults" / "_eval_research"
RESULTS_ROOT = HERE / "results" / "research_harness"

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


@dataclass
class ResearchRun:
    scenario_id: str
    vault_root: Path
    active_doc_rel: str
    answer: str
    thinking: str
    tools: list[dict[str, Any]]
    reads: list[dict[str, Any]]
    events: list[dict[str, Any]]
    elapsed_s: float
    usage: dict[str, Any]
    clips: list[dict[str, Any]]
    refs: list[Path]
    images: list[Path]
    photo_notes: str


def _http_json(
    base: str,
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    timeout: float = 60.0,
) -> Any:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", "replace")
        return json.loads(raw) if raw.strip() else {}


def _jsonl_since(path: Path, since: float) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            if float(rec.get("ts") or 0) >= since:
                out.append(rec)
    except OSError:
        pass
    return out


def _collect_clips(vault_root: Path) -> list[dict[str, Any]]:
    clips: list[dict[str, Any]] = []
    for bundle_dir in sorted(vault_root.rglob("*.vclip")):
        if not bundle_dir.is_dir():
            continue
        rel = bundle_dir.relative_to(vault_root).as_posix()
        if any(part.startswith(".") for part in rel.split("/")):
            continue
        meta_path = bundle_dir / "clip.json"
        content_path = bundle_dir / "content.md"
        snap_path = bundle_dir / "snapshot.html"
        assets_dir = bundle_dir / "assets"
        meta: dict[str, Any] = {}
        if meta_path.is_file():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except ValueError:
                meta = {}
        content = content_path.read_text(encoding="utf-8", errors="replace") if content_path.is_file() else ""
        assets = (
            [p.name for p in sorted(assets_dir.iterdir()) if p.is_file()]
            if assets_dir.is_dir()
            else []
        )
        clips.append({
            "rel": rel,
            "parent": bundle_dir.parent.relative_to(vault_root).as_posix(),
            "meta": meta,
            "content": content,
            "contentChars": len(content.strip()),
            "hasSnapshotHtml": snap_path.is_file() and snap_path.stat().st_size > 100,
            "assets": assets,
        })
    return clips


def _short_tool_name(raw: str) -> str:
    """`mcp_vibefs_1e35c962_rs_audit` · `mcp_vibefs_rs_clip` → `rs_audit` · `rs_clip`."""
    s = str(raw or "")
    s = re.sub(r"^mcp_vibefs_", "", s)
    s = re.sub(r"^[0-9a-f]{6,16}_", "", s)
    return s


def _tool_names(run: ResearchRun) -> list[str]:
    return [_short_tool_name(str(t.get("tool") or t.get("name") or "")) for t in run.tools]


def _tool_calls_of(run: ResearchRun, name: str) -> list[dict[str, Any]]:
    out = []
    for t in run.tools:
        raw = str(t.get("tool") or t.get("name") or "")
        if _short_tool_name(raw) == name or raw == name:
            out.append(t)
    return out


_HOMEPAGE_PATH_RE = re.compile(r"^/(?:index|main|home|default|ko|en|kr|jp)?(?:\.[a-z0-9]{1,5})?/?$", re.I)
_DEEP_QUERY_RE = re.compile(r"(?:^|&)(?:idxno|id|seq|nttId|bbsId|article|docId|p|v|logNo|no|newsId|boardSeq)=", re.I)


def _is_homepage_url(url: str) -> bool:
    try:
        parts = urllib.parse.urlsplit(str(url or "").strip())
    except ValueError:
        return False
    if _DEEP_QUERY_RE.search(parts.query or ""):
        return False
    return (parts.path or "") in ("", "/") or bool(_HOMEPAGE_PATH_RE.match(parts.path or ""))


def _search_query_of(call: dict[str, Any]) -> str:
    for key in ("params", "input", "args"):
        val = call.get(key)
        if isinstance(val, dict):
            q = val.get("query") or val.get("q") or val.get("search_query")
            if isinstance(q, str) and q.strip():
                return q.strip()
        elif isinstance(val, str) and val.strip():
            return val.strip()
    title = str(call.get("title") or "").strip()
    if title:
        # e.g. 'Searching the web for "..."' or raw query in title
        m = re.search(r'["“](.+?)["”]', title)
        if m:
            return m.group(1).strip()
        if not title.lower().startswith("search_web"):
            return title
    return ""


def _read_clip_contents(run: ResearchRun) -> set[str]:
    """실제로 `read_file` 로 열람한 `.vclip/content.md` 상대 경로 집합."""
    opened: set[str] = set()
    root_norm = str(run.vault_root.resolve()).lower()
    for r in run.reads:
        p = str(r.get("path") or "").replace("/", "\\")
        if p.lower().startswith(root_norm) and p.lower().endswith(".vclip\\content.md"):
            rel = Path(p).resolve().relative_to(run.vault_root.resolve()).as_posix()
            opened.add(rel)
    for t in run.tools:
        raw = str(t.get("tool") or t.get("name") or "")
        if "read_file" in raw.lower():
            inp = json.dumps(t.get("params") or t.get("input") or t.get("args") or {}, ensure_ascii=False)
            if ".vclip" in inp and "content.md" in inp:
                opened.add(inp)
    return opened


# ---------------------------------------------------------------------------
# 4개 리서치 시나리오 & 6대 축 채점 기준 (총 100점)
# ---------------------------------------------------------------------------

CheckFn = Callable[[ResearchRun], tuple[bool, int, str, str]]
# returns (passed, max_points, axis_code, note)


def _check_no_refs(pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        ok = len(run.refs) == 0
        return ok, pts, "A_role", f".ref 생성 수 {len(run.refs)}개 (사실 리서치 중 .ref 미생성 필요)"
    return fn


def _check_all_clips_under(expected_parent_suffix: str, pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        if not run.clips:
            return False, pts, "C_storage", "생성된 .vclip 번들이 없음"
        ok = all(
            c["parent"] == expected_parent_suffix or c["parent"].endswith("/" + expected_parent_suffix)
            for c in run.clips
        )
        parents = sorted({c["parent"] for c in run.clips})
        return ok, pts, "C_storage", f"저장 폴더 {parents} (기대: *{expected_parent_suffix})"
    return fn


def _check_min_clips(min_count: int, pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        ok = len(run.clips) >= min_count
        return ok, pts, "D_quality", f".vclip 번들 {len(run.clips)}개 (목표 >= {min_count})"
    return fn


def _check_distinct_domains(min_domains: int, pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        domains = {str((c["meta"] or {}).get("domain") or "").lower() for c in run.clips} - {""}
        ok = len(domains) >= min_domains
        return ok, pts, "D_quality", f"서로 다른 도메인 {len(domains)}개: {sorted(domains)}"
    return fn


def _check_clip_mode(expected_mode: str, pts: int, *, min_match: int = 1) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        matched = [c for c in run.clips if (c["meta"] or {}).get("captureMode") == expected_mode]
        ok = len(matched) >= min_match
        modes = [str((c["meta"] or {}).get("captureMode") or "?") for c in run.clips]
        return ok, pts, "B_routing", f"captureMode={modes} (기대 '{expected_mode}' >= {min_match}건)"
    return fn


def _check_full_body_clips(min_count: int, min_chars: int, pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        fulls = [
            c for c in run.clips
            if (c["meta"] or {}).get("captureStatus") == "full" and c["contentChars"] >= min_chars
        ]
        ok = len(fulls) >= min_count
        summary = [(c["rel"].split("/")[-1], (c["meta"] or {}).get("captureStatus"), c["contentChars"]) for c in run.clips]
        return ok, pts, "D_quality", f"충실한 full 본문(>={min_chars}자) {len(fulls)}건 (목표 >= {min_count}) · {summary}"
    return fn


def _check_deep_urls(min_deep: int, pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        urls = [str((c["meta"] or {}).get("canonicalUrl") or (c["meta"] or {}).get("url") or "") for c in run.clips]
        deep = [u for u in urls if u and not _is_homepage_url(u)]
        hp = [u for u in urls if u and _is_homepage_url(u)]
        ok = len(deep) >= min_deep and len(hp) == 0
        return ok, pts, "D_quality", f"딥 URL {len(deep)}/{len(urls)}건 (목표 >= {min_deep}, 루트홈피={len(hp)}건)"
    return fn


def _check_search_queries(min_calls: int, pts: int, *, bilingual: bool = False) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        calls = _tool_calls_of(run, "search_web")
        queries = [_search_query_of(c) for c in calls]
        if len(calls) < min_calls:
            return False, pts, "E_search", f"search_web 호출 {len(calls)}회 (목표 >= {min_calls})"
        if bilingual:
            has_ko = any(re.search(r"[가-힣]", q) for q in queries)
            has_en = any(re.search(r"[A-Za-z]{4,}", q) and not re.search(r"[가-힣]", q) for q in queries)
            ok = has_ko and has_en
            return ok, pts, "E_search", f"search_web {len(calls)}회 · 한/영 다각도={'O' if ok else 'X'} · {queries[:6]}"
        return True, pts, "E_search", f"search_web {len(calls)}회 · {queries[:6]}"
    return fn


def _check_audit_called(pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        calls = _tool_calls_of(run, "rs_audit")
        ok = len(calls) >= 1
        return ok, pts, "E_search", f"rs_audit 자가 점검 {len(calls)}회 호출 (목표 >= 1)"
    return fn


def _check_read_saved_clips(min_reads: int, pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        opened = _read_clip_contents(run)
        ws_grep_calls = _tool_calls_of(run, "ws_grep")
        ok = len(opened) >= min_reads or (len(opened) >= 1 and len(ws_grep_calls) >= 1)
        return ok, pts, "E_search", f"저장된 .vclip/content.md 직접 열람 {len(opened)}건 · ws_grep {len(ws_grep_calls)}회 (목표 >= {min_reads})"
    return fn


def _check_resource_tags_in_answer(min_tags: int, pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        tags = re.findall(r"<<resource:\s*[^>|]+\|[^>]+>>", run.answer)
        ok = len(tags) >= min_tags
        return ok, pts, "F_output", f"답변 내 <<resource: ... | ...>> 근거 태그 {len(tags)}개 (목표 >= {min_tags})"
    return fn


def _check_answer_regex(pattern: str, label: str, pts: int, axis: str = "F_output") -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        ok = bool(re.search(pattern, run.answer, re.I | re.S))
        return ok, pts, axis, f"{label}: {'충족' if ok else '누락'}"
    return fn


def _check_no_tool_errors(pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        errs = [
            f"{t.get('tool') or t.get('name')}:{t.get('error') or ''}"
            for t in run.tools
            if str(t.get("state") or t.get("status") or "").lower() in ("error", "failed")
        ]
        ok = len(errs) == 0
        return ok, pts, "B_routing", f"도구 실패 {len(errs)}건" + (f" · {errs[:3]}" if errs else "")
    return fn


def _check_archive_besteleven(pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        be = next((c for c in run.clips if "besteleven" in str((c["meta"] or {}).get("url") or "").lower()), None)
        if not be:
            return False, pts, "D_quality", "besteleven .vclip 번들이 생성되지 않음"
        meta = be["meta"] or {}
        asset_metas = meta.get("assets") or []
        noise = [
            a for a in asset_metas
            if isinstance(a, dict) and re.search(r"default[-_]?user|avatar|프로필", f"{a.get('originUrl','')} {a.get('caption','')}", re.I)
        ]
        ok = (
            meta.get("captureMode") == "archive"
            and meta.get("captureStatus") == "full"
            and be["contentChars"] >= 250
            and be["hasSnapshotHtml"]
            and len(be["assets"]) >= 1
            and len(noise) == 0
        )
        return ok, pts, "D_quality", (
            f"besteleven mode={meta.get('captureMode')} status={meta.get('captureStatus')} "
            f"chars={be['contentChars']} snapshot={be['hasSnapshotHtml']} assets={len(be['assets'])} noise={len(noise)}"
        )
    return fn


def _check_blocked_clip(domain_fragment: str, pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        bl = next((c for c in run.clips if domain_fragment in str((c["meta"] or {}).get("url") or "").lower()), None)
        if not bl:
            return False, pts, "D_quality", f"{domain_fragment} .vclip 폴백 번들이 생성되지 않음"
        meta = bl["meta"] or {}
        ok = meta.get("captureStatus") == "blocked-fallback"
        return ok, pts, "D_quality", f"{domain_fragment} status={meta.get('captureStatus')} note={meta.get('captureNote')}"
    return fn


def _check_images_licensed(min_images: int, pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        # .vclip/assets 밖의 수집 사진 폴더 확인
        non_clip_imgs = [p for p in run.images if ".vclip" not in p.as_posix()]
        licensed = len(re.findall(r"- 라이선스:\s*(CC|Public|PD)", run.photo_notes, re.I))
        ok = len(non_clip_imgs) >= min_images and licensed >= min_images
        return ok, pts, "D_quality", f"자유 라이선스 사진 {len(non_clip_imgs)}장 · 출처노트 라이선스 기록 {licensed}건 (목표 >= {min_images})"
    return fn


def _check_separate_photo_and_sources_dirs(project_dir: str, pts: int) -> CheckFn:
    def fn(run: ResearchRun) -> tuple[bool, int, str, str]:
        clip_dirs = {c["parent"] for c in run.clips}
        photo_dirs = {
            p.parent.relative_to(run.vault_root).as_posix()
            for p in run.images
            if ".vclip" not in p.as_posix()
        }
        in_proj_clips = bool(clip_dirs) and all(d == f"{project_dir}/sources" for d in clip_dirs)
        in_proj_photos = bool(photo_dirs) and all(d.startswith(f"{project_dir}/") for d in photo_dirs)
        ok = in_proj_clips and in_proj_photos and clip_dirs.isdisjoint(photo_dirs)
        return ok, pts, "C_storage", (
            f"클립 폴더={sorted(clip_dirs)} vs 사진 폴더={sorted(photo_dirs)} (모두 {project_dir}/ 하위 분리 필요)"
        )
    return fn


SCENARIOS: list[dict[str, Any]] = [
    {
        "id": "RS1_bookmark",
        "title": "목록화 전용 리서치 (bookmark 모드 · 딥 URL 규율 · 동레이어 sources/ · .ref 무오염)",
        "project_dir": "01_AI_가이드라인.vproj",
        "active_doc": "01_AI_가이드라인.vproj/검토메모.vdoc",
        "prompt": (
            "대한민국 공공기관 생성형 AI 도입 가이드라인 또는 행정안전부·과기정통부 AI 활용 지침 관련 "
            "공식 보도자료·가이드라인·기사 상세 페이지 후보 3건 이상을 웹에서 조사해서 **목록화만** 먼저 해 줘. "
            "기관 메인 루트 홈페이지 대신 실제 문서·기사 상세 URL 로 선별하고, 본문 전체나 딥 아카이브까지는 말고 "
            "후보 목록만 볼트에 정리해 둔 뒤 각 후보의 URL·출처·선정 이유를 표나 목록으로 보고해 줘."
        ),
        "checks": [
            _check_no_refs(15),
            _check_clip_mode("bookmark", 15, min_match=3),
            _check_all_clips_under("01_AI_가이드라인.vproj/sources", 15),
            _check_min_clips(3, 10),
            _check_deep_urls(3, 15),
            _check_distinct_domains(2, 10),
            _check_search_queries(2, 10),
            _check_no_tool_errors(5),
            _check_answer_regex(r"https?://", "답변에 후보 URL 명시", 5),
        ],
    },
    {
        "id": "RS2_timeline_fact",
        "title": "다각도 사실 조사 + 타임라인 교차 검증 (content · 한/영 검색 · 본문 열람 · 자가 감사 · 근거 태그)",
        "project_dir": "02_라야_부상_보고서.vproj",
        "active_doc": "02_라야_부상_보고서.vproj/보고서.vdoc",
        "prompt": (
            "아스널 골키퍼 다비드 라야(David Raya)의 부상 경위 및 최근 출전/회복 현황을 "
            "공식 발표·해외 언론·국내 기사를 교차 조사해서 타임라인으로 정리해 줘. "
            "원천 기사는 바로 근거 리소스로 쓸 수 있게 본문 스크랩해 두고, "
            "반드시 저장된 본문을 직접 확인한 뒤 답변에 시간순 타임라인과 "
            "`<<resource: 대상 | 인용문구>>` 근거 태그를 붙여 보고해 줘. "
            "(문서 .vdoc 생성은 아직 말고 조사·정리 보고까지만 해 줘)"
        ),
        "checks": [
            _check_no_refs(10),
            _check_clip_mode("content", 10, min_match=2),
            _check_all_clips_under("02_라야_부상_보고서.vproj/sources", 10),
            _check_min_clips(3, 10),
            _check_distinct_domains(2, 10),
            _check_full_body_clips(2, 250, 10),
            _check_search_queries(2, 10, bilingual=True),
            _check_read_saved_clips(2, 10),
            _check_audit_called(5),
            _check_resource_tags_in_answer(2, 10),
            _check_answer_regex(r"(타임라인|시점|일정|1차|공식|언론|확인\s*필요)", "타임라인/출처 구분 서술", 5),
        ],
    },
    {
        "id": "RS3_archive_blocked",
        "title": "원형 딥 아카이브(archive · 클린 이미지) + 차단 사이트 정직 폴백 + 활성 .vproj 배치",
        "project_dir": "03_아카이브_검증.vproj",
        "active_doc": "03_아카이브_검증.vproj/정리.vdoc",
        "prompt": (
            "아래 두 URL 을 사실 근거 리소스로 수집해 줘. "
            "1) https://www.besteleven.com/news/articleView.html?idxno=314277 — 본문뿐 아니라 원형 HTML과 본문 이미지까지 영구 보관할 수 있게 딥 아카이브해 줘. "
            "2) https://httpbin.org/status/403 — 접근 제한(403)이 걸리면 우회하지 말고 차단 폴백 번들로 상태와 사유를 정직하게 남겨 줘. "
            "두 건 모두 수집 후 자가 점검까지 마치고 결과 상태와 사용자가 차단 문서를 보강하는 방법을 보고해 줘."
        ),
        "checks": [
            _check_no_refs(10),
            _check_all_clips_under("03_아카이브_검증.vproj/sources", 20),
            _check_archive_besteleven(25),
            _check_blocked_clip("httpbin.org", 20),
            _check_audit_called(5),
            _check_no_tool_errors(10),
            _check_answer_regex(r"(차단|폴백|blocked-fallback|붙여넣|수동|manual)", "차단 사유 및 수동 보강 안내", 10),
        ],
    },
    {
        "id": "RS4_role_separation",
        "title": "역할 분리 종합: 활성 .vproj 내부 sources/(.vclip) + 사진/(자유 라이선스) + .ref 미생성",
        "project_dir": "04_아사쿠사_자료.vproj",
        "active_doc": "04_아사쿠사_자료.vproj/가이드.vdoc",
        "prompt": (
            "도쿄 아사쿠사 센소지(Senso-ji)를 주제로 사실 자료와 사진을 모아 줘. "
            "① 센소지 공식 기본 정보(역사·관람 정보)를 다룬 신뢰할 만한 웹 상세 페이지 2건을 사실 근거 리소스로 본문 스크랩해 두고, "
            "② Wikimedia Commons 에서 자유 라이선스 센소지 사진 3장을 찾아 캡션·라이선스 출처와 함께 별도 사진 폴더에 저장해 줘. "
            "단, 레이아웃 참고용 레퍼런스(.ref)는 요청하지 않았으니 만들지 마. 마지막에 수집 건수와 라이선스를 보고해 줘."
        ),
        "checks": [
            _check_no_refs(15),
            _check_clip_mode("content", 10, min_match=2),
            _check_min_clips(2, 10),
            _check_deep_urls(2, 10),
            _check_full_body_clips(1, 200, 10),
            _check_images_licensed(3, 15),
            _check_separate_photo_and_sources_dirs("04_아사쿠사_자료.vproj", 15),
            _check_audit_called(5),
            _check_answer_regex(r"(CC|Public|퍼블릭|라이선스)", "답변에 사진 라이선스 보고", 10),
        ],
    },
]


def _prepare_eval_vault(base: str, scenario: dict[str, Any]) -> tuple[str, Path]:
    vault_dir = EVAL_VAULT_ROOT / scenario["id"]
    if vault_dir.exists():
        shutil.rmtree(vault_dir, ignore_errors=True)
    vault_dir.mkdir(parents=True, exist_ok=True)
    proj_dir = vault_dir / scenario["project_dir"]
    proj_dir.mkdir(parents=True, exist_ok=True)
    active_doc = vault_dir / scenario["active_doc"]
    active_doc.parent.mkdir(parents=True, exist_ok=True)
    active_doc.write_text(
        json.dumps({"version": "1.0.0", "docId": "eval-doc", "title": scenario["id"], "pages": [], "slots": {}}, ensure_ascii=False),
        encoding="utf-8",
    )
    vault_id = f"eval-research-{scenario['id'].lower()}"
    # 기존 등록이 있으면 정리 후 재마운트
    try:
        _http_json(base, "DELETE", f"/api/vaults/{urllib.parse.quote(vault_id, safe='')}")
    except Exception:
        pass
    created = _http_json(
        base,
        "POST",
        "/api/vaults",
        {"id": vault_id, "name": f"Eval {scenario['id']}", "rootPath": str(vault_dir.resolve())},
    )
    return str(created.get("id") or vault_id), vault_dir


def _cleanup_eval_vault(base: str, vault_id: str) -> None:
    try:
        _http_json(base, "DELETE", f"/api/vaults/{urllib.parse.quote(vault_id, safe='')}")
    except Exception:
        pass


def run_scenario(base: str, scenario: dict[str, Any], model: str | None) -> dict[str, Any]:
    vault_id, vault_dir = _prepare_eval_vault(base, scenario)
    sid = ""
    try:
        sess = _http_json(base, "POST", "/api/assistant/sessions", {"model": model} if model else {})
        sid = str(sess["sessionId"])
        wb_payload = {
            "vaultId": vault_id,
            "vaultRoot": str(vault_dir.resolve()),
            "readOnly": False,
            "docVaultPath": scenario["active_doc"],
            "activeDocPath": scenario["active_doc"],
            "docPath": str((vault_dir / scenario["active_doc"]).resolve()),
            "references": [],
            "documents": [{"path": scenario["active_doc"], "title": scenario["id"]}],
        }
        ctx = [
            {
                "kind": "workbench",
                "id": "wb:state",
                "label": "작업대 (볼트 모드)",
                "content": json.dumps(wb_payload, ensure_ascii=False),
            }
        ]
        started = time.time()
        events: list[dict[str, Any]] = []
        body = {"text": scenario["prompt"], "contexts": ctx, "tools": [], **({"model": model} if model else {})}
        req = urllib.request.Request(
            base + f"/api/assistant/sessions/{sid}/messages",
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=600) as resp:
            for raw in resp:
                line = raw.decode("utf-8", "replace").strip()
                if line.startswith("data: "):
                    try:
                        events.append(json.loads(line[6:]))
                    except ValueError:
                        pass
        ended = time.time()

        answer = "".join(e.get("text", "") for e in events if e.get("type") == "text_delta")
        thinking = "".join(e.get("text", "") for e in events if e.get("type") == "thinking_delta")
        tools_by_id: dict[str, dict[str, Any]] = {}
        order: list[str] = []
        for e in events:
            if e.get("type") == "agent_tool":
                key = str(e.get("callId") or len(order))
                if key not in tools_by_id:
                    order.append(key)
                    tools_by_id[key] = dict(e)
                else:
                    tools_by_id[key].update({k: v for k, v in e.items() if v not in (None, {}, "")})
        tool_list = [tools_by_id[k] for k in order]
        reads = [r for r in _jsonl_since(WS / "reads.jsonl", started - 1) if float(r.get("ts", 0)) <= ended + 2]
        usage = next((e.get("usage") for e in reversed(events) if e.get("type") == "turn_done"), {}) or {}

        clips = _collect_clips(vault_dir)
        refs = sorted(vault_dir.rglob("*.ref"))
        images = sorted(p for p in vault_dir.rglob("*") if p.is_file() and p.suffix.lower() in IMG_EXTS)
        photo_notes = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in vault_dir.rglob("_사진 출처.md"))

        run = ResearchRun(
            scenario_id=scenario["id"],
            vault_root=vault_dir,
            active_doc_rel=scenario["active_doc"],
            answer=answer,
            thinking=thinking,
            tools=tool_list,
            reads=reads,
            events=events,
            elapsed_s=round(ended - started, 1),
            usage=usage,
            clips=clips,
            refs=refs,
            images=images,
            photo_notes=photo_notes,
        )

        checks_out = []
        earned = 0
        total = 0
        for check in scenario["checks"]:
            ok, pts, axis, note = check(run)
            total += pts
            if ok:
                earned += pts
            checks_out.append({"ok": ok, "points": pts if ok else 0, "maxPoints": pts, "axis": axis, "note": note})

        errors = [str(e.get("message") or e) for e in events if e.get("type") == "error"]
        return {
            "id": scenario["id"],
            "title": scenario["title"],
            "score": earned,
            "maxScore": total,
            "pct": round((earned / max(1, total)) * 100, 1),
            "elapsedS": run.elapsed_s,
            "toolCount": len(tool_list),
            "searchCount": len(_tool_calls_of(run, "search_web")),
            "rsPageCount": len(_tool_calls_of(run, "rs_page")),
            "toolsUsed": _tool_names(run),
            "clipCount": len(clips),
            "refCount": len(refs),
            "imageCount": len(images),
            "errors": errors,
            "clips": [
                {
                    "rel": c["rel"],
                    "mode": (c["meta"] or {}).get("captureMode"),
                    "status": (c["meta"] or {}).get("captureStatus"),
                    "domain": (c["meta"] or {}).get("domain"),
                    "chars": c["contentChars"],
                    "snapshot": c["hasSnapshotHtml"],
                    "assets": len(c["assets"]),
                }
                for c in clips
            ],
            "checks": checks_out,
            "answerPreview": answer[:1200],
            "usage": usage,
        }
    finally:
        if sid:
            try:
                _http_json(base, "DELETE", f"/api/assistant/sessions/{sid}")
            except Exception:
                pass
        _cleanup_eval_vault(base, vault_id)


def render_report(label: str, model: str, rows: list[dict[str, Any]]) -> str:
    total_earned = sum(r["score"] for r in rows)
    total_max = sum(r["maxScore"] for r in rows)
    overall_pct = round((total_earned / max(1, total_max)) * 100, 1)
    lines = [
        f"# Research Harness Live Evaluation — `{label}`",
        "",
        f"- Model: `{model}`",
        f"- Overall Score: **{total_earned} / {total_max} ({overall_pct}%)**",
        "",
        "| Scenario | Score | Time | Tools | Clips | Refs | Images |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for r in rows:
        lines.append(
            f"| `{r['id']}` | **{r['score']}/{r['maxScore']} ({r['pct']}%)** | {r['elapsedS']}s | "
            f"{r['toolCount']} | {r['clipCount']} | {r['refCount']} | {r['imageCount']} |"
        )
    lines.append("")
    for r in rows:
        lines.append(f"## {r['id']} — {r['title']} ({r['score']}/{r['maxScore']})")
        lines.append(f"- Tools: `{', '.join(r['toolsUsed'])}`")
        for c in r["checks"]:
            mark = "✅" if c["ok"] else "❌"
            lines.append(f"- {mark} `[{c['axis']}]` ({c['points']}/{c['maxPoints']}pt) {c['note']}")
        if r["clips"]:
            lines.append("- Saved `.vclip` bundles:")
            for cl in r["clips"]:
                lines.append(
                    f"  - `{cl['rel']}` (mode={cl['mode']}, status={cl['status']}, "
                    f"domain={cl['domain']}, chars={cl['chars']}, snap={cl['snapshot']}, assets={cl['assets']})"
                )
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="run")
    ap.add_argument("--only", default="", help="쉼표 구분 시나리오 ID 접두사 (예: RS1,RS3)")
    ap.add_argument("--model", default="gemini-3.8-flash-medium")
    ap.add_argument("--base", default="http://127.0.0.1:8090")
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

    only = [x.strip().upper() for x in args.only.split(",") if x.strip()]
    picked = [
        sc for sc in SCENARIOS
        if not only or any(sc["id"].upper().startswith(p) for p in only)
    ]
    rows: list[dict[str, Any]] = []
    for sc in picked:
        print(f"▶ Running {sc['id']} ({sc['title']}) ...", flush=True)
        res = None
        for attempt in range(1, 3):
            try:
                res = run_scenario(args.base, sc, args.model)
                if res["toolCount"] == 0 and not res["answerPreview"].strip() and attempt == 1:
                    print(f"  ! Attempt 1 returned empty response (errors={res.get('errors')}); retrying in 5s ...", flush=True)
                    time.sleep(5)
                    continue
                break
            except (ConnectionResetError, urllib.error.URLError, OSError) as exc:
                print(f"  ! Attempt {attempt} failed ({exc}); retrying in 5s ...", flush=True)
                time.sleep(5)
                if attempt == 2:
                    raise
        assert res is not None
        rows.append(res)
        print(f"  => {res['id']}: {res['score']}/{res['maxScore']} ({res['pct']}%) in {res['elapsedS']}s", flush=True)
        for c in res["checks"]:
            mark = "OK" if c["ok"] else "FAIL"
            print(f"     [{mark}] ({c['points']}/{c['maxPoints']}) {c['axis']} - {c['note']}", flush=True)

    stamp = time.strftime("%Y%m%d-%H%M%S")
    out_dir = RESULTS_ROOT / f"{args.label}-{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_md = render_report(args.label, args.model, rows)
    (out_dir / "report.md").write_text(report_md, encoding="utf-8")
    (out_dir / "results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    total_earned = sum(r["score"] for r in rows)
    total_max = sum(r["maxScore"] for r in rows)
    print(f"\n=== OVERALL ({args.label}): {total_earned}/{total_max} ({round(total_earned / max(1, total_max) * 100, 1)}%) ===", flush=True)
    print(f"Report saved to: {out_dir / 'report.md'}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
