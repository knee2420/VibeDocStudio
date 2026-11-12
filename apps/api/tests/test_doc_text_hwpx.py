"""hwpx → 텍스트 렌더 · vibefs 색인/훅 연결 · 리소스 인입."""
from __future__ import annotations

import itertools
import zipfile
from pathlib import Path
from typing import Any

import pytest
from docstruct_engine.acquire import doc_text, hwpx
from docstruct_engine.compile import hwpx_vdoc

from app.resource.index.pipeline.contracts import ScopeProfile
from app.resource.index.pipeline.ingest import ingest_sources
from vibefs.doc_tools import DocTools
from vibefs.hook import decide
from vibefs.index import MountItem, WorkspaceIndex
from vibefs.store import WorkspaceStore

NS = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'


def _p(text: str, vert: int, page_break: bool = False, inner: str = "") -> str:
    brk = ' pageBreak="1"' if page_break else ""
    body = f"<hp:t>{text}</hp:t>" if text else ""
    return (f'<hp:p{brk}><hp:run>{body}{inner}</hp:run>'
            f'<hp:linesegarray><hp:lineseg vertpos="{vert}"/></hp:linesegarray></hp:p>')


def _tc(row: int, col: int, text: str, rs: int = 1, cs: int = 1) -> str:
    return (f'<hp:tc><hp:subList><hp:p><hp:run><hp:t>{text}</hp:t></hp:run></hp:p></hp:subList>'
            f'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/><hp:cellSpan colSpan="{cs}" rowSpan="{rs}"/></hp:tc>')


def _hwpx(path: Path) -> Path:
    banner = f'<hp:tbl rowCnt="1" colCnt="2"><hp:tr>{_tc(0, 0, "Ⅳ")}{_tc(0, 1, "제안서 작성 요령")}</hp:tr></hp:tbl>'
    grid = (
        '<hp:tbl rowCnt="3" colCnt="2">'
        f'<hp:tr>{_tc(0, 0, "항 목")}{_tc(0, 1, "작성 방법")}</hp:tr>'
        f'<hp:tr>{_tc(1, 0, "Ⅱ. 전략", rs=2)}{_tc(1, 1, "사업이해도 | 요약")}</hp:tr>'
        f'<hp:tr>{_tc(2, 1, "추진전략")}</hp:tr>'
        "</hp:tbl>"
    )
    section = (
        f"<hs:sec {NS} xmlns:hs=\"http://www.hancom.co.kr/hwpml/2011/section\">"
        + _p("[협상에 의한 계약]", 0)
        + _p("2026. 8.", 5000)
        + _p("", 0, inner=banner)  # vertpos 가 되돌아감 → 새 쪽
        + _p("가. 제안서의 효력", 1000)
        + _p("", 2000, inner=grid)
        + _p("[붙임 2호 서식]", 3000, page_break=True)
        + "</hs:sec>"
    )
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("mimetype", "application/hwp+zip")
        zf.writestr("Contents/section0.xml", section)
    return path


