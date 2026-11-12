"""Bounded reread task scheduler (maxRereadRounds=2) with tight padded crop generation."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from ..acquire.render import crop_pil_image
from ..config import load_prompt, load_thresholds
from ..ir.model import BBox, DocIR, TableIR
from ..tables.html_io import render_table_proposal_html
from ..verify.verify import DocVerifyBundle, verify_doc


class RereadTask(BaseModel):
    taskId: str
    pageIndex: int
    kind: Literal["table_read", "table_reread", "page_blocks", "ocr_review"]
    blockId: Optional[str] = None
    bbox: Optional[BBox] = None
    cropPngPath: Optional[str] = None
    candidateHtml: Optional[str] = None
    prompt: str = ""
    reasons: list[str] = Field(default_factory=list)
    roundNum: int = 1


def _padded_crop(
    cache_dir: Optional[Path],
    page_index: int,
    bbox: Optional[BBox],
    page_size: tuple[float, float],
    tag: str,
) -> Optional[str]:
    if cache_dir is None or bbox is None:
        return None
    page_png = cache_dir / f"p{page_index}.png"
    if not page_png.is_file():
        return None
    out = cache_dir / f"p{page_index}_{tag}.png"
    crop_pil_image(page_png, bbox, page_size, out_path=out, pad_pt=8.0)
    return str(out)


def reread_plan(
    doc: DocIR,
    *,
    round_num: int = 1,
    verification: Optional[DocVerifyBundle] = None,
    cache_dir: Optional[Path] = None,
    sample_tables: bool = True,
    thresholds: Optional[dict[str, Any]] = None,
) -> list[RereadTask]:
    """Schedule up to `maxRereadRounds` targeted VLM crop reread tasks from verification output."""
    th = thresholds or load_thresholds()
    max_rounds = int(th.get("maxRereadRounds", 2))
    sample_limit = int(th.get("verifySampleMaxTables", 1))
    if round_num > max_rounds:
        return []

    ver = verification or verify_doc(doc, thresholds=th)
    pages_by_idx = {p.pageIndex: p for p in doc.pages}

    tasks: list[RereadTask] = []
    seen_targets: set[tuple[int, Optional[str], str]] = set()

    for idx, item in enumerate(sorted(ver.pendingReads, key=lambda x: (x.priority, x.pageIndex))):
        key = (item.pageIndex, item.blockId, item.kind)
        if key in seen_targets:
            continue
        seen_targets.add(key)

        page = pages_by_idx.get(item.pageIndex)
        if page is None:
            continue

        tag = f"r{round_num}_{item.blockId or item.kind}_{idx}"
        crop_path = _padded_crop(
            cache_dir,
            item.pageIndex,
            item.bbox,
            (page.size.width, page.size.height),
            tag,
        )

        cand_html: Optional[str] = None
        if item.kind in ("table_read", "table_reread") and item.blockId:
            tbl = next(
                (b for b in page.blocks if isinstance(b, TableIR) and b.id == item.blockId),
                None,
            )
            if tbl is not None:
                words_by_id = {w.id: w for w in page.words}
                cand_html = render_table_proposal_html(tbl, words_by_id, include_word_attrs=True)

        prompt_key = "pageBlocks" if item.kind == "page_blocks" else "tableReread"
        tasks.append(
            RereadTask(
                taskId=f"rr_p{item.pageIndex}_{len(tasks)}",
                pageIndex=item.pageIndex,
                kind=item.kind,
                blockId=item.blockId,
                bbox=item.bbox,
                cropPngPath=crop_path,
                candidateHtml=cand_html,
                prompt=load_prompt(prompt_key),
                reasons=list(item.reasons),
                roundNum=round_num,
            )
        )

    # Round-1 spot-check up to `verifySampleMaxTables` passing tables on high-density pages
    if sample_tables and round_num == 1 and sample_limit > 0:
        sampled = 0
        for page in doc.pages:
            if sampled >= sample_limit:
                break
            if any(t.pageIndex == page.pageIndex and t.kind in ("table_read", "table_reread") for t in tasks):
                continue
            tables = [b for b in page.blocks if isinstance(b, TableIR) and not b.imageFallbackSrc and b.bbox is not None]
            if not tables:
                continue
            largest = max(tables, key=lambda t: (len(t.cells), (t.bbox[2] - t.bbox[0]) * (t.bbox[3] - t.bbox[1])))  # type: ignore[index]
            words_by_id = {w.id: w for w in page.words}
            crop_path = _padded_crop(
                cache_dir,
                page.pageIndex,
                largest.bbox,
                (page.size.width, page.size.height),
                f"sample_{largest.id}",
            )
            tasks.append(
                RereadTask(
                    taskId=f"rr_p{page.pageIndex}_sample_{largest.id}",
                    pageIndex=page.pageIndex,
                    kind="table_reread",
                    blockId=largest.id,
                    bbox=largest.bbox,
                    cropPngPath=crop_path,
                    candidateHtml=render_table_proposal_html(largest, words_by_id, include_word_attrs=True),
                    prompt=load_prompt("tableRead"),
                    reasons=["SAMPLE_SPOT_CHECK"],
                    roundNum=round_num,
                )
            )
            sampled += 1

    return tasks

