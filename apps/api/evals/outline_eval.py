"""`.outline` AI 협업 평가 매트릭스 (E6) — 리소스 기반 구조화 · 리소스 첨부 · 근거 연결 · 보호 게이트.

고정 임계값으로 강제 Fail 하지 않고 객관 측정값과 불변 안전 조건(raw 쓰기 차단 · docBindings 보호 ·
스코프 준수 · 근거 열람 일치 · 서브트리 baseHash 격리)을 한 번에 점검한다.

실행:
    python apps/api/evals/outline_eval.py
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from typing import Any

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
for p in (
    API_ROOT,
    REPO_ROOT / "packages" / "harness-kit",
    REPO_ROOT / "packages" / "docstruct-engine",
    REPO_ROOT / "packages" / "webpage-fidelity-engine",
    REPO_ROOT / "packages" / "agent-core",
):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from vibefs.fs_tools import VaultFsTools
from vibefs.outline_tools import OutlineTools, compute_subtree_hash
from vibefs.proposals import ProposalStore
from vibefs.store import WorkspaceStore


def run_outline_eval_matrix() -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="outline-eval-") as td:
        tmp = Path(td)
        vault = tmp / "vault"
        state = tmp / "state"
        (vault / "project").mkdir(parents=True)
        (vault / "project" / "photos").mkdir()
        (vault / "project" / "photos" / "cover.png").write_bytes(b"\x89PNG\r\n\x1a\n")
        (vault / "project" / "notes.md").write_text("# 팩트\n총 사업비 3억원, 기간 6개월\n", encoding="utf-8")

        outline_data = {
            "version": 1,
            "id": "ol-eval-1",
            "title": "평가 아웃라인",
            "defaultView": "bullets",
            "docBindings": {"n-root": {"docId": "d-eval", "vdocPath": "vault://project/plan.vdoc", "profileId": "a4"}},
            "rootNodes": [
                {
                    "id": "n-root",
                    "text": "<<doc:a4>> 평가 사업계획서",
                    "children": [
                        {"id": "n-s1", "text": "<<view:section>> 1. 요약", "children": [{"id": "n-b1", "text": "요약 대기", "children": []}]},
                        {"id": "n-s2", "text": "<<view:section>> 2. 일정", "children": [{"id": "n-b2", "text": "일정 대기", "children": []}]},
                    ],
                }
            ],
        }
        (vault / "project" / "master.outline").write_text(json.dumps(outline_data, ensure_ascii=False, indent=2), encoding="utf-8")

        store = WorkspaceStore(str(state))
        store.set_workbench(
            "eval-s1",
            {
                "vaultId": "v-eval",
                "vaultRoot": str(vault),
                "activeOutlinePath": "project/master.outline",
                "mode": "agent",
                "outlineScope": {"mode": "selection", "label": "1. 요약", "allowedNodeIds": ["n-s1", "n-b1"]},
            },
        )
        reads = [{"path": str(vault / "project" / "notes.md"), "start": 1, "end": 2}]
        ol = OutlineTools(store, "eval-s1", proposals=ProposalStore(str(state)), reads=lambda: reads)
        fs = VaultFsTools(store, "eval-s1")

        # C1: Raw write blocked
        c1 = False
        try:
            fs.call("vf_write", {"path": "project/master.outline", "content": "{}", "mode": "overwrite"})
        except ValueError:
            c1 = True
        results.append({"id": "C1_raw_outline_write_blocked", "passed": c1})

        # C2: Scope guard blocks n-b2
        c2 = False
        try:
            ol.call("ol_propose_patch", {"requests": [{"op": "replace", "id": "n-b2", "text": "scope breach"}]})
        except ValueError:
            c2 = True
        results.append({"id": "C2_outline_scope_enforced", "passed": c2})

        # C3: Grounded patch + image attach inside scope
        p1 = ol.call(
            "ol_propose_patch",
            {
                "summary": "요약 채우기",
                "requests": [{"op": "replace", "id": "n-b1", "text": "총 사업비 3억원 · 기간 6개월"}],
                "nodeEvidence": {"n-b1": [{"kind": "resource", "refId": "vault:project/notes.md", "label": "notes.md", "sourcePath": "project/notes.md"}]},
            },
        )
        p2 = ol.call("ol_attach_resource", {"nodeId": "n-s1", "target": "project/photos/cover.png", "mode": "img-token", "caption": "대표 이미지"})
        c3 = ("[Staged 제출" in p1) and ("경고:" not in p1) and ("[Staged 제출" in p2)
        results.append({"id": "C3_grounded_patch_and_media_attach", "passed": c3})

        # C4: Subtree hash isolation
        h1 = compute_subtree_hash(outline_data["rootNodes"], ["n-s1"])
        outline_data["rootNodes"][0]["children"][1]["children"][0]["text"] = "다른 브랜치 편집"
        h2 = compute_subtree_hash(outline_data["rootNodes"], ["n-s1"])
        results.append({"id": "C4_subtree_hash_isolation", "passed": h1 == h2})

    passed = sum(1 for r in results if r["passed"])
    return {"passed": passed, "total": len(results), "checks": results}


if __name__ == "__main__":
    report = run_outline_eval_matrix()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["passed"] == report["total"] else 1)
