"""PDF 임베딩 폰트 해독(CP949/GDI 해시 서브셋) · ToUnicode 검사 · 시스템 폰트 추론."""
from __future__ import annotations

import re
from typing import Any, Optional

_STYLE_SUFFIX = re.compile(r"[,-]?(BoldItalic|BoldMT|ItalicMT|Bold|Italic|Regular|PSMT|MT)$", re.I)
# Windows GDI/HWP PDF 인쇄기가 붙이는 임시 해시 폰트명 (예: RPXKIO+TTD747454EtCID-WinCharSetFFFF-H2)
_GDI_HASH_FONT = re.compile(r"^TT[0-9A-F]{6,10}tCID", re.I)

DEFAULT_FONT_ALIASES: dict[str, str] = {
    "굴림체": "GulimChe",
    "gulimche": "GulimChe",
    "굴림": "Gulim",
    "gulim": "Gulim",
    "돋움": "Dotum",
    "dotum": "Dotum",
    "돋움체": "DotumChe",
    "dotumche": "DotumChe",
    "바탕": "Batang",
    "batang": "Batang",
    "바탕체": "BatangChe",
    "batangche": "BatangChe",
    "궁서": "Gungsuh",
    "궁서체": "GungsuhChe",
    "맑은고딕": "Malgun Gothic",
    "malgungothic": "Malgun Gothic",
    "timesnewroman": "Times New Roman",
    "arial": "Arial",
    "couriernew": "Courier New",
    "dejavusans": "DejaVu Sans",
    "wingdings": "Wingdings",
    "symbol": "Symbol",
}


def decode_font_name(name: str) -> str:
    """부분 글꼴 접두어(`ABCDEF+`)를 떼고, Latin1 로 잘못 읽힌 CP949 이름을 되돌린다."""
    base = (name or "").split("+", 1)[-1]
    try:
        decoded = base.encode("latin1").decode("cp949")
        if re.search(r"[가-힣]", decoded):
            return decoded
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    return base


def font_family(name: str, aliases: Optional[dict[str, str]] = None, *, gdi_fallback: Optional[str] = None) -> str:
    """PDF 글꼴 이름 → CSS 글꼴 이름 (굵기·기울임 꼬리 제거 + 알리아스 매핑)."""
    table = aliases if aliases is not None else DEFAULT_FONT_ALIASES
    family = decode_font_name(name)
    while True:
        stripped = _STYLE_SUFFIX.sub("", family)
        if stripped == family:
            break
        family = stripped
    key = family.replace(" ", "").lower()
    if family in table:
        return table[family]
    if key in table:
        return table[key]
    if gdi_fallback and _GDI_HASH_FONT.match(family):
        return gdi_fallback
    return family


def css_family(name: str, aliases: Optional[dict[str, str]] = None, *, gdi_fallback: Optional[str] = None) -> str:
    return f"'{font_family(name, aliases=aliases, gdi_fallback=gdi_fallback)}'"


def infer_system_font(flags: int, basefont: str, *, has_to_unicode: bool = True) -> Optional[str]:
    """PDF 폰트 플래그(FixedPitch=1, Serif=2, Symbolic=4)와 이름으로부터 표준 한글 대체 폰트를 추론한다."""
    if not _GDI_HASH_FONT.match((basefont or "").split("+", 1)[-1]):
        return None
    if (flags & 4) and not has_to_unicode:  # ToUnicode 없는 순수 심볼(Symbolic) 폰트만 제외
        return None
    if flags & 1:  # FixedPitch
        return "GulimChe"
    if flags & 2:  # Serif
        return "Batang"
    return "Malgun Gothic"


def inspect_page_fonts(page: Any) -> dict[str, dict[str, Any]]:
    """PDF 페이지에 등록된 폰트 목록에서 ToUnicode CMap 유무와 GDI 플래그 메타를 수집한다."""
    doc = getattr(page, "parent", None)
    info: dict[str, dict[str, Any]] = {}
    for entry in page.get_fonts(full=True):
        xref, _ext, _ftype, basefont, _res_name, encoding = entry[:6]
        short = (basefont or "").split("+", 1)[-1]
        short_clean = re.sub(r"-WinCharSet[0-9A-F]+-H\d*$", "", short, flags=re.I)
        has_to_unicode = True
        flags = 0
        if doc is not None and xref:
            try:
                obj_txt = doc.xref_object(xref, compressed=False)
                # Type0/CID 폰트인데 /ToUnicode 가 없으면 심볼/커스텀 인코딩 깨짐 위험이 높다
                # (표준 WinAnsi/Standard Type1 글꼴은 /ToUnicode 없이도 ASCII 가 정상 해독된다)
                is_cid = (
                    (_ftype == "Type0")
                    or ("/DescendantFonts" in obj_txt)
                    or ("Identity" in str(encoding or ""))
                )
                if is_cid and "/ToUnicode" not in obj_txt:
                    has_to_unicode = False
                m_desc = re.search(r"/DescendantFonts\s*\[\s*(\d+)\s+0\s+R", obj_txt)
                if m_desc:
                    desc_obj = doc.xref_object(int(m_desc.group(1)), compressed=False)
                    m_fd = re.search(r"/FontDescriptor\s+(\d+)\s+0\s+R", desc_obj)
                    if m_fd:
                        fd_obj = doc.xref_object(int(m_fd.group(1)), compressed=False)
                        m_fl = re.search(r"/Flags\s+(-?\d+)", fd_obj)
                        if m_fl:
                            flags = int(m_fl.group(1))
            except Exception:
                pass
        meta = {
            "xref": xref,
            "basefont": basefont,
            "short": short_clean,
            "encoding": encoding,
            "flags": flags,
            "hasToUnicode": has_to_unicode,
            "inferredFamily": infer_system_font(flags, short_clean, has_to_unicode=has_to_unicode),
        }
        info[short_clean] = meta
        if basefont:
            info[basefont] = meta
            info[basefont.split("+", 1)[-1]] = meta
    return info
