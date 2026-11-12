"""Deterministic PyMuPDF generator for the 9 layout-fidelity regression fixtures."""
from __future__ import annotations

import io
from pathlib import Path
from typing import Callable

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ALL_FIXTURE_NAMES: tuple[str, ...] = (
    "narrow_center_cell",
    "left_right_same_line",
    "toc_lines",
    "running_header_logo",
    "page_background_panel",
    "clause_paragraphs",
    "mixed_spacing",
    "raster_text_photo",
    "font_sizes_mix",
)

_FONT_REGULAR_CANDIDATES = (
    Path("C:/Windows/Fonts/malgun.ttf"),
    Path("C:/Windows/Fonts/NanumGothic.ttf"),
    Path("C:/Windows/Fonts/gulim.ttc"),
)
_FONT_BOLD_CANDIDATES = (
    Path("C:/Windows/Fonts/malgunbd.ttf"),
    Path("C:/Windows/Fonts/malgun.ttf"),
)


def _find_font(candidates: tuple[Path, ...]) -> str | None:
    for p in candidates:
        if p.is_file():
            return str(p)
    return None


def _setup_fonts(page: pymupdf.Page) -> tuple[str, str]:
    reg_path = _find_font(_FONT_REGULAR_CANDIDATES)
    bold_path = _find_font(_FONT_BOLD_CANDIDATES)
    if reg_path:
        page.insert_font(fontname="ko_reg", fontfile=reg_path)
        reg_name = "ko_reg"
    else:
        reg_name = "helv"
    if bold_path:
        page.insert_font(fontname="ko_bold", fontfile=bold_path)
        bold_name = "ko_bold"
    else:
        bold_name = "hebo"
    return reg_name, bold_name


