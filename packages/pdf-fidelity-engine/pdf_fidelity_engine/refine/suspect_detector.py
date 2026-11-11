"""선별 정제 대상 슬롯 탐지 (`/ToUnicode` 누락 · PUA/깨진 한자 · 장문 공백 누락)."""
from __future__ import annotations

import html
import io
import re
from typing import Any, Literal, Optional

from ..extract.char_normalizer import is_cjk_garbled_token
from ..fonts.metrics import PX_PER_PT
from ..models import SuspectSlot

_PUA_RE = re.compile(r"[\ue000-\uf8ff]")
_TAG_RE = re.compile(r"<[^>]+>")


def _plain_text(html_content: str) -> str:
    txt = _TAG_RE.sub("", html_content or "").replace("\u00a0", " ")
    return html.unescape(txt).strip()


def _paragraph_plain_lines(html_content: str) -> list[str]:
    ps = re.findall(r"<p[^>]*>(.*?)</p>", html_content or "", flags=re.DOTALL | re.I)
    if not ps:
        plain = _plain_text(html_content)
        return [plain] if plain else []
    lines: list[str] = []
    for p in ps:
        t = _plain_text(p)
        if t:
            lines.append(t)
    return lines


def _crop_png(page_png_bytes: Optional[bytes], bbox: tuple[float, float, float, float], pad: float = 8.0) -> Optional[bytes]:
    if not page_png_bytes:
        return None
    try:
        from PIL import Image  # type: ignore[import-untyped]

        img = Image.open(io.BytesIO(page_png_bytes))
        w, h = img.size
        x0 = max(0, int(bbox[0] - pad))
        y0 = max(0, int(bbox[1] - pad))
        x1 = min(w, int(bbox[2] + pad))
        y1 = min(h, int(bbox[3] + pad))
        if x1 <= x0 or y1 <= y0:
            return None
        out = io.BytesIO()
        img.crop((x0, y0, x1, y1)).save(out, format="PNG")
        return out.getvalue()
    except Exception:
        return None


def _slot_spans(bbox: tuple[float, float, float, float], spans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    x0, y0, x1, y1 = bbox
    out = []
    for sp in spans:
        cx = (float(sp["x"]) + float(sp["x1"])) / 2.0
        cy = (float(sp["y"]) + float(sp.get("y1", sp["y"] + sp["pt"] * PX_PER_PT))) / 2.0
        if x0 - 4.0 <= cx <= x1 + 4.0 and y0 - 4.0 <= cy <= y1 + 4.0:
            out.append(sp)
    return out


def _evaluate_slot(
    *,
    slot_id: str,
    block_id: str,
    block_title: str,
    kind: Literal["text", "table-cell"],
    bbox: tuple[float, float, float, float],
    slot_content: str,
    spans: list[dict[str, Any]],
    page_png_bytes: Optional[bytes],
) -> Optional[SuspectSlot]:
    lines = _paragraph_plain_lines(slot_content)
    plain = "\n".join(lines).strip()
    if not plain:
        return None

    matched_spans = _slot_spans(bbox, spans)
    reasons: list[str] = []

    if any(not sp.get("has_to_unicode", True) or sp.get("anomalous") for sp in matched_spans):
        reasons.append("no_tounicode")
    if _PUA_RE.search(plain) or any(is_cjk_garbled_token(ln) for ln in lines):
        reasons.append("pua_or_cjk_anomaly")

    compact = re.sub(r"\s+", "", plain)
    hangul_len = sum(1 for ch in compact if "\uac00" <= ch <= "\ud7a3")
    if hangul_len >= 18 and " " not in plain:
        reasons.append("no_spaces")

    if not reasons:
        return None

    return SuspectSlot(
        slot_id=slot_id,
        block_id=block_id,
        block_title=block_title,
        kind=kind,
        bbox_px=bbox,
        raw_text=plain,
        reasons=reasons,
        crop_png_bytes=_crop_png(page_png_bytes, bbox),
    )


def detect_suspect_slots(
    *,
    page_vdoc: dict[str, Any],
    slots: dict[str, dict[str, Any]],
    truth: dict[str, Any],
    model: Optional[dict[str, Any]] = None,
    page_png_bytes: Optional[bytes] = None,
) -> list[SuspectSlot]:
    """페이지 내 본문/표 셀 중 텍스트 깨짐·/ToUnicode 누락·장문 공백 누락 슬롯만 선별한다."""
    spans = truth.get("spans", [])
    tables_by_bid: dict[str, dict[str, Any]] = {}
    if model:
        for t in model.get("tables", []):
            tables_by_bid[t["id"]] = t

    suspects: list[SuspectSlot] = []
    for block in page_vdoc.get("pages", [page_vdoc])[0].get("blocks", []) if "pages" in page_vdoc else page_vdoc.get("blocks", []):
        kind = block.get("kind")
        bid = str(block.get("blockId") or "")
        btitle = str(block.get("title") or "")
        if kind == "text":
            sid = str(block.get("slotId") or "")
            slot = slots.get(sid)
            fr = block.get("frame") or {}
            if not slot or not fr:
                continue
            bbox = (float(fr.get("x", 0)), float(fr.get("y", 0)), float(fr.get("x", 0)) + float(fr.get("w", 0)), float(fr.get("y", 0)) + float(fr.get("h", 0)))
            hit = _evaluate_slot(
                slot_id=sid,
                block_id=bid,
                block_title=btitle,
                kind="text",
                bbox=bbox,
                slot_content=str(slot.get("content") or ""),
                spans=spans,
                page_png_bytes=page_png_bytes,
            )
            if hit:
                suspects.append(hit)
        elif kind == "structured-table":
            # 모델 표 id 매칭 (p1_T1 -> T1)
            short_tid = bid.split("_")[-1] if "_" in bid else bid
            m_tbl = tables_by_bid.get(short_tid)
            cells_by_coord: dict[tuple[int, int], dict[str, Any]] = {}
            if m_tbl:
                for mc in m_tbl.get("cells", []):
                    cells_by_coord[(int(mc["row"]), int(mc["col"]))] = mc
            fr = block.get("frame") or {}
            tbl_bbox = (
                float(fr.get("x", 0)),
                float(fr.get("y", 0)),
                float(fr.get("x", 0)) + float(fr.get("w", 0)),
                float(fr.get("y", 0)) + 400.0,
            )
            for r_idx, row in enumerate(block.get("rows", [])):
                for c_idx, cell in enumerate(row.get("cells", [])):
                    sid = str(cell.get("slotId") or "")
                    slot = slots.get(sid)
                    if not slot:
                        continue
                    mc = cells_by_coord.get((r_idx, c_idx))
                    cell_bbox = (
                        (float(mc["x"]), float(mc["y"]), float(mc["x1"]), float(mc["y1"]))
                        if mc
                        else tbl_bbox
                    )
                    hit = _evaluate_slot(
                        slot_id=sid,
                        block_id=bid,
                        block_title=f"{btitle} ({r_idx+1},{c_idx+1})",
                        kind="table-cell",
                        bbox=cell_bbox,
                        slot_content=str(slot.get("content") or ""),
                        spans=spans,
                        page_png_bytes=page_png_bytes,
                    )
                    if hit:
                        suspects.append(hit)
    return suspects

