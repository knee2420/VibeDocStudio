"""작업 공간 지도(mapper.py) 및 군집 수집(ws_collect) 단위 테스트."""
from __future__ import annotations

from pathlib import Path

from app.assistant.workspace.index import MountItem, WorkspaceIndex
from app.assistant.workspace.mapper import build_map, find_clusters, match_cluster_query
from app.assistant.workspace.tools import WorkspaceTools


def _make_vault(root: Path) -> Path:
    # 1. discussions 아래 여러 날짜 폴더 생성 (반복 구조)
    dates = ["26.10.06", "26.10.13", "26.10.20", "26.10.27"]
    for d in dates:
        d_path = root / "discussions" / d
        (d_path / "decisions").mkdir(parents=True, exist_ok=True)
        (d_path / "agenda.md").write_text(f"# {d} 회의 안건\n안건 내용...", encoding="utf-8")
        (d_path / "decisions" / "D01_arch.md").write_text(
            f"---\n유형: 결정 카드\n상태: 승인\n---\n# D01 {d} 아키텍처 결정", encoding="utf-8"
        )
        (d_path / "decisions" / "D02_tech.md").write_text(
            f"---\n유형: 결정 카드\n상태: 검토\n---\n# D02 {d} 기술 결정", encoding="utf-8"
        )

    # 2. 템플릿 폴더
    tmpl_path = root / "templates"
    tmpl_path.mkdir(parents=True, exist_ok=True)
    card_content = "---\n유형: 템플릿\n---\n# 카드 서식 템플릿\n내용..."
    (tmpl_path / "decision_card_template.md").write_text(card_content, encoding="utf-8")
    # 동일본 생성
    (root / "discussions" / "26.10.06" / "decision_card_template.md").write_text(card_content, encoding="utf-8")

    # 3. 루트 파일
    (root / "discussions" / "index.md").write_text(
        "# 회의 인덱스\n" + "\n".join(f"- [[{d}/agenda]]" for d in dates),
        encoding="utf-8",
    )
    return root


def test_mapper_clusters_and_repeated_structure(tmp_path: Path):
    vault = _make_vault(tmp_path)
    mount_items = [
        MountItem(str(vault / "discussions"), "rm_disc", "discussions", kind="dir", alias="discussions"),
        MountItem(str(vault / "templates"), "rm_tmpl", "templates", kind="dir", alias="templates"),
    ]
    index = WorkspaceIndex.build(mount_items)

    # 군집 검색
    clusters = find_clusters(index)
    cluster_names = [c.name for c, _ in clusters]
    assert "결정 카드" in cluster_names
    assert "회의록" in cluster_names
    assert "템플릿" in cluster_names

    # 질의 매칭
    assert match_cluster_query("결정 카드").name == "결정 카드"
    assert match_cluster_query("decision").name == "결정 카드"
    assert match_cluster_query("회의록").name == "회의록"
    assert match_cluster_query("템플릿").name == "템플릿"

    # 지도 생성
    map_text = build_map(index, budget_bytes=6000)
    assert "[마운트된 자료 지도]" in map_text
    assert "결정 카드" in map_text
    assert "ws_collect(\"결정 카드\")" in map_text
    # 반복 구조 축약 확인
    assert "반복 구조" in map_text or "<날짜>" in map_text
    assert "동일본 묶음" in map_text


def test_collect_query_modes_and_pagination(tmp_path: Path):
    vault = _make_vault(tmp_path)
    mount_items = [
        MountItem(str(vault / "discussions"), "rm_disc", "discussions", kind="dir", alias="discussions"),
        MountItem(str(vault / "templates"), "rm_tmpl", "templates", kind="dir", alias="templates"),
    ]
    index = WorkspaceIndex.build(mount_items)
    tools = WorkspaceTools(index)

    # 1. 군집 이름으로 수집
    res_cluster = tools.call("ws_collect", {"query": "결정 카드"})
    assert "[대상 목록: 결정 카드]" in res_cluster
    assert "D01_arch.md" in res_cluster
    assert "D02_tech.md" in res_cluster

    # 2. frontmatter 조건으로 수집
    res_field = tools.call("ws_collect", {"query": "상태=승인"})
    assert "[대상 목록: 상태=승인]" in res_field
    assert "D01_arch.md" in res_field

    # 3. glob 패턴으로 수집
    res_glob = tools.call("ws_collect", {"query": "*agenda*"})
    assert "[대상 목록: 패턴 '*agenda*']" in res_glob
    assert "agenda.md" in res_glob

    # 4. 동일본 표시 확인
    res_tmpl = tools.call("ws_collect", {"query": "템플릿"})
    assert "동일본" in res_tmpl
