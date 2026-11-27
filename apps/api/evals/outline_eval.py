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
        # 공백 포함 프로젝트 폴더 내 .vclip 웹 스크랩 번들
        clip_dir = vault / "프로젝트 조사.vproj" / "sources" / "공식_발표_기사.vclip"
        clip_dir.mkdir(parents=True)
        (clip_dir / "clip.json").write_text(
            json.dumps({"protocol": "vibe-clip/1.0", "clipId": "clip_eval_1", "title": "공식_발표_기사"}, ensure_ascii=False),
            encoding="utf-8",
        )
        (clip_dir / "content.md").write_text("# 공식 발표 기사\n\n총 사업비는 3억원이며 기간은 6개월이다.\n", encoding="utf-8")

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
                        {
                            "id": "n-s1",
                            "text": "<<view:section>> 1. 요약",
                            "children": [
                                {
                                    "id": "n-b1",
                                    "text": "요약 대기",
                                    "children": [
                                        {
                                            "id": "n-r1",
                                            "text": "<<resource: 프로젝트 조사.vproj/sources/공식_발표_기사.vclip | 총 사업비는 3억원이며 기간은 6개월이다.>>",
                                            "children": [],
                                        }
                                    ],
                                }
                            ],
                        },
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
                "outlineScope": {"mode": "selection", "label": "1. 요약", "allowedNodeIds": ["n-s1", "n-b1", "n-r1"]},
            },
        )
        reads = [
            {"path": str(vault / "project" / "notes.md"), "start": 1, "end": 2},
            {"path": str(clip_dir / "content.md"), "start": 1, "end": 3},
        ]
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

        # C3: Grounded <<resource:...>> patch + mode="resource" attach + image attach (zero sidecar, zero warnings)
        p1 = ol.call(
            "ol_propose_patch",
            {
                "summary": "요약 및 근거 태그 추가",
                "requests": [
                    {"op": "replace", "id": "n-b1", "text": "총 사업비 3억원 · 기간 6개월"},
                    {
                        "op": "insert_after",
                        "targetId": "n-b1",
                        "inside": True,
                        "items": [{"text": "<<resource: project/notes.md #L2-L2 | 총 사업비 3억원, 기간 6개월>>"}],
                    },
                ],
            },
        )
        p2 = ol.call(
            "ol_attach_resource",
            {
                "nodeId": "n-b1",
                "target": "프로젝트 조사.vproj/sources/공식_발표_기사.vclip",
                "mode": "resource",
                "quote": "총 사업비는 3억원이며 기간은 6개월이다.",
            },
        )
        p3 = ol.call("ol_attach_resource", {"nodeId": "n-s1", "target": "project/photos/cover.png", "mode": "img-token", "caption": "대표 이미지"})
        c3 = (
            ("[Staged 제출" in p1)
            and ("경고:" not in p1)
            and ("[Staged 제출" in p2)
            and ("경고:" not in p2)
            and ("[Staged 제출" in p3)
        )
        results.append({"id": "C3_resource_tag_grounded_and_media_attach", "passed": c3})

        # C4: Subtree hash isolation
        h1 = compute_subtree_hash(outline_data["rootNodes"], ["n-s1"])
        outline_data["rootNodes"][0]["children"][1]["children"][0]["text"] = "다른 브랜치 편집"
        h2 = compute_subtree_hash(outline_data["rootNodes"], ["n-s1"])
        results.append({"id": "C4_subtree_hash_isolation", "passed": h1 == h2})

        # C5: Lint blocks stripping <<resource:...>> into plain [[...vclip]] wikilink
        c5 = False
        try:
            ol.call(
                "ol_propose_patch",
                {
                    "summary": "잘못된 위키링크 변환",
                    "requests": [{"op": "replace", "id": "n-r1", "text": "총 사업비는 3억원 [[공식_발표_기사.vclip]]"}],
                },
            )
        except ValueError as exc:
            c5 = "LINT_RESOURCE_TAG_STRIPPED" in str(exc) or "LINT_VCLIP_PLAIN_WIKILINK" in str(exc)
        results.append({"id": "C5_lint_blocks_resource_strip_to_wikilink", "passed": c5})

        # C6: Lint blocks .vclip set_file and ol_attach_resource(mode="file"|"wikilink")
        c6_a = c6_b = c6_c = False
        try:
            ol.call(
                "ol_propose_patch",
                {"requests": [{"op": "set_file", "id": "n-b1", "file": {"target": "프로젝트 조사.vproj/sources/공식_발표_기사.vclip"}}]},
            )
        except ValueError as exc:
            c6_a = "LINT_VCLIP_SET_FILE_ABUSE" in str(exc)
        try:
            ol.call("ol_attach_resource", {"nodeId": "n-b1", "target": "프로젝트 조사.vproj/sources/공식_발표_기사.vclip", "mode": "file"})
        except ValueError as exc:
            c6_b = "LINT_VCLIP_SET_FILE_ABUSE" in str(exc)
        try:
            ol.call("ol_attach_resource", {"nodeId": "n-b1", "target": "프로젝트 조사.vproj/sources/공식_발표_기사.vclip", "mode": "wikilink"})
        except ValueError as exc:
            c6_c = "LINT_VCLIP_SET_FILE_ABUSE" in str(exc)
        results.append({"id": "C6_lint_blocks_vclip_set_file_abuse", "passed": c6_a and c6_b and c6_c})

        # C7: Lint blocks hidden nodeEvidence sidecar injection
        c7 = False
        try:
            ol.call(
                "ol_propose_patch",
                {
                    "summary": "사이드카 우회",
                    "requests": [{"op": "replace", "id": "n-b1", "text": "총 사업비 3억원"}],
                    "nodeEvidence": {"n-b1": [{"kind": "resource", "refId": "vault:project/notes.md", "label": "notes.md", "sourcePath": "project/notes.md"}]},
                },
            )
        except ValueError as exc:
            c7 = "LINT_SIDECAR_ONLY_EVIDENCE" in str(exc)
        results.append({"id": "C7_lint_blocks_hidden_node_evidence_sidecar", "passed": c7})

        # C8: Lint blocks nonexistent local resource path
        c8 = False
        try:
            ol.call(
                "ol_propose_patch",
                {
                    "requests": [
                        {
                            "op": "insert_after",
                            "targetId": "n-b1",
                            "inside": True,
                            "items": [{"text": "<<resource: 프로젝트 조사.vproj/sources/없는_기사.vclip | 발췌>>"}],
                        }
                    ]
                },
            )
        except ValueError as exc:
            c8 = "LINT_MISSING_RESOURCE_TARGET" in str(exc)
        results.append({"id": "C8_lint_blocks_missing_resource_target", "passed": c8})

        # C9: Lint warns on unread resource and quoteless <<resource:...>>
        unread_clip = vault / "프로젝트 조사.vproj" / "sources" / "미열람_기사.vclip"
        unread_clip.mkdir(parents=True)
        (unread_clip / "content.md").write_text("# 미열람 기사\n\n내용\n", encoding="utf-8")
        w_out = ol.call(
            "ol_propose_patch",
            {
                "requests": [
                    {
                        "op": "insert_after",
                        "targetId": "n-b1",
                        "inside": True,
                        "items": [{"text": "<<resource: 프로젝트 조사.vproj/sources/미열람_기사.vclip>>"}],
                    }
                ]
            },
        )
        c9 = ("LINT_UNREAD_RESOURCE_SOURCE" in w_out) and ("LINT_RESOURCE_WITHOUT_QUOTE" in w_out)
        results.append({"id": "C9_lint_warns_unread_and_quoteless_resource", "passed": c9})

        # C10: ol_create enforces same lint rules and accepts valid <<resource:...vclip | quote>>
        c10_block = False
        try:
            ol.call(
                "ol_create",
                {
                    "path": "project/bad.outline",
                    "title": "잘못된 생성",
                    "rootNodes": [{"text": "주장", "children": [{"text": "요약 [[공식_발표_기사.vclip]]"}]}],
                },
            )
        except ValueError as exc:
            c10_block = "LINT_VCLIP_PLAIN_WIKILINK" in str(exc)
        created_ok = ol.call(
            "ol_create",
            {
                "path": "project/good.outline",
                "title": "정상 생성",
                "rootNodes": [
                    {
                        "text": "사업비 요약",
                        "children": [
                            {"text": "<<resource: 프로젝트 조사.vproj/sources/공식_발표_기사.vclip | 총 사업비는 3억원이며 기간은 6개월이다.>>"}
                        ],
                    }
                ],
            },
        )
        c10 = c10_block and ("[." in created_ok) and ("경고:" not in created_ok)
        results.append({"id": "C10_ol_create_enforces_same_lint_rules", "passed": c10})

        # C11: Image resource enforces native .outline file attachment (except explicit #bbox citation)
        c11_block_patch = c11_block_attach = False
        try:
            ol.call(
                "ol_propose_patch",
                {
                    "requests": [
                        {
                            "op": "insert_after",
                            "targetId": "n-b1",
                            "inside": True,
                            "items": [{"text": "<<resource: project/photos/cover.png | 대표 사진>>"}],
                        }
                    ]
                },
            )
        except ValueError as exc:
            c11_block_patch = "LINT_IMAGE_USE_OUTLINE_FILE" in str(exc)
        try:
            ol.call(
                "ol_attach_resource",
                {"nodeId": "n-b1", "target": "project/photos/cover.png", "mode": "resource", "quote": "대표 사진"},
            )
        except ValueError as exc:
            c11_block_attach = "LINT_IMAGE_USE_OUTLINE_FILE" in str(exc)
        c11_file_ok = "[Staged 제출" in ol.call(
            "ol_attach_resource",
            {"nodeId": "n-b1", "target": "project/photos/cover.png", "mode": "file"},
        )
        c11_bbox_ok = "[Staged 제출" in ol.call(
            "ol_attach_resource",
            {
                "nodeId": "n-b1",
                "target": "project/photos/cover.png",
                "mode": "resource",
                "anchor": "#bbox(10,20,300,400)",
                "quote": "특정 영역 증빙",
            },
        )
        results.append({
            "id": "C11_lint_enforces_image_outline_file_attach",
            "passed": c11_block_patch and c11_block_attach and c11_file_ok and c11_bbox_ok,
        })

    passed = sum(1 for r in results if r["passed"])
    return {"passed": passed, "total": len(results), "checks": results}


if __name__ == "__main__":
    report = run_outline_eval_matrix()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["passed"] == report["total"] else 1)
