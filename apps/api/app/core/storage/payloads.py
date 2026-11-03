"""대용량 페이로드 외부화 (`app.core.storage.payloads`)."""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

PAYLOAD_DIR = "payloads"
EXTERNALIZE_OVER_BYTES = 2048
PREVIEW_CHARS = 280
REF_MARKER = "__payload_ref__"


def is_payload_ref(value: Any) -> bool:
    return isinstance(value, dict) and REF_MARKER in value


def make_ref(digest: str, *, byte_length: int, preview: str, media_type: str) -> dict[str, Any]:
    return {
        REF_MARKER: digest,
        "bytes": byte_length,
        "preview": preview,
        "media_type": media_type,
    }


def _sniff_media_type(text: str) -> str:
    head = text.lstrip()[:1]
    if head in "{[":
        return "application/json"
    if text.lstrip().startswith("#") or "\n## " in text:
        return "text/markdown"
    return "text/plain"


def externalize(payload: Any, run_dir: Path) -> Any:
    if isinstance(payload, dict):
        return {key: externalize(value, run_dir) for key, value in payload.items()}
    if isinstance(payload, list):
        return [externalize(item, run_dir) for item in payload]
    if not isinstance(payload, str):
        return payload

    encoded = payload.encode("utf-8")
    if len(encoded) <= EXTERNALIZE_OVER_BYTES:
        return payload

    digest = hashlib.sha256(encoded).hexdigest()
    target = run_dir / PAYLOAD_DIR / f"{digest}.txt"
    if not target.exists():
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(payload, encoding="utf-8")
        except OSError as exc:
            logger.warning("[Payloads] 외부화 실패, 인라인 유지 (%s): %s", digest[:12], exc)
            return payload

    return make_ref(
        digest,
        byte_length=len(encoded),
        preview=payload[:PREVIEW_CHARS],
        media_type=_sniff_media_type(payload),
    )


def read_payload(run_dir: Path, digest: str) -> Optional[str]:
    if len(digest) != 64 or not all(c in "0123456789abcdef" for c in digest):
        return None
    target = run_dir / PAYLOAD_DIR / f"{digest}.txt"
    if not target.is_file():
        return None
    try:
        return target.read_text(encoding="utf-8")
    except OSError as exc:
        logger.warning("[Payloads] 본문을 읽지 못했습니다 (%s): %s", digest[:12], exc)
        return None


def externalize_span_dict(span: dict[str, Any], run_dir: Path) -> dict[str, Any]:
    for bucket in ("inputs", "outputs"):
        value = span.get(bucket)
        if isinstance(value, (dict, list)):
            span[bucket] = externalize(value, run_dir)
    return span


def payload_dir_size(run_dir: Path) -> int:
    directory = run_dir / PAYLOAD_DIR
    if not directory.is_dir():
        return 0
    return sum(f.stat().st_size for f in directory.glob("*.txt") if f.is_file())


def dumps_line(entry: dict[str, Any]) -> str:
    return json.dumps(entry, ensure_ascii=False)

