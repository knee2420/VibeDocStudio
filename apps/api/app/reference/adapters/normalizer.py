"""레퍼런스 통합 정규화기 — PDF · 웹(타일 캡처/레이아웃/정적 HTML) · 이미지를 단일 `.ref` v1 IR로 정규화한다.

`@vibe/ref-canvas` 의 `RefDocument` (v1) 규약과 1:1 정합한다:
- `frames[]`: 1-based 2D 시각 표면 (`pdf-page` | `web-tile` | `image` | `semantic-canvas`)
- `blocks[]`: 통합 어휘(`heading` | `text` | `list` | `table` | `callout` | `media` | `media-group` | `link-card` | `divider` | `ui-region`) + `frameIndex` + `0..1000` 정규화 `bbox`
- `pins[]`, `layers[]`, `consensus[]`: 매체 무관 공통 앵커(`ref:<refId>#...`)
"""
from __future__ import annotations

import math
from typing import Any, Optional
from urllib.parse import quote

from ..models import ConsensusCard, ReferenceItem, ReferencePin, now_ms

DEFAULT_SEMANTIC_WIDTH = 960
DEFAULT_PDF_WIDTH = 595.0
DEFAULT_PDF_HEIGHT = 842.0
SEMANTIC_BLOCKS_PER_FRAME = 22

_KIND_MAP: dict[str, str] = {
    "heading": "heading",
    "form-title": "heading",
    "title": "heading",
    "list": "list",
    "bullet-list": "list",
    "ordered-list": "list",
    "table": "table",
    "structured-table": "table",
    "interactive-table": "table",
    "callout": "callout",
    "callout-box": "callout",
    "image": "media",
    "media": "media",
    "figure": "media",
    "gallery": "media-group",
    "media-group": "media-group",
    "columns-grid": "media-group",
    "link-card": "link-card",
    "divider": "divider",
    "hr": "divider",
    "ui-region": "ui-region",
    "paragraph": "text",
    "caption": "text",
    "text": "text",
}

_LAYER_DEFS: dict[str, list[dict[str, Any]]] = {
    "document": [
        {"id": "D1", "name": "스캐너빌리티·정보 밀도", "question": "정독하지 않고 훑는 사람에게 핵심을 어떻게 꽂는가?", "qualitative": False},
        {"id": "D2", "name": "근거·데이터 증명 방식", "question": "주장을 어떤 형태의 데이터로 입증하는가?", "qualitative": False},
        {"id": "D3", "name": "격식·메타 규격", "question": "형식 자체에서 전문성과 공신력을 어떻게 풍기는가?", "qualitative": False},
        {"id": "D4", "name": "서술 프레임워크", "question": "독자의 반론을 잠재우는 논증의 틀은?", "qualitative": False},
        {"id": "D5", "name": "타이포그래피·조판", "question": "제목 계층 · 여백 · 다단 · 그리드 · 표 스타일의 규칙은?", "qualitative": False},
        {"id": "D6", "name": "장르 규약", "question": "이 장르 독자가 결함으로 느끼지 않을 암묵적 기준은?", "qualitative": False},
    ],
    "uiux": [
        {"id": "U1", "name": "설득의 논리와 정보의 위계", "question": "어떤 순서로 말을 꺼내고 무엇을 강조했는가?", "qualitative": False},
        {"id": "U2", "name": "문제 해결 패턴", "question": "복잡한 상황을 어떻게 우회하거나 단순화했는가?", "qualitative": True},
        {"id": "U3", "name": "인터랙션과 반응의 문법", "question": "사용자의 입력에 시스템이 어떻게 호흡하는가?", "qualitative": True},
        {"id": "U4", "name": "톤앤매너와 정서적 질감", "question": "어떤 사람(브랜드)처럼 말하고 느껴지는가?", "qualitative": False},
        {"id": "U5", "name": "조형적 토큰과 비례 감각", "question": "요소들이 어떤 규칙과 비례로 배치되는가?", "qualitative": False},
        {"id": "U6", "name": "시장의 기대치와 기준선", "question": "결함으로 느끼지 않을 최소한의 상식선은?", "qualitative": True},
        {"id": "U7", "name": "협업의 언어를 일치시키는 닻", "question": "애매한 기준을 어떤 시각적 증거로 고정하는가?", "qualitative": True},
    ],
    "blog": [
        {"id": "B1", "name": "섹션 리듬·반복 단위", "question": "글을 어떤 단위로 끊고 무엇을 어떤 순서로 보여 주는가?", "qualitative": False},
        {"id": "B2", "name": "사진 서사", "question": "사진을 몇 장, 어떤 묶음으로 글과 배치하는가?", "qualitative": False},
        {"id": "B3", "name": "훑어보기·강조", "question": "스크롤로 훑는 독자의 눈을 어디에 멈추게 하는가?", "qualitative": False},
        {"id": "B4", "name": "소제목 문법", "question": "소제목을 어떤 말투·형식으로 다는가?", "qualitative": False},
        {"id": "B5", "name": "동선·연결", "question": "독자를 다음 글·외부 정보로 어떻게 넘기는가?", "qualitative": False},
        {"id": "B6", "name": "말투·장르 규약", "question": "이 장르 독자가 어색해하지 않을 말투는?", "qualitative": False},
    ],
}