@pytest.fixture()
def derived(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    out = tmp_path / "derived"
    monkeypatch.setenv("VIBE_DERIVED_DIR", str(out))
    return out


def test_render_pages_tables_headings(tmp_path: Path) -> None:
    rendered = doc_text.render(str(_hwpx(tmp_path / "제안요청서.hwpx")))
    lines = rendered.text.splitlines()
    assert rendered.kind == "hwpx" and rendered.title == "제안요청서"
    assert [lines[n - 1] for n in rendered.page_starts] == ["<!-- page 1 -->", "<!-- page 2 -->", "<!-- page 3 -->"]
    assert "2026. 8." in lines and "# 2026. 8." not in lines  # 번호만 있는 줄은 제목이 아니다
    assert "# Ⅳ 제안서 작성 요령" in lines  # 한 줄 표 = 장 제목 상자
    assert any(ln.startswith("###") and "제안서의 효력" in ln for ln in lines)
    assert "[표 p2-1]" in lines
    assert "| Ⅱ. 전략 | 사업이해도 \\| 요약 |" in lines  # 병합 칸 · 파이프 이스케이프
    assert "|  | 추진전략 |" in lines
    assert lines.index("<!-- page 3 -->") < lines.index("[붙임 2호 서식]")


def test_derived_cache_and_source_mapping(tmp_path: Path, derived: Path) -> None:
    src = _hwpx(tmp_path / "rfp.hwpx")
    out = doc_text.derived_path(str(src))
    assert out and Path(out).parent == derived and Path(out).read_text(encoding="utf-8").startswith("<!-- page 1 -->")
    assert doc_text.derived_path(str(src)) == out  # 같은 파일은 캐시를 다시 쓴다
    assert doc_text.source_of(out) == str(src.resolve())
    assert doc_text.source_of(str(src)) is None
    broken = tmp_path / "broken.hwpx"
    broken.write_bytes(b"not a zip")
    assert doc_text.derived_path(str(broken)) is None


def test_vibefs_index_and_hook_redirect(tmp_path: Path, derived: Path) -> None:
    (tmp_path / "자료").mkdir()
    src = _hwpx(tmp_path / "자료" / "rfp.hwpx")
    items = [MountItem(str(tmp_path / "자료"), "dir_x", "자료", kind="dir")]
    entry = WorkspaceIndex.build(items).get("자료/rfp.hwpx")
    assert entry is not None and entry.is_text and "# Ⅳ 제안서 작성 요령" in [f"# {h.text}" for h in entry.headings]

    store = WorkspaceStore(str(tmp_path / "ws"))
    store.set_mount("asst-1", items, "conv-1")
    call = {"toolCall": {"name": "read_file", "args": {"Path": str(src), "StartLine": 1}}, "conversationId": "conv-1"}
    decision = decide(call, store)
    redirected = decision["overwrite"]["Path"]
    assert decision["decision"] == "allow" and doc_text.source_of(redirected) == str(src.resolve())
    again = {"toolCall": {"name": "read_file", "args": {"Path": redirected}}, "conversationId": "conv-1"}
    assert decide(again, store) == {"decision": "allow"}


def test_resource_ingest_reads_hwpx(tmp_path: Path) -> None:
    report = ingest_sources([str(_hwpx(tmp_path / "rfp.hwpx"))], ScopeProfile())
    assert not report.skipped and len(report.docs) == 1
    doc = report.docs[0]
    assert doc.kind == "hwpx" and len(doc.page_starts) == 3 and "[표 p2-1]" in doc.text


# --- 서식 그대로 옮기기 (hwpx → vdoc) ------------------------------------------------------------

HH = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
HEADER = (
    f"<hh:head {HH}><hh:refList>"
    '<hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕"/></hh:fontface></hh:fontfaces>'
    "<hh:borderFills>"
    '<hh:borderFill id="1"><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/>'
    '<hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/>'
    '<hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/></hh:borderFill>'
    '<hh:borderFill id="3"><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/>'
    '<hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="DOUBLE_SLIM" width="0.5 mm" color="#333333"/>'
    '<hh:bottomBorder type="DASH" width="0.4 mm" color="#000000"/>'
    '<hc:fillBrush><hc:winBrush faceColor="#E5E5E5" hatchColor="#000000" alpha="0"/></hc:fillBrush></hh:borderFill>'
    "</hh:borderFills>"
    "<hh:charProperties>"
    '<hh:charPr id="0" height="1000" textColor="#000000"><hh:fontRef hangul="0"/></hh:charPr>'
    '<hh:charPr id="7" height="1500" textColor="#000000"><hh:fontRef hangul="0"/><hh:bold/></hh:charPr>'
    "</hh:charProperties>"
    "<hh:paraProperties>"
    '<hh:paraPr id="0"><hh:align horizontal="JUSTIFY"/><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>'
    '<hh:paraPr id="5"><hh:align horizontal="CENTER"/><hh:lineSpacing type="PERCENT" value="130"/></hh:paraPr>'
    "</hh:paraProperties>"
    "</hh:refList></hh:head>"
)


def _stc(row: int, col: int, text: str, *, rs: int = 1, cs: int = 1, w: int = 7500, fill: str = "3",
         char: str = "0", para: str = "0") -> str:
    run = f'<hp:run charPrIDRef="{char}"><hp:t>{text}</hp:t></hp:run>' if text else f'<hp:run charPrIDRef="{char}"/>'
    return (f'<hp:tc borderFillIDRef="{fill}"><hp:subList vertAlign="CENTER"><hp:p paraPrIDRef="{para}">{run}</hp:p></hp:subList>'
            f'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/><hp:cellSpan colSpan="{cs}" rowSpan="{rs}"/>'
            f'<hp:cellSz width="{w}" height="1500"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>')


def _styled_hwpx(path: Path) -> Path:
    form = (
        '<hp:tbl rowCnt="3" colCnt="3"><hp:sz width="22500" height="4500"/>'
        f'<hp:tr>{_stc(0, 0, "사 업 명", char="7", para="5")}{_stc(0, 1, "사업기간", char="7", para="5", cs=2, w=15000)}</hp:tr>'
        f'<hp:tr>{_stc(1, 0, "구분", rs=2)}{_stc(1, 1, "")}{_stc(1, 2, "")}</hp:tr>'
        f'<hp:tr>{_stc(2, 1, "")}{_stc(2, 2, "비고")}</hp:tr>'
        "</hp:tbl>"
    )
    section = (
        f"<hs:sec {NS} xmlns:hs=\"http://www.hancom.co.kr/hwpml/2011/section\">"
        '<hp:p><hp:run><hp:secPr><hp:pagePr width="59528" height="84188">'
        '<hp:margin left="5669" right="5669" top="4252" bottom="4252" header="2835" footer="2835"/></hp:pagePr></hp:secPr></hp:run>'
        '<hp:linesegarray><hp:lineseg vertpos="0"/></hp:linesegarray></hp:p>'
        + _p("Ⅲ장 마지막 문단", 1000)
        + '<hp:p paraPrIDRef="5"><hp:run charPrIDRef="7"><hp:t>[붙임 4호 서식]</hp:t></hp:run>'
          '<hp:linesegarray><hp:lineseg vertpos="2000"/></hp:linesegarray></hp:p>'
        + _p("", 3000, inner=form)
        + _p("※ 연도순으로 기재", 9000)
        + _p("[붙임 5호 서식]", 0)
        + "</hs:sec>"
    )
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("mimetype", "application/hwp+zip")
        zf.writestr("Contents/header.xml", HEADER)
        zf.writestr("Contents/section0.xml", section)
    return path


def _uid() -> Any:
    counter = itertools.count()
    return lambda: f"{next(counter):04d}"


def test_build_pages_keeps_form_table_shape(tmp_path: Path) -> None:
    parsed = hwpx.parse(str(_styled_hwpx(tmp_path / "form.hwpx")))
    assert [p.number for p in parsed.pages] == [1, 2]
    assert parsed.setup.margin == (5669, 5669, 4252 + 2835, 4252 + 2835)
    result = hwpx_vdoc.build_pages(parsed, [1], start_at="[붙임 4호", uid=_uid())
    page = result.pages[0]
    kinds = [b["kind"] for b in page["blocks"]]
    assert kinds == ["text", "structured-table", "text"]  # 앞 장의 꼬리는 start_at 으로 잘린다
    assert page["pageLabel"] == "원문 p1" and page["layout"]["margin"]["left"] == round(5669 / 75, 1)
    assert "'함초롬바탕'" in page["layout"]["fontFamily"]
    table = page["blocks"][1]
    assert table["columnWidths"] == ["33.33%", "33.33%", "33.33%"] and table["tableWidthRatio"] == round(22500 / (59528 - 2 * 5669), 4)
    head, row1, row2 = table["rows"]
    assert head["cells"][1]["colSpan"] == 2 and row1["cells"][0]["rowSpan"] == 2 and len(row2["cells"]) == 2
    first = head["cells"][0]
    assert first["fontWeight"] == "bold" and first["fontSize"] == "20px" and first["hAlign"] == "center"
    assert first["borderLeft"] == "1px solid #000000" and first["borderTop"] == "3px double #333333"
    assert first["borderBottom"] == "2px dashed #000000" and first["backgroundColor"] == "#E5E5E5"
    assert first["vAlign"] == "middle" and first["padding"] == "1.9px 6.8px 1.9px 6.8px"
    roles = {result.slots[c["slotId"]]["role"] for c in row1["cells"][1:]}
    assert roles == {"editable-slot"} and result.slots[first["slotId"]]["role"] == "boilerplate"
    assert result.reports[0].tables == 1 and result.reports[0].fill_cells == 3
    title = result.slots[page["blocks"][0]["slotId"]]["content"]
    assert title == '<p><strong><span style="font-size: 20px">[붙임 4호 서식]</span></strong></p>'
    assert page["blocks"][0]["align"] == "center" and page["layout"]["exactText"] is True
    assert result.slots[page["blocks"][0]["slotId"]]["constraints"] == {"lineHeight": "1.3"}  # 원문 줄 간격 130%
    assert first["lineHeight"] == "1.3"
    with pytest.raises(ValueError, match="no such source pages"):
        hwpx_vdoc.build_pages(parsed, [9], uid=_uid())
    assert hwpx_vdoc.parse_numbers("24-26, p35,24") == [24, 25, 26, 35]


def test_page_splits_long_paragraph_and_tall_table(tmp_path: Path) -> None:
    """문단 안 줄 위치가 되돌아가면 그 글자에서, 본문 높이를 넘는 표는 행 경계에서 쪽을 나눈다 (제목 행 되풀이)."""
    long_para = ('<hp:p><hp:run><hp:t>앞쪽 글뒤쪽 글</hp:t></hp:run><hp:linesegarray>'
                 '<hp:lineseg textpos="0" vertpos="60000"/><hp:lineseg textpos="4" vertpos="0"/></hp:linesegarray></hp:p>')
    rows = "".join(f'<hp:tr>{_stc(r, 0, f"행{r}", w=10000)}{_stc(r, 1, "", w=10000)}</hp:tr>'
                   for r in range(1, 30)).replace('height="1500"', 'height="3000"')
    head = ('<hp:tr><hp:tc header="1" borderFillIDRef="3"><hp:subList><hp:p><hp:run><hp:t>머리</hp:t></hp:run></hp:p></hp:subList>'
            '<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="2" rowSpan="1"/><hp:cellSz width="20000" height="1500"/></hp:tc></hp:tr>')
    tall = f'<hp:tbl rowCnt="30" colCnt="2" pageBreak="CELL" repeatHeader="1"><hp:sz width="20000" height="45000"/>{head}{rows}</hp:tbl>'
    section = (
        f"<hs:sec {NS} xmlns:hs=\"http://www.hancom.co.kr/hwpml/2011/section\">"
        '<hp:p><hp:run><hp:secPr><hp:pagePr width="59528" height="84188">'
        '<hp:margin left="5669" right="5669" top="4252" bottom="4252" header="2835" footer="2835"/></hp:pagePr></hp:secPr></hp:run>'
        '<hp:linesegarray><hp:lineseg vertpos="0"/></hp:linesegarray></hp:p>'
        + long_para
        + _p("", 2000, inner=tall)
        + "</hs:sec>"
    )
    path = tmp_path / "split.hwpx"
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("Contents/header.xml", HEADER)
        zf.writestr("Contents/section0.xml", section)
    parsed = hwpx.parse(str(path))
    texts = [[i.text for i in p.items if isinstance(i, hwpx.Para) and i.text] for p in parsed.pages]
    assert texts[:2] == [["앞쪽 글"], ["뒤쪽 글"]]  # textpos 4 에서 다음 쪽
    # 본문 높이 84188 - 2*(4252+2835) = 70014. 표는 2쪽 vertpos 2000 에서 시작 → 남는 68014 에 머리 1500 + 3000*22 행
    pages_with_tables = [(p.number, i) for p in parsed.pages for i in p.items if isinstance(i, hwpx.Table)]
    assert [n for n, _ in pages_with_tables] == [2, 3]
    first, second = (t for _, t in pages_with_tables)
    assert first.rows == 23 and second.rows == 1 + 7
    assert hwpx.item_text(second.cells[0].content[0]) == "머리" and second.cells[0].header  # 제목 행 되풀이
    assert hwpx.item_text(second.cells[1].content[0]) == "행23"
    out = hwpx_vdoc.build_pages(parsed, [3], uid=_uid())
    assert out.reports[0].fill_cells == 7

    from tests.test_compose_tools import FakeApi, FakeStore

    src = _styled_hwpx(tmp_path / "form.hwpx")

    class _Index:
        files: list[Any] = []

        def get(self, path: str) -> Any:
            if Path(path).name == "form.hwpx":
                return type("E", (), {"abs_path": str(src), "rel": "자료/form.hwpx", "resource_id": "file_x"})()
            return None

    api = FakeApi()
    tools = DocTools(FakeStore({"projectId": "proj-a"}), "s1", index=_Index(), api=api)  # type: ignore[arg-type]
    listing = tools.call("dc_source_pages", {"path": "form.hwpx"})
    assert "p1:" in listing and "p2:" in listing and "tables 1 · empty cells 3" in listing
    tools.call("dc_new", {"title": "서식", "surface": "paged", "genre": "document"})
    doc_id = tools.store.state["docId"]
    out = tools.call("dc_import", {"path": "form.hwpx", "pages": "1-2", "start_at": "[붙임 4호"})
    doc = api.docs[doc_id]
    assert [p["pageLabel"] for p in doc["pages"]] == ["원문 p1", "원문 p2"]  # 빈 첫 쪽은 대체됐다
    assert [p["pageNumber"] for p in doc["pages"]] == [1, 2]
    assert "p1 ← 원문 p1" in out and "빈 칸 3" in out
    assert doc["origin"]["imports"][0]["pages"] == [1, 2]
    table = next(b for b in doc["pages"][0]["blocks"] if b["kind"] == "structured-table")
    assert all(c["slotId"] in doc["slots"] for r in table["rows"] for c in r["cells"])
    assert "structured-table" in tools.call("dc_outline", {})
    with pytest.raises(ValueError, match="마운트에서 찾지 못한"):
        tools.call("dc_import", {"path": "other.hwpx", "pages": "1"})
    api.docs[doc_id]["origin"] = {"createdBy": "user"}
    with pytest.raises(ValueError, match="사람이 만든 문서"):
        tools.call("dc_import", {"path": "form.hwpx", "pages": "1"})


def test_citation_spanning_consecutive_reads_is_verified() -> None:
    from app.assistant.workspace.citations import Citation, verify_citations

    reads = [{"path": "C:/x/rfp.hwpx", "start": 850, "end": 950}, {"path": "C:/x/rfp.hwpx", "start": 940, "end": 1140}]
    ok = Citation(target="rfp.hwpx", label="rfp", start_line=860, end_line=1100)
    gap = Citation(target="rfp.hwpx", label="rfp", start_line=700, end_line=1100)
    checked, warnings = verify_citations([ok, gap], reads)
    assert checked[0].is_verified and not checked[1].is_verified and len(warnings) == 1


def test_tall_single_row_box_is_cut_between_cell_paragraphs(tmp_path: Path) -> None:
    """한 행짜리 큰 상자(목차 등)가 쪽 중간에서 시작해 넘치면 칸 안 문단 경계에서 다음 쪽으로 (한글 저장본 실측)."""
    paras = "".join(
        f'<hp:p><hp:run><hp:t>줄{i}</hp:t></hp:run><hp:linesegarray><hp:lineseg vertpos="{i * 2000}"/></hp:linesegarray></hp:p>'
        for i in range(28)
    )
    box = ('<hp:tbl rowCnt="1" colCnt="1" pageBreak="CELL" repeatHeader="1"><hp:sz width="40000" height="30000"/><hp:tr>'
           f'<hp:tc borderFillIDRef="3"><hp:subList>{paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/>'
           '<hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="40000" height="56282"/>'
           '<hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl>')
    section = (
        f"<hs:sec {NS} xmlns:hs=\"http://www.hancom.co.kr/hwpml/2011/section\">"
        '<hp:p><hp:run><hp:secPr><hp:pagePr width="59528" height="84188">'
        '<hp:margin left="5669" right="5669" top="4252" bottom="4252" header="2835" footer="2835"/></hp:pagePr></hp:secPr></hp:run>'
        '<hp:linesegarray><hp:lineseg vertpos="0"/></hp:linesegarray></hp:p>'
        + _p("다. 제안서 목차", 38000)
        + _p("", 40000, inner=box)
        + _p("라. 제안서 세부 작성지침", 26000)
        + "</hs:sec>"
    )
    path = tmp_path / "box.hwpx"
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("Contents/header.xml", HEADER)
        zf.writestr("Contents/section0.xml", section)
    parsed = hwpx.parse(str(path))
    assert len(parsed.pages) == 2
    first, second = (next(i for i in p.items if isinstance(i, hwpx.Table)) for p in parsed.pages)
    lines = lambda t: [x.text for x in t.cells[0].paras]  # noqa: E731
    # 남은 높이 70014 - 40000 = 30014 → 칸 여백을 빼고 2000 간격 줄 14개(줄0~줄13)가 들어간다
    assert lines(first) == [f"줄{i}" for i in range(14)] and lines(second)[0] == "줄14"
    assert second.cells[0].paras[0].top == 0 and not second.cells[0].continued
    assert [i.text for i in parsed.pages[1].items if isinstance(i, hwpx.Para) and i.text] == ["라. 제안서 세부 작성지침"]


def test_spanning_label_cell_text_is_divided_at_table_split() -> None:
    """여러 행을 덮는 세로 제목 칸이 쪽에서 나뉘면 그 칸의 글도 경계에서 나눈다 (앞 조각이 글 때문에 늘지 않게)."""
    label = hwpx.Cell(row=0, col=0, row_span=4, height=12000,
                      content=[hwpx.Para(runs=[hwpx.Run(f"글{i}", hwpx.CharStyle())], top=i * 2000) for i in range(6)])
    rows = [hwpx.Cell(row=r, col=1, height=3000, content=[hwpx.Para(runs=[hwpx.Run(f"행{r}", hwpx.CharStyle())], top=0)])
            for r in range(4)]
    table = hwpx.Table(rows=4, cols=2, width=20000, cells=[label, *rows], page_break="CELL")
    first, second = table.split(first_avail=6500, body=70000)
    head = next(c for c in first.cells if c.col == 0)
    tail = next(c for c in second.cells if c.col == 0)
    # 앞 조각 = 2행(6000) - 칸 여백 282 = 5718 → 아래 끝이 그 안인 글0 · 글1 (글2 의 끝은 6000) — 나머지는 다음 조각
    assert [p.text for p in head.paras] == ["글0", "글1"] and head.row_span == 2
    assert [p.text for p in tail.paras] == ["글2", "글3", "글4", "글5"] and tail.paras[0].top == 0 and not tail.continued
