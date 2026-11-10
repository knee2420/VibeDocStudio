"""PDF 글자(CharAtom) 단위 기하학 정규화.

GDI/HWP 인쇄 PDF 에서 빈번히 발생하는 3대 텍스트 손상을 결정론적으로 복구한다:
1. Faux-Bold 겹쳐찍기 중복 제거: 0.15em(또는 글자폭 45%) 반경 내 동일 글자 클러스터를 1개로 합치고 `bold=True` 승격
2. Font-Batched Backtracking 해소: `span` 이 아닌 `(baseline, char.x0)` 기준으로 문자를 엄격 재정렬해
   스트림 뒤쪽에 따로 찍힌 쉼표(,)·괄호(())·중점(·)을 제자리로 삽입 (음수 `margin-left` 폭주 원천 차단)
3. `TJ` 커닝 점프 공백 복원: 인접 문자 틈(`> char_gap_space_ratio * em`)에 실제 공백 `' '` 삽입
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Optional

from ..fonts.metrics import PX_PER_PT, FontMetrics, pick_font, solve_token_spacing
from ..fonts.registry import font_family
from ..models import CharAtom

PX = PX_PER_PT
_NO_SPACE_BEFORE = frozenset({",", ".", ":", ";", ")", "]", "}", "”", "’", "%", "?", "!"})
_NO_SPACE_AFTER = frozenset({"(", "[", "{", "“", "‘"})


def _hex_color(value: Any) -> str:
    if value is None:
        return "#000000"
    if isinstance(value, int):
        return f"#{value:06x}"
    return "#" + "".join(f"{round(c * 255):02x}" for c in value[:3])


def _r(v: float) -> float:
    return round(float(v), 2)


def _is_horizontal_glyph(line_dir: Optional[tuple[float, float]]) -> bool:
    if not line_dir or len(line_dir) < 2:
        return True
    return abs(float(line_dir[0])) >= abs(float(line_dir[1]))


def atoms_from_rawdict(
    raw_dict: dict[str, Any],
    *,
    font_meta: Optional[dict[str, dict[str, Any]]] = None,
) -> list[CharAtom]:
    """`page.get_text('rawdict')` 를 개별 `CharAtom` 목록(CSS px)으로 해체한다."""
    fmeta = font_meta or {}
    atoms: list[CharAtom] = []
    for bi, block in enumerate(raw_dict.get("blocks", [])):
        if block.get("type") != 0:
            continue
        for li, line in enumerate(block.get("lines", [])):
            if not _is_horizontal_glyph(line.get("dir")):
                continue
            for span in line.get("spans", []):
                pt = round(float(span.get("size") or 10.0), 2)
                font = str(span.get("font") or "")
                short = font.split("+", 1)[-1]
                clean_short = re.sub(r"-WinCharSet[0-9A-F]+-H\d*$", "", short, flags=re.I)
                meta = fmeta.get(font) or fmeta.get(short) or fmeta.get(clean_short) or {}
                has_to_unicode = bool(meta.get("hasToUnicode", True))
                bold = bool(int(span.get("flags") or 0) & 16) or ("bold" in font.lower())
                italic = bool(int(span.get("flags") or 0) & 2) or ("italic" in font.lower())
                color = _hex_color(span.get("color"))
                origin_y = float((span.get("origin") or (0.0, (span.get("bbox") or [0, 0, 0, 0])[3]))[1]) * PX

                for ch in span.get("chars", []):
                    c = str(ch.get("c") or "")
                    if not c:
                        continue
                    bx = ch.get("bbox") or (0.0, 0.0, 0.0, 0.0)
                    ox = float((ch.get("origin") or (bx[0], origin_y / PX))[0]) * PX
                    oy = float((ch.get("origin") or (bx[0], origin_y / PX))[1]) * PX
                    x0, y0, x1, y1 = float(bx[0]) * PX, float(bx[1]) * PX, float(bx[2]) * PX, float(bx[3]) * PX
                    # 일부 글꼴/문자는 bbox 높이가 0에 가까워 span y/y1 로 보정한다
                    if y1 <= y0:
                        sbx = span.get("bbox") or (0.0, 0.0, 0.0, 0.0)
                        y0, y1 = float(sbx[1]) * PX, float(sbx[3]) * PX
                    atoms.append(
                        CharAtom(
                            c=c,
                            x0=_r(x0),
                            y0=_r(y0),
                            x1=_r(max(x1, x0)),
                            y1=_r(max(y1, y0)),
                            origin_x=_r(ox),
                            baseline=_r(oy if oy > 0 else y1),
                            pt=pt,
                            font=font,
                            color=color,
                            bold=bold,
                            italic=italic,
                            block=bi,
                            line=li,
                            has_to_unicode=has_to_unicode,
                            is_space=c.isspace(),
                        )
                    )
    return atoms


def deduplicate_faux_bold(atoms: list[CharAtom]) -> list[CharAtom]:
    """같은 위치 반경(0.15em · 글자폭 45% 이내)에 겹쳐 찍힌 동일 글자를 1개로 합치고 bold 를 켠다."""
    vis = [a for a in atoms if not a.is_space]
    if not vis:
        return []

    by_char: dict[str, list[CharAtom]] = {}
    for a in vis:
        by_char.setdefault(a.c, []).append(a)

    kept = []
    for _ch, group in by_char.items():
        group.sort(key=lambda a: (a.baseline, a.x0, a.y0))
        consumed = [False] * len(group)
        for idx, a in enumerate(group):
            if consumed[idx]:
                continue
            w_a = max(1.0, a.x1 - a.x0)
            tol_x = max(1.0, min(2.4, min(a.pt * PX * 0.18, w_a * 0.48)))
            tol_y = max(1.0, min(2.6, a.pt * PX * 0.24))
            hits = [a]
            consumed[idx] = True
            for k in range(idx + 1, len(group)):
                if consumed[k]:
                    continue
                b = group[k]
                if b.baseline - a.baseline > tol_y:
                    break
                if (
                    abs(b.x0 - a.x0) <= tol_x
                    and abs(b.y0 - a.y0) <= tol_y
                    and abs(b.pt - a.pt) <= 0.6
                ):
                    hits.append(b)
                    consumed[k] = True
            if len(hits) == 1:
                kept.append(a)
            else:
                kept.append(
                    CharAtom(
                        c=a.c,
                        x0=_r(min(h.x0 for h in hits)),
                        y0=_r(min(h.y0 for h in hits)),
                        x1=_r(max(h.x1 for h in hits)),
                        y1=_r(max(h.y1 for h in hits)),
                        origin_x=_r(min(h.origin_x for h in hits)),
                        baseline=_r(sum(h.baseline for h in hits) / len(hits)),
                        pt=a.pt,
                        font=a.font,
                        color=a.color,
                        bold=True,
                        italic=any(h.italic for h in hits),
                        block=a.block,
                        line=a.line,
                        has_to_unicode=a.has_to_unicode,
                        is_space=False,
                    )
                )
    return kept


def _cluster_by_baseline(atoms: list[CharAtom], line_tol: float = 2.0) -> list[list[CharAtom]]:
    """보정된 CharAtom 목록을 기준선(baseline) 줄로 묶고 각 줄을 x0 오름차순으로 정렬한다."""
    if not atoms:
        return []
    ordered = sorted(atoms, key=lambda a: (a.baseline, a.x0))
    lines: list[list[CharAtom]] = [[ordered[0]]]
    anchor_base = ordered[0].baseline
    for atom in ordered[1:]:
        tol = max(line_tol, min(atom.pt, lines[-1][0].pt) * PX * 0.22)
        if abs(atom.baseline - anchor_base) <= tol:
            lines[-1].append(atom)
        else:
            lines.append([atom])
            anchor_base = atom.baseline
    return [sorted(ln, key=lambda a: (a.x0, a.origin_x)) for ln in lines]


def _space_count(
    prev: CharAtom,
    curr: CharAtom,
    *,
    space_ratio: float,
    column_break_ratio: float = 1.25,
) -> tuple[int, bool]:
    """인접 두 글자 간격에서 (삽입할 공백 개수, 다른 스팬 분리 여부)를 계산한다."""
    em = max(prev.pt, curr.pt, 6.0) * PX
    gap = curr.x0 - prev.x1
    if gap > column_break_ratio * em:
        return 0, True
    if curr.c in _NO_SPACE_BEFORE:
        return 0, False
    if prev.c in _NO_SPACE_AFTER and gap <= 0.45 * em:
        return 0, False
    if gap > space_ratio * em:
        # 일반 띄어쓰기(0.2~0.6em)는 1칸, 괄호 빈칸 등 넓은 간격만 비례 공백(최대 8칸)
        count = 1 if gap <= 0.65 * em else min(8, max(2, round(gap / (0.35 * em))))
        return count, False
    return 0, False


def _same_style(a: CharAtom, b: CharAtom) -> bool:
    return (
        abs(a.pt - b.pt) <= 0.4
        and a.bold == b.bold
        and a.italic == b.italic
        and a.color == b.color
        and a.font == b.font
        and a.has_to_unicode == b.has_to_unicode
    )


def _should_merge_punct_font(prev: CharAtom, curr: CharAtom, gap_px: float, em: float) -> bool:
    """한글 문장 안에 폰트만 바뀌어 끼워진 ASCII 문장부호(`,`, `.`, `(`, `)`)는 인접 시 스타일 분절을 최소화한다."""
    if not (curr.has_to_unicode and prev.has_to_unicode):
        return False
    if abs(curr.pt - prev.pt) > 0.4 or curr.bold != prev.bold or curr.color != prev.color:
        return False
    if gap_px > 0.65 * em or gap_px < -2.0:
        return False
    punct_chars = set(",.;:()[]{}-·~\"'!?")
    return curr.c in punct_chars or (prev.c in punct_chars and curr.c not in ("'", '"'))


def _crosses_vertical_wall(
    prev: CharAtom,
    curr: CharAtom,
    walls: list[tuple[float, float, float]],
) -> bool:
    """두 글자 중심 사이를 세로 구분선(표 열 경계)이 가로막고 있는지 판정한다."""
    if not walls:
        return False
    p_cx = (prev.x0 + prev.x1) / 2.0
    c_cx = (curr.x0 + curr.x1) / 2.0
    if p_cx >= c_cx:
        return False
    cy = (min(prev.y0, curr.y0) + max(prev.y1, curr.y1)) / 2.0
    return any(p_cx < wx < c_cx and (wy0 - 1.5) <= cy <= (wy1 + 1.5) for wx, wy0, wy1 in walls)


def normalize_chars_to_spans(
    atoms: list[CharAtom],
    *,
    font_map: Optional[dict[str, FontMetrics]] = None,
    font_meta: Optional[dict[str, dict[str, Any]]] = None,
    font_aliases: Optional[dict[str, str]] = None,
    warnings: Optional[list[str]] = None,
    faux_bold_dedup: bool = True,
    space_ratio: float = 0.20,
    vertical_walls: Optional[list[tuple[float, float, float]]] = None,
) -> list[dict[str, Any]]:
    """CharAtom 목록을 중복제거·x정렬·세로선분할·공백복원하여 `truth.json` 호환 `spans` 목록으로 변환한다."""
    fmeta = font_meta or {}
    walls = vertical_walls or []
    cleaned = deduplicate_faux_bold(atoms) if faux_bold_dedup else [a for a in atoms if not a.is_space]
    lines = _cluster_by_baseline(cleaned)
    spans_out: list[dict[str, Any]] = []
    warn_list = warnings if warnings is not None else []

    for li, ln_atoms in enumerate(lines):
        # 현재 조립 중인 스팬 상태: list of (atom, trailing_spaces_after_atom)
        groups: list[list[tuple[CharAtom, int]]] = [[(ln_atoms[0], 0)]]
        for curr in ln_atoms[1:]:
            prev, _ = groups[-1][-1]
            em = max(prev.pt, curr.pt, 6.0) * PX
            gap = curr.x0 - prev.x1
            spaces, hard_col_split = _space_count(prev, curr, space_ratio=space_ratio)

            if hard_col_split or _crosses_vertical_wall(prev, curr, walls):
                groups.append([(curr, 0)])
                continue

            same = _same_style(prev, curr) or _should_merge_punct_font(prev, curr, gap, em)
            if same:
                if spaces > 0:
                    groups[-1][-1] = (prev, spaces)
                groups[-1].append((curr, 0))
            else:
                # 다른 스타일 스팬으로 분리. 앞 스팬에 trailing_space 메타 남김
                if spaces > 0:
                    groups[-1][-1] = (prev, spaces)
                groups.append([(curr, 0)])

        for g in groups:
            first_atom = g[0][0]
            last_atom, last_trail = g[-1]
            text_parts: list[str] = []
            px_chars: list[dict[str, Any]] = []
            for a, sp_cnt in g:
                text_parts.append(a.c)
                px_chars.append({"c": a.c, "x": a.origin_x, "x_end": a.x1})
                if sp_cnt > 0:
                    text_parts.append(" " * sp_cnt)
                    step = max(2.0, a.pt * PX * 0.28)
                    for k in range(sp_cnt):
                        sx = a.x1 + k * step
                        px_chars.append({"c": " ", "x": sx, "x_end": sx + step})
            raw_text = "".join(text_parts)
            vis_text = raw_text.rstrip(" ")
            if not vis_text.strip():
                continue

            # 대표 폰트 (가장 많이 등장한 폰트, 심볼 제외 우선)
            font_counts: dict[str, int] = {}
            for a, _ in g:
                font_counts[a.font] = font_counts.get(a.font, 0) + 1
            dom_font = max(font_counts.items(), key=lambda kv: kv[1])[0]
            short = dom_font.split("+", 1)[-1]
            clean_short = re.sub(r"-WinCharSet[0-9A-F]+-H\d*$", "", short, flags=re.I)
            meta = fmeta.get(dom_font) or fmeta.get(short) or fmeta.get(clean_short) or {}

            gdi_fallback = meta.get("inferredFamily")
            resolved_css_font = font_family(dom_font, aliases=font_aliases, gdi_fallback=gdi_fallback)

            has_missing_tounicode = any(not a.has_to_unicode for a, _ in g)
            min_x0 = min(a.x0 for a, _ in g)
            min_y0 = min(a.y0 for a, _ in g)
            max_x1 = max(a.x1 for a, _ in g)
            max_y1 = max(a.y1 for a, _ in g)
            x1_raw = _r(max_x1 + (last_trail * first_atom.pt * PX * 0.28 if last_trail else 0.0))

            # 기호/CMap 의심 문자 검사 (PUA 포함)
            is_anomalous = has_missing_tounicode or bool(re.search(r"[\ue000-\uf8ff]", vis_text))

            item: dict[str, Any] = {
                "text": vis_text,
                "x": _r(min_x0),
                "y": _r(min_y0),
                "x1": _r(max_x1),
                "y1": _r(max_y1),
                "x1_raw": x1_raw,
                "pt": first_atom.pt,
                "font": dom_font,
                "css_font": resolved_css_font,
                "color": first_atom.color,
                "bold": any(a.bold for a, _ in g),
                "italic": any(a.italic for a, _ in g),
                "block": first_atom.block,
                "line": li,
                "trailing_space": last_trail > 0,
                "baseline": _r(first_atom.baseline),
                "has_to_unicode": not has_missing_tounicode,
                "anomalous": is_anomalous,
            }
            if font_map:
                fm = pick_font(font_map, dom_font)
                if fm:
                    item["font_ref"] = next(name for name, f in font_map.items() if f is fm)
                    try:
                        vis_chars = px_chars[: len(px_chars) - last_trail] if last_trail else px_chars
                        item["tokens"] = solve_token_spacing(vis_chars, fm, first_atom.pt * PX)
                    except KeyError as exc:
                        warn_list.append(f"토큰 자간 생략 ({vis_text[:20]}): {exc}")
                else:
                    warn_list.append(f"--font 에 없는 PDF 글꼴: {dom_font} (토큰 자간 없음)")
            spans_out.append(item)

    return spans_out


def is_cjk_garbled_token(text: str) -> bool:
    """한글 문맥 안에서 깨진 심볼 폰트가 한자 영역(`磿`, `騶`, `䃱` 등)으로 잘못 나온 토큰인지 휴리스틱 판정."""
    if re.search(r"[\ue000-\uf8ff]", text):
        return True
    stripped = text.strip()
    if not stripped:
        return False
    hanja_cnt = sum(1 for ch in stripped if "\u4e00" <= ch <= "\u9fff" or "\u3400" <= ch <= "\u4dbf")
    if hanja_cnt == 0:
        return False
    # 괄호 없는 독립 1~2자 한자 글머리/라벨 앞이나 한글 문맥 속 뜬금없는 한자
    has_hangul = any("\uac00" <= ch <= "\ud7a3" for ch in stripped)
    has_paren_hanja = bool(re.search(r"\([\u4e00-\u9fff]+\)", stripped))
    if not has_paren_hanja and (hanja_cnt <= 2 and (has_hangul or len(stripped) <= 3 or unicodedata.category(stripped[0]) == "Lo")):
        return True
    return False