def _clamp1000(v: float) -> int:
    if not math.isfinite(v):
        return 0
    return max(0, min(1000, int(round(v))))


def _sanitize_bbox(raw: Any) -> Optional[list[int]]:
    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        return None
    try:
        nums = [float(x) for x in raw]
    except (TypeError, ValueError):
        return None
    if any(not math.isfinite(x) for x in nums):
        return None
    y0 = _clamp1000(min(nums[0], nums[2]))
    x0 = _clamp1000(min(nums[1], nums[3]))
    y1 = _clamp1000(max(nums[0], nums[2]))
    x1 = _clamp1000(max(nums[1], nums[3]))
    return [y0, x0, min(1000, max(y0 + 1, y1)), min(1000, max(x0 + 1, x1))]


def normalize_block_kind(raw: Any) -> str:
    return _KIND_MAP.get(str(raw or "").strip().lower(), "text")


def _estimate_block_weight(kind: str, text: str) -> int:
    if kind == "divider":
        return 18
    if kind == "heading":
        return 46
    if kind in ("media", "media-group"):
        return 170
    if kind == "table":
        return min(260, max(90, math.ceil(len(text) / 4)))
    if kind == "link-card":
        return 72
    lines = max(1, math.ceil(max(len(text), 24) / 48))
    return min(220, 26 + lines * 20)


