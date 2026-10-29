"""하네스 공통 — LLM 원시 출력에서 JSON 을 관대하게 회수한다.

실전에서 관측된 변형을 모두 흡수한다.
1. 표준 JSON 객체
2. CLI 래퍼 객체 (`{"status": ..., "response": "<json 문자열>"}`)
3. 마크다운 코드펜스로 감싼 JSON
4. 스키마를 무시하고 배열만 반환 (`[{...}, ...]`)
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

# 래퍼 객체에서 본문이 들어있을 만한 키
_PAYLOAD_KEYS = ("response", "result", "output", "text", "content", "data")

_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def _strip_fence(raw: str) -> str:
    m = _FENCE.search(raw)
    return m.group(1).strip() if m else raw


def _normalize(obj: Any, list_key: str) -> Optional[Dict[str, Any]]:
    """객체/배열/래퍼를 `{list_key: [...]}` 표준형으로 되돌린다."""
    if isinstance(obj, list):
        if obj and isinstance(obj[0], dict) and "id" in obj[0]:
            return {list_key: obj}
        return None
    if not isinstance(obj, dict):
        return None
    if isinstance(obj.get(list_key), list):
        return obj
    for key in _PAYLOAD_KEYS:
        value = obj.get(key)
        if isinstance(value, (dict, list)):
            found = _normalize(value, list_key)
            if found:
                return found
        elif isinstance(value, str):
            found = parse_json_payload(value, list_key)
            if found:
                return found
    # 임의의 도메인 스키마 객체 (예: {"document_title": ..., "outlines": [...]}) 보존
    if obj and any(k not in _PAYLOAD_KEYS for k in obj.keys()):
        return obj
    return None


def parse_json_payload(raw: str, list_key: str = "blocks") -> Optional[Dict[str, Any]]:
    """원시 출력에서 유효한 JSON 객체 또는 `{list_key: [...]}` 형태를 회수한다. 실패 시 None."""
    if not raw or not raw.strip():
        return None
    for candidate in (raw.strip(), _strip_fence(raw).strip()):
        try:
            found = _normalize(json.loads(candidate), list_key)
            if found:
                return found
        except json.JSONDecodeError:
            pass

        # 멀티라인/NDJSON 역순 탐색 (개행 분리된 개별 JSON 객체 시도)
        lines = [ln.strip() for ln in candidate.splitlines() if ln.strip()]
        for line in reversed(lines):
            if not (line.startswith("{") and line.endswith("}")):
                continue
            try:
                found = _normalize(json.loads(line), list_key)
                if found:
                    return found
            except json.JSONDecodeError:
                continue

        for opener, closer in (("{", "}"), ("[", "]")):

            start, end = candidate.find(opener), candidate.rfind(closer)
            if start == -1 or end <= start:
                continue
            try:
                found = _normalize(json.loads(candidate[start:end + 1]), list_key)
                if found:
                    return found
            except json.JSONDecodeError:
                pass
    return None


def unknown_ids(payload: Dict[str, Any], allowed: List[str], list_key: str = "blocks") -> List[str]:
    """모델이 지어낸 id 목록. 비어 있어야 정상이다."""
    allowed_set = set(allowed)
    return [
        str(item.get("id"))
        for item in payload.get(list_key, [])
        if isinstance(item, dict) and item.get("id") not in allowed_set
    ]