def _draw_text(
    page: pymupdf.Page,
    x: float,
    y_baseline: float,
    text: str,
    *,
    fontname: str,
    fontsize: float,
    color: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> None:
    page.insert_text(
        pymupdf.Point(x, y_baseline),
        text,
        fontname=fontname,
        fontsize=fontsize,
        color=color,
    )


def _fx_narrow_center_cell(out_path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595.0, height=842.0)
    reg, bold = _setup_fonts(page)
    _draw_text(page, 56, 72, "품목별 수량 및 검토 요약표", fontname=bold, fontsize=14)

    # Column widths intentionally narrow on cols 0, 2 so default 8px+8px or 12pt symmetric gap wraps!
    col_xs = [56.0, 102.0, 290.0, 340.0, 539.0]  # col0=46pt, col2=50pt
    row_ys = [96.0, 122.0, 148.0, 174.0, 200.0]
    for y in row_ys:
        page.draw_line(pymupdf.Point(col_xs[0], y), pymupdf.Point(col_xs[-1], y), color=(0.15, 0.2, 0.25), width=0.8)
    for x in col_xs:
        page.draw_line(pymupdf.Point(x, row_ys[0]), pymupdf.Point(x, row_ys[-1]), color=(0.15, 0.2, 0.25), width=0.8)

    rows = [
        ["번호", "세부 점검 항목", "구분", "검토 기준 및 비고"],
        ["01", "출입 보안 장치 점검", "필수", "월 1회 정기 점검 기록 유지"],
        ["02", "비상 연락망 현행화", "권장", "담당자 변경 시 즉시 갱신"],
        ["03", "화재 감지기 작동 확인", "필수", "이상 발견 시 즉시 보수 요청"],
    ]
    for ri, rvals in enumerate(rows):
        y0, y1 = row_ys[ri], row_ys[ri + 1]
        y_base = y0 + (y1 - y0) * 0.65
        fn = bold if ri == 0 else reg
        for ci, txt in enumerate(rvals):
            x0, x1 = col_xs[ci], col_xs[ci + 1]
            cw = x1 - x0
            tw = len(txt) * (9.5 if ord(txt[0]) > 127 else 5.5)
            if ci in (0, 2):
                tx = x0 + max(2.0, (cw - tw) * 0.5)
            else:
                tx = x0 + 6.0
            _draw_text(page, tx, y_base, txt, fontname=fn, fontsize=10.0)
    doc.save(str(out_path))
    doc.close()


def _fx_left_right_same_line(out_path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595.0, height=842.0)
    reg, bold = _setup_fonts(page)
    _draw_text(page, 210, 74, "정기 회의 결과 보고서", fontname=bold, fontsize=16)

    pairs = [
        ("일시 : 2026년 5월 1일 14:00", "작성자 : 관리담당 홍길동"),
        ("장소 : 제2회의실 (본관 3층)", "검토자 : 운영팀장 김철수"),
        ("문서번호 : DOC-2026-051", "보존기간 : 5년 (대외용)"),
    ]
    y = 120.0
    for left, right in pairs:
        _draw_text(page, 56, y, left, fontname=reg, fontsize=10.5)
        _draw_text(page, 375, y, right, fontname=reg, fontsize=10.5)
        y += 20.0

    _draw_text(page, 56, 210, "1. 주요 안건 및 처리 현황", fontname=bold, fontsize=12)
    _draw_text(page, 56, 232, "각 부서별 제출 자료를 검토하고 차기 일정을 확정하였다.", fontname=reg, fontsize=10.5)
    doc.save(str(out_path))
    doc.close()


def _fx_toc_lines(out_path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595.0, height=842.0)
    reg, bold = _setup_fonts(page)
    _draw_text(page, 240, 78, "목 차", fontname=bold, fontsize=18)

    toc = [
        ("제1장 총칙 및 적용 목적", "................................................", "3"),
        ("제2장 조직 구성 및 역할 분담", "........................................", "8"),
        ("제3장 회의 소집 및 의결 절차", "......................................", "14"),
        ("제4장 자료 보존 및 공개 원칙", "......................................", "19"),
        ("부칙 시행일 및 경과 조치", "............................................", "24"),
    ]
    y = 132.0
    for title, dots, pg in toc:
        _draw_text(page, 64, y, f"{title} {dots}", fontname=reg, fontsize=11.0)
        _draw_text(page, 505, y, pg, fontname=reg, fontsize=11.0)
        y += 24.0
    doc.save(str(out_path))
    doc.close()


def _make_logo_png_bytes() -> bytes:
    img = Image.new("RGB", (96, 32), (28, 78, 168))
    d = ImageDraw.Draw(img)
    d.rectangle([4, 4, 28, 28], fill=(245, 190, 40))
    d.line([36, 16, 88, 16], fill=(255, 255, 255), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _fx_running_header_logo(out_path: Path) -> None:
    doc = pymupdf.open()
    logo_bytes = _make_logo_png_bytes()
    bodies = [
        "제1절 시스템 개요\n본 매뉴얼은 문서 서식 표준화 및 점검 절차를 안내한다.",
        "제2절 입력 검증\n모든 필드는 필수 입력 규칙과 형식 검사를 통과해야 한다.",
        "제3절 보관 및 감사\n검증 완료 이력은 타임스탬프와 함께 안전하게 기록된다.",
    ]
    for pno, body in enumerate(bodies, start=1):
        page = doc.new_page(width=595.0, height=842.0)
        reg, bold = _setup_fonts(page)
        page.insert_image(pymupdf.Rect(56, 26, 108, 44), stream=logo_bytes)
        _draw_text(page, 120, 40, "2026 표준 운영 매뉴얼 | 내부 검토용", fontname=bold, fontsize=9.5, color=(0.25, 0.3, 0.38))
        page.draw_line(pymupdf.Point(56, 48), pymupdf.Point(539, 48), color=(0.75, 0.78, 0.84), width=0.6)

        lines = body.splitlines()
        _draw_text(page, 56, 110, lines[0], fontname=bold, fontsize=13.0)
        _draw_text(page, 56, 136, lines[1], fontname=reg, fontsize=10.5)

        page.draw_line(pymupdf.Point(56, 785), pymupdf.Point(539, 785), color=(0.75, 0.78, 0.84), width=0.6)
        _draw_text(page, 275, 804, f"- {pno} -", fontname=reg, fontsize=9.0, color=(0.35, 0.4, 0.45))
    doc.save(str(out_path))
    doc.close()


def _fx_page_background_panel(out_path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595.0, height=842.0)
    reg, bold = _setup_fonts(page)
    # Full-page light tinted background (#f2f6fb)
    page.draw_rect(pymupdf.Rect(0, 0, 595, 842), color=None, fill=(0.949, 0.965, 0.984))
    _draw_text(page, 56, 78, "안내문 및 주요 유의사항", fontname=bold, fontsize=16)

    # Colored panel box (1x1 filled box)
    page.draw_rect(
        pymupdf.Rect(56, 110, 539, 178),
        color=(0.2, 0.4, 0.65),
        fill=(0.86, 0.91, 0.98),
        width=1.0,
    )
    _draw_text(page, 70, 134, "※ 접수 전 확인 사항", fontname=bold, fontsize=11, color=(0.12, 0.25, 0.45))
    _draw_text(page, 70, 156, "제출 서류 일체는 스캔 해상도 200dpi 이상으로 준비해 주시기 바랍니다.", fontname=reg, fontsize=10)

    _draw_text(page, 56, 224, "1. 기본 작성 요령", fontname=bold, fontsize=12)
    _draw_text(page, 56, 246, "작성된 서식은 검토 담당자의 확인을 거쳐 최종 승인 처리된다.", fontname=reg, fontsize=10.5)
    doc.save(str(out_path))
    doc.close()


def _fx_clause_paragraphs(out_path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595.0, height=842.0)
    reg, bold = _setup_fonts(page)
    _draw_text(page, 215, 72, "위원회 운영 세부 규칙", fontname=bold, fontsize=15)

    # Intentionally varying gaps: small (16pt baseline -> ~5pt gap), medium (28pt), large (44pt)
    _draw_text(page, 56, 112, "제1조(목적) 이 규칙은 기관 내 문서 검토 절차의 일관성을 확보함을 목적으로 한다.", fontname=reg, fontsize=10.5)
    _draw_text(page, 56, 128, "모든 구성원은 본 기준에 따라 서식을 작성하고 보관하여야 한다.", fontname=reg, fontsize=10.5)

    _draw_text(page, 56, 166, "제2조(적용 범위) 본 규칙은 모든 신규 작성 및 개정 서식에 적용한다.", fontname=reg, fontsize=10.5)

    _draw_text(page, 56, 218, "제3조(보관 기한) 확정된 문서는 전자 저장소에 최소 3년간 보존한다.", fontname=reg, fontsize=10.5)
    doc.save(str(out_path))
    doc.close()


def _fx_mixed_spacing(out_path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595.0, height=842.0)
    reg, bold = _setup_fonts(page)
    _draw_text(page, 56, 70, "줄간격 및 조판 기준 예시", fontname=bold, fontsize=13)

    # Consistent tight/normal body with baseline step ~ 19.8pt on 11pt font -> lineHeight ~ 1.80
    lines = [
        "첫 번째 줄은 본문 기준 글꼴 크기 11포인트로 조판되어 있다.",
        "두 번째 줄 역시 동일한 기준선 간격 19.8포인트로 배치되어 있다.",
        "세 번째 줄은 문단 내 줄간격이 1.80 배율로 계산되도록 유지한다.",
        "네 번째 줄까지 연속된 줄간격 데이터를 충분히 제공한다.",
        "다섯 번째 줄은 표본 오차를 줄이기 위한 추가 확인 문장이다.",
    ]
    y = 110.0
    for ln in lines:
        _draw_text(page, 56, y, ln, fontname=reg, fontsize=11.0)
        y += 19.8
    doc.save(str(out_path))
    doc.close()


def _fx_raster_text_photo(out_path: Path) -> None:
    # Build crisp text + genuine photographic patch at 200 DPI into a single raster image PDF
    dpi = 200
    w_pt, h_pt = 595.0, 842.0
    w_px = int(round(w_pt * dpi / 72.0))
    h_px = int(round(h_pt * dpi / 72.0))
    img = Image.new("RGB", (w_px, h_px), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    font_path = _find_font(_FONT_REGULAR_CANDIDATES)
    px_scale = dpi / 72.0
    if font_path:
        f_title = ImageFont.truetype(font_path, int(round(16 * px_scale)))
        f_body = ImageFont.truetype(font_path, int(round(11 * px_scale)))
    else:
        f_title = ImageFont.load_default()
        f_body = ImageFont.load_default()

    draw.text((int(56 * px_scale), int(64 * px_scale)), "스캔 현장 점검 리포트", fill=(15, 15, 15), font=f_title)
    draw.text((int(56 * px_scale), int(108 * px_scale)), "1. 점검 일시 및 현장 사진 기록입니다.", fill=(20, 20, 20), font=f_body)
    draw.text((int(56 * px_scale), int(134 * px_scale)), "2. 아래 사진 영역은 텍스트로 잘못 추출되면 안 됩니다.", fill=(20, 20, 20), font=f_body)

    # Draw a continuous-tone chromatic photo patch at (80..380pt, 180..360pt)
    px0, py0 = int(80 * px_scale), int(180 * px_scale)
    px1, py1 = int(380 * px_scale), int(360 * px_scale)
    for yy in range(py0, py1, 2):
        frac_y = (yy - py0) / max(1, py1 - py0)
        r = int(40 + 180 * frac_y)
        g = int(120 + 90 * (1.0 - frac_y))
        b = int(200 - 110 * frac_y)
        draw.rectangle([px0, yy, px1, min(py1, yy + 2)], fill=(r, g, b))
    draw.ellipse([px0 + 60, py0 + 40, px0 + 220, py0 + 180], fill=(220, 95, 50))
    draw.polygon([(px0 + 300, py1 - 10), (px0 + 480, py0 + 60), (px1 - 30, py1 - 10)], fill=(45, 145, 70))

    draw.text((int(80 * px_scale), int(376 * px_scale)), "그림 1. 현장 시설물 전경 촬영 사진", fill=(30, 30, 30), font=f_body)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    doc = pymupdf.open()
    page = doc.new_page(width=w_pt, height=h_pt)
    page.insert_image(pymupdf.Rect(0, 0, w_pt, h_pt), stream=buf.getvalue())
    doc.save(str(out_path))
    doc.close()


def _fx_font_sizes_mix(out_path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595.0, height=842.0)
    reg, bold = _setup_fonts(page)
    _draw_text(page, 56, 76, "2026 연간 정책 제안서", fontname=bold, fontsize=24.0)
    _draw_text(page, 56, 122, "제1부 추진 배경 및 방향", fontname=bold, fontsize=15.0)
    _draw_text(page, 56, 154, "본 문서는 다양한 글꼴 크기가 원문 그대로 유지되는지 검증한다.", fontname=reg, fontsize=11.0)
    _draw_text(page, 56, 174, "강조 구문은 굵게 표시되며 본문 크기와 구분되어야 한다.", fontname=reg, fontsize=11.0)
    _draw_text(page, 56, 204, "* 주석: 작은 글꼴(8.5pt) 참고 문구도 본문 크기에 흡수되지 않아야 한다.", fontname=reg, fontsize=8.5, color=(0.35, 0.38, 0.42))
    doc.save(str(out_path))
    doc.close()


_BUILDERS: dict[str, Callable[[Path], None]] = {
    "narrow_center_cell": _fx_narrow_center_cell,
    "left_right_same_line": _fx_left_right_same_line,
    "toc_lines": _fx_toc_lines,
    "running_header_logo": _fx_running_header_logo,
    "page_background_panel": _fx_page_background_panel,
    "clause_paragraphs": _fx_clause_paragraphs,
    "mixed_spacing": _fx_mixed_spacing,
    "raster_text_photo": _fx_raster_text_photo,
    "font_sizes_mix": _fx_font_sizes_mix,
}


def build_layout_fixture(name: str, out_dir: Path) -> Path:
    if name not in _BUILDERS:
        raise KeyError(f"Unknown layout fixture: {name}")
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"{name}.pdf"
    _BUILDERS[name](target)
    return target


def build_all_layout_fixtures(out_dir: Path) -> dict[str, Path]:
    return {name: build_layout_fixture(name, out_dir) for name in ALL_FIXTURE_NAMES}

