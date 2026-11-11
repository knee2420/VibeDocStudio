"""미리캔버스/캔바식 높이·소제목 경계 기반 페이지 분할기 (`paginate_mapped_blocks`)."""
from __future__ import annotations

from dataclasses import dataclass

from ..models import PageSplitMode
from .block_mapper import MappedBlock

_DEFAULT_HEADER_FOOTER_ALLOWANCE = 96.0
_BLOCK_GAP_PX = 16.0


@dataclass
class PaginatedPage:
    """분할된 1개 페이지 묶음."""

    page_number: int
    page_label: str
    items: list[MappedBlock]
    used_height_px: float


def paginate_mapped_blocks(
    items: list[MappedBlock],
    *,
    doc_title: str,
    target_height_px: int = 1123,
    split_mode: PageSplitMode = "height",
) -> list[PaginatedPage]:
    """블록 배열을 요소가 반으로 찢어지지 않는 자연 경계(높이 또는 소제목)에서 페이지 단위로 나눈다."""
    if not items:
        return [PaginatedPage(page_number=1, page_label=f"{doc_title} (1p)", items=[], used_height_px=0.0)]

    usable_h = max(380.0, float(target_height_px) - _DEFAULT_HEADER_FOOTER_ALLOWANCE)
    if split_mode == "single":
        total_h = sum(it.estimated_height_px for it in items) + _BLOCK_GAP_PX * max(0, len(items) - 1)
        return [PaginatedPage(page_number=1, page_label=f"{doc_title} (1p)", items=list(items), used_height_px=total_h)]

    pages: list[list[MappedBlock]] = []
    cur: list[MappedBlock] = []
    cur_h = 0.0

    def flush() -> None:
        nonlocal cur, cur_h
        if cur:
            pages.append(cur)
            cur = []
            cur_h = 0.0

    for idx, item in enumerate(items):
        gap = _BLOCK_GAP_PX if cur else 0.0
        next_h = cur_h + gap + item.estimated_height_px

        # heading 모드: 주요 소제목(h1/h2) 시작 시 현재 페이지가 어느 정도 차 있으면 새 페이지 시작
        if (
            split_mode == "heading"
            and cur
            and item.is_major_heading
            and cur_h >= usable_h * 0.25
        ):
            flush()
            gap = 0.0
            next_h = item.estimated_height_px

        # 높이 초과 시 현재 블록은 다음 페이지로 넘김 (단, 직전 이미지와 묶인 캡션이면 이미지까지 함께 넘긴다)
        elif cur and next_h > usable_h:
            carried: list[MappedBlock] = []
            if item.keep_with_prev and len(cur) >= 2:
                carried.append(cur.pop())
            flush()
            for c_item in carried:
                cur.append(c_item)
                cur_h += (_BLOCK_GAP_PX if len(cur) > 1 else 0.0) + c_item.estimated_height_px
            gap = _BLOCK_GAP_PX if cur else 0.0
            next_h = cur_h + gap + item.estimated_height_px

        # 고아 제목 및 섹션 응집 클러스터 보존:
        # 소제목 + 직후 이미지(들)가 현재 페이지에 다 못 들어가면 통째로 다음 페이지로 넘긴다.
        elif cur and item.is_major_heading and idx + 1 < len(items):
            cluster_h = next_h + _BLOCK_GAP_PX + items[idx + 1].estimated_height_px
            nxt_kind = items[idx + 1].block.get("kind")
            if nxt_kind in ("image", "columns-grid") and idx + 2 < len(items) and items[idx + 2].keep_with_prev:
                cluster_h += _BLOCK_GAP_PX + items[idx + 2].estimated_height_px
            if cluster_h > usable_h and cur_h >= usable_h * 0.35:
                flush()
                gap = 0.0
                next_h = item.estimated_height_px

        cur.append(item)
        cur_h = next_h

    flush()

    out: list[PaginatedPage] = []
    for pno, bucket in enumerate(pages, start=1):
        heading = next((it.heading_text for it in bucket if it.heading_text), "")
        if pno == 1 and doc_title:
            label = f"{doc_title[:34]} (1p)"
        elif heading:
            label = f"{heading[:32]} ({pno}p)"
        else:
            label = f"{doc_title[:28] or '웹 페이지'} ({pno}p)"
        used = sum(it.estimated_height_px for it in bucket) + _BLOCK_GAP_PX * max(0, len(bucket) - 1)
        out.append(PaginatedPage(page_number=pno, page_label=label, items=bucket, used_height_px=round(used, 1)))
    return out