def _layout_semantic_frames(
    pre_blocks: list[dict[str, Any]],
    title: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not pre_blocks:
        return (
            [
                {
                    "frameId": "frame-1",
                    "index": 1,
                    "surfaceKind": "semantic-canvas",
                    "width": DEFAULT_SEMANTIC_WIDTH,
                    "height": 1120,
                    "label": "Frame 1",
                    "title": title,
                }
            ],
            [],
        )

    frames: list[dict[str, Any]] = []
    blocks: list[dict[str, Any]] = []
    total_chunks = max(1, math.ceil(len(pre_blocks) / SEMANTIC_BLOCKS_PER_FRAME))

    for chunk_idx in range(total_chunks):
        frame_index = chunk_idx + 1
        chunk = pre_blocks[
            chunk_idx * SEMANTIC_BLOCKS_PER_FRAME : (chunk_idx + 1) * SEMANTIC_BLOCKS_PER_FRAME
        ]
        weights = [_estimate_block_weight(str(b["kind"]), str(b.get("text") or "")) for b in chunk]
        pad_top, pad_bottom, gap = 36, 36, 14
        content_h = sum(weights) + max(0, len(chunk) - 1) * gap
        frame_h = max(820, pad_top + content_h + pad_bottom)
        first_heading = next((str(b.get("text") or "") for b in chunk if b["kind"] == "heading" and b.get("text")), "")

        frames.append(
            {
                "frameId": f"frame-{frame_index}",
                "index": frame_index,
                "surfaceKind": "semantic-canvas",
                "width": DEFAULT_SEMANTIC_WIDTH,
                "height": frame_h,
                "label": f"Frame {frame_index}",
                "title": first_heading or (title if frame_index == 1 else f"Section {frame_index}"),
            }
        )

        cursor_y = pad_top
        for b, h in zip(chunk, weights):
            y0 = _clamp1000((cursor_y / frame_h) * 1000.0)
            y1 = _clamp1000(((cursor_y + h) / frame_h) * 1000.0)
            x0 = 80 if b["kind"] in ("media", "media-group") else 48
            x1 = 920 if b["kind"] in ("media", "media-group") else 952
            blocks.append(
                {
                    **b,
                    "frameIndex": frame_index,
                    "bbox": [y0, x0, min(1000, max(y0 + 2, y1)), x1],
                }
            )
            cursor_y += h + gap

    return frames, blocks


def _normalize_layers(raw_layers: Optional[dict[str, Any]], layer_set: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    metrics = dict(raw_layers.get("metrics") or {}) if isinstance(raw_layers, dict) else {}
    defs = _LAYER_DEFS.get(layer_set, _LAYER_DEFS["document"])
    def_map = {d["id"]: d for d in defs}
    raw_list = (raw_layers or {}).get("layers") if isinstance(raw_layers, dict) else None
    if not isinstance(raw_list, list) or not raw_list:
        return ([{**d, "values": {}} for d in defs], metrics)

    out: list[dict[str, Any]] = []
    for entry in raw_list:
        if not isinstance(entry, dict) or not entry.get("id"):
            continue
        lid = str(entry["id"])
        d = def_map.get(lid, {})
        vals = dict(entry.get("values") or {}) if isinstance(entry.get("values"), dict) else {}
        out.append(
            {
                "id": lid,
                "name": str(entry.get("name") or d.get("name") or lid),
                "question": str(entry.get("question") or d.get("question") or ""),
                "values": vals,
                "qualitative": bool(entry["qualitative"]) if isinstance(entry.get("qualitative"), bool) else bool(d.get("qualitative", len(vals) == 0)),
            }
        )
    return (out or [{**d, "values": {}} for d in defs], metrics)


def normalize_reference_item(
    item: ReferenceItem,
    *,
    extraction: Optional[dict[str, Any]] = None,
    layers_report: Optional[dict[str, Any]] = None,
    pins: Optional[list[ReferencePin]] = None,
    shots_manifest: Optional[dict[str, Any]] = None,
    consensus: Optional[list[ConsensusCard]] = None,
    layer_overrides: Optional[dict[str, bool]] = None,
    asset_base_url: str = "",
) -> dict[str, Any]:
    """단일 레퍼런스 항목과 모든 파생 아티팩트를 `.ref` v1 표준 IR 딕셔너리로 정규화한다."""
    ref_id = item.ref_id
    origin_type = item.kind if item.kind in ("pdf", "web", "image") else "unknown"
    title = (item.title or item.source_name or item.source_url or ref_id).strip()
    layer_set = str((layers_report or {}).get("set") or item.layer_set or "document")
    asset_base = (asset_base_url or f"/api/reference/items/{quote(ref_id, safe='')}").rstrip("/")

    raw_blocks = [b for b in (extraction or {}).get("blocks") or [] if isinstance(b, dict)]
    raw_pages = [p for p in (extraction or {}).get("pages") or [] if isinstance(p, dict)]
    raw_shots = [s for s in (shots_manifest or {}).get("shots") or [] if isinstance(s, dict)]

    frames: list[dict[str, Any]] = []
    blocks: list[dict[str, Any]] = []

    if origin_type == "pdf":
        page_count = max(
            1,
            int(item.page_count or 0),
            len(raw_pages),
            max((int(b.get("page") or 0) for b in raw_blocks), default=0),
        )
        page_meta: dict[int, tuple[float, float]] = {}
        for p in raw_pages:
            no = int(p.get("page") or 0)
            if no > 0:
                w = float(p.get("width") or 0) or DEFAULT_PDF_WIDTH
                h = float(p.get("height") or 0) or DEFAULT_PDF_HEIGHT
                page_meta[no] = (w, h)

        for idx in range(1, page_count + 1):
            w, h = page_meta.get(idx, (DEFAULT_PDF_WIDTH, DEFAULT_PDF_HEIGHT))
            frames.append(
                {
                    "frameId": f"frame-{idx}",
                    "index": idx,
                    "surfaceKind": "pdf-page",
                    "width": w,
                    "height": h,
                    "label": f"Page {idx}",
                    "assetUrl": f"{asset_base}/source",
                    "pageNumber": idx,
                }
            )

        for i, raw in enumerate(raw_blocks):
            page = max(1, min(page_count, int(raw.get("page") or 1)))
            blk: dict[str, Any] = {
                "id": str(raw.get("id") or f"b{i + 1}"),
                "frameIndex": page,
                "kind": normalize_block_kind(raw.get("kind")),
                "level": int(raw.get("level") or 0),
                "text": str(raw.get("text") or ""),
                "bbox": _sanitize_bbox(raw.get("bbox")),
            }
            if isinstance(raw.get("html"), str):
                blk["html"] = raw["html"]
            if isinstance(raw.get("style"), dict):
                blk["style"] = raw["style"]
            if isinstance(raw.get("media"), dict):
                blk["media"] = raw["media"]
            blocks.append(blk)

    elif origin_type == "web" and raw_shots:
        viewport_w = int((shots_manifest or {}).get("viewportWidth") or 1280)
        total_h = int((shots_manifest or {}).get("totalHeight") or 0) or max(
            900,
            max((int(s.get("scrollY") or 0) + int(s.get("height") or 900) for s in raw_shots), default=900),
        )
        for i, shot in enumerate(raw_shots, start=1):
            fname = str(shot.get("file") or f"shot_{i:02d}.png")
            frame: dict[str, Any] = {
                "frameId": f"frame-{i}",
                "index": i,
                "surfaceKind": "web-tile",
                "width": int(shot.get("width") or viewport_w),
                "height": int(shot.get("height") or 900),
                "label": f"Tile {i}",
                "assetUrl": f"{asset_base}/shots/{quote(fname, safe='')}",
                "scrollY": int(shot.get("scrollY") or 0),
            }
            if isinstance(shot.get("sections"), list):
                frame["sections"] = [int(n) for n in shot["sections"]]
            if isinstance(shot.get("title"), str) and shot["title"]:
                frame["title"] = shot["title"]
            frames.append(frame)

        last_frame = 1
        last_bottom = 60
        for i, raw in enumerate(raw_blocks):
            kind = normalize_block_kind(raw.get("kind"))
            src_y = float(raw["sourceY"]) if isinstance(raw.get("sourceY"), (int, float)) else None
            src_h = max(18.0, float(raw["sourceHeight"])) if isinstance(raw.get("sourceHeight"), (int, float)) else None
            src_x = float(raw["sourceX"]) if isinstance(raw.get("sourceX"), (int, float)) else None
            src_w = float(raw["sourceWidth"]) if isinstance(raw.get("sourceWidth"), (int, float)) else None
            bbox = _sanitize_bbox(raw.get("bbox"))
            frame_index = last_frame

            if src_y is not None:
                bh = src_h if src_h is not None else 48.0
                mid = src_y + min(bh / 2.0, 180.0)
                best_idx = 0
                best_dist = float("inf")
                for fi, f in enumerate(frames):
                    top = float(f["scrollY"])
                    bottom = top + float(f["height"])
                    if src_y <= bottom and src_y + bh >= top:
                        dist = abs((top + bottom) / 2.0 - mid)
                    else:
                        dist = min(abs(src_y - top), abs(src_y - bottom)) + 5000.0
                    if dist < best_dist:
                        best_dist = dist
                        best_idx = fi
                matched = frames[best_idx]
                frame_index = int(matched["index"])
                last_frame = frame_index
                tile_top = float(matched["scrollY"])
                tile_h = max(1.0, float(matched["height"]))
                tile_w = max(1.0, float(matched["width"]))
                rel_top_raw = src_y - tile_top
                rel_bot_raw = src_y + bh - tile_top
                if rel_top_raw >= tile_h:
                    y0, y1 = 930, 992
                elif rel_bot_raw <= 0:
                    y0, y1 = 8, 70
                else:
                    rel_top = max(0.0, min(tile_h - 16.0, rel_top_raw))
                    rel_bot = min(tile_h, max(rel_top + 18.0, rel_bot_raw))
                    y0 = min(980, _clamp1000((rel_top / tile_h) * 1000.0))
                    y1 = min(1000, max(y0 + 14, _clamp1000((rel_bot / tile_h) * 1000.0)))
                last_bottom = y1

                if src_x is not None and src_w is not None and src_w > 0:
                    x0 = min(980, _clamp1000((max(0.0, src_x) / tile_w) * 1000.0))
                    x1 = min(1000, max(x0 + 14, _clamp1000(((src_x + src_w) / tile_w) * 1000.0)))
                else:
                    media = raw.get("media") if isinstance(raw.get("media"), dict) else {}
                    w_px = float(media["widthPx"]) if isinstance(media.get("widthPx"), (int, float)) and media["widthPx"] > 0 else None
                    half_r = min(0.46, max(0.12, (w_px / tile_w) / 2.0)) if w_px else 0.42
                    x0 = _clamp1000((0.5 - half_r) * 1000.0)
                    x1 = _clamp1000((0.5 + half_r) * 1000.0)
                bbox = [y0, x0, min(1000, max(y0 + 10, y1)), min(1000, max(x0 + 10, x1))]
            elif bbox is None:
                ratio = i / max(1, len(raw_blocks) - 1) if len(raw_blocks) > 1 else 0.0
                approx_y = ratio * total_h
                approx_frame = next(
                    (f for f in frames if float(f["scrollY"]) <= approx_y <= float(f["scrollY"]) + float(f["height"])),
                    None,
                )
                frame_index = int(approx_frame["index"]) if approx_frame else last_frame
                y0 = _clamp1000(min(920, last_bottom))
                y1 = _clamp1000(min(990, y0 + 50))
                last_bottom = y1
                bbox = [y0, 80, max(y0 + 10, y1), 920]

            blk = {
                "id": str(raw.get("id") or f"b{i + 1}"),
                "frameIndex": frame_index,
                "kind": kind,
                "level": int(raw.get("level") or 0),
                "text": str(raw.get("text") or ""),
                "bbox": bbox,
            }
            if isinstance(raw.get("html"), str):
                blk["html"] = raw["html"]
            if src_y is not None:
                blk["sourceY"] = src_y
            if src_h is not None:
                blk["sourceHeight"] = src_h
            if isinstance(raw.get("style"), dict):
                blk["style"] = raw["style"]
            if isinstance(raw.get("media"), dict):
                blk["media"] = raw["media"]
            blocks.append(blk)

    elif origin_type == "image":
        frames = [
            {
                "frameId": "frame-1",
                "index": 1,
                "surfaceKind": "image",
                "width": 1200,
                "height": 900,
                "label": title,
                "assetUrl": f"{asset_base}/source",
            }
        ]
        for i, raw in enumerate(raw_blocks):
            blocks.append(
                {
                    "id": str(raw.get("id") or f"b{i + 1}"),
                    "frameIndex": 1,
                    "kind": normalize_block_kind(raw.get("kind")),
                    "level": int(raw.get("level") or 0),
                    "text": str(raw.get("text") or ""),
                    "bbox": _sanitize_bbox(raw.get("bbox")),
                }
            )

    else:
        pre_blocks: list[dict[str, Any]] = []
        for i, raw in enumerate(raw_blocks):
            entry: dict[str, Any] = {
                "id": str(raw.get("id") or f"b{i + 1}"),
                "kind": normalize_block_kind(raw.get("kind")),
                "level": int(raw.get("level") or 0),
                "text": str(raw.get("text") or ""),
            }
            if isinstance(raw.get("html"), str):
                entry["html"] = raw["html"]
            if isinstance(raw.get("style"), dict):
                entry["style"] = raw["style"]
            if isinstance(raw.get("media"), dict):
                entry["media"] = raw["media"]
            pre_blocks.append(entry)
        frames, blocks = _layout_semantic_frames(pre_blocks, title)

    outline = [
        {
            "blockId": b["id"],
            "title": str(b["text"]).strip()[:120],
            "level": int(b.get("level") or 1) or 1,
            "frameIndex": int(b["frameIndex"]),
        }
        for b in blocks
        if b["kind"] == "heading" and str(b.get("text") or "").strip()
    ]

    max_frame = max(1, len(frames))
    norm_pins = [
        {
            "pinId": p.pin_id,
            "kind": p.kind,
            "frameIndex": max(1, min(max_frame, int(p.page or 1))),
            "bbox": list(p.bbox) if p.bbox else None,
            "text": p.text,
            "label": p.label,
            "note": p.note,
            "layer": p.layer,
            "anchor": p.anchor,
            "createdAt": p.created_at,
        }
        for p in (pins or [])
    ]

    norm_consensus = [c.to_dict() for c in (consensus or [])]
    norm_layers, metrics = _normalize_layers(layers_report, layer_set)

    if item.status == "failed" and not frames:
        status = "failed"
    elif any(bool(l.get("values")) for l in norm_layers):
        status = "analyzed"
    elif blocks:
        status = "structured"
    else:
        status = "framed"

    doc: dict[str, Any] = {
        "version": 1,
        "refId": ref_id,
        "title": title,
        "status": status,
        "source": {
            "originType": origin_type,
            "uri": item.source_url or f"{asset_base}/source",
            "sourceName": item.source_name or None,
            "sourceUrl": item.source_url or None,
            "mimeType": item.mime_type or None,
            "sizeBytes": item.size_bytes,
            "serverRefId": ref_id,
            "capturedAt": (shots_manifest or {}).get("capturedAt") or item.updated_at or now_ms(),
        },
        "layerSet": layer_set,
        "enabledLayers": dict(layer_overrides or {}),
        "frames": frames,
        "blocks": blocks,
        "outline": outline,
        "layers": norm_layers,
        "metrics": metrics,
        "pins": norm_pins,
        "consensus": norm_consensus,
        "createdAt": item.created_at or now_ms(),
        "updatedAt": item.updated_at or now_ms(),
    }
    if item.error:
        doc["error"] = item.error
    article_raw = (extraction or {}).get("article")
    if isinstance(article_raw, dict):
        doc["article"] = {
            "title": str(article_raw.get("title") or title),
            "siteName": article_raw.get("siteName"),
            "byline": article_raw.get("byline"),
            "url": article_raw.get("url") or item.source_url or None,
            "html": str(article_raw.get("html") or ""),
            "text": str(article_raw.get("text") or ""),
        }
    return doc
