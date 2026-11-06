"""LLM 카드 보강 — 프롬프트 · 배치 · 캐시 키 · 응답 검증.

LLM 이 하는 일은 셋뿐이다: 요약, 놓친 요소, "찾게 해 주는 말"(키워드 · 별칭 · 예상 질문).
구조(조각 경계 · id · 앵커)는 절대 LLM 이 정하지 않는다. 받은 요소는 원문 대조(`grounded`)를
통과한 것만 남긴다.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Iterable, Protocol

from .contracts import CARD_RULES_VERSION, Segment

MAX_BATCH_CHARS = 14000
MAX_BATCH_SEGMENTS = 8
SEGMENT_CHAR_LIMIT = 3600


class CardEnricher(Protocol):
    """LLM 실행 포트 — 프롬프트와 스키마를 받아 JSON 객체와 사용량을 돌려준다."""

    model: str

    def run(self, prompt: str, schema: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any]]: ...


class EnrichmentCache(Protocol):
    def get(self, key: str) -> dict[str, Any] | None: ...

    def put(self, key: str, value: dict[str, Any]) -> None: ...


def cache_key(segment: Segment, model: str, language: str) -> str:
    raw = f"{CARD_RULES_VERSION}|{model}|{language}|{segment.sha}|{' > '.join(segment.heading_path)}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def batches(segments: Iterable[Segment]) -> list[list[Segment]]:
    out: list[list[Segment]] = []
    cur: list[Segment] = []
    size = 0
    for seg in segments:
        n = min(len(seg.text), SEGMENT_CHAR_LIMIT)
        if cur and (size + n > MAX_BATCH_CHARS or len(cur) >= MAX_BATCH_SEGMENTS):
            out.append(cur)
            cur, size = [], 0
        cur.append(seg)
        size += n
    if cur:
        out.append(cur)
    return out


_LANG_RULE = {
    "ko": "summary · questions 는 한국어로 쓴다. 원문의 명령어 · 옵션 · 파일명 · 고유명사는 원문 표기 그대로 `백틱`으로 둔다.",
    "source": "summary · questions 는 원문과 같은 언어로 쓴다.",
}


def build_prompt(batch: list[Segment], language: str = "ko") -> str:
    payload = [
        {
            "segmentId": seg.segment_id,
            "source": seg.anchor.source,
            "heading": " > ".join(seg.heading_path),
            "text": seg.text[:SEGMENT_CHAR_LIMIT],
        }
        for seg in batch
    ]
    return "\n".join([
        "너는 문서 색인기다. 아래 조각들 각각에 대해 지식 카드 재료를 JSON 으로 만든다.",
        "도구(파일 · 터미널 · 검색)는 쓰지 마라. 필요한 내용은 전부 아래에 있다. JSON 만 출력한다.",
        "",
        "규칙:",
        f"- {_LANG_RULE.get(language, _LANG_RULE['ko'])}",
        "- summary: 2~3문장. 이 조각만 읽고 알 수 있는 사실만. 수치 · 기본값 · 조건 · 예외를 빠뜨리지 마라.",
        "- elements: 원자 요소 3~12개. name 은 원문에 그대로 나오는 용어(명령어 · 옵션 · 설정 키 · 표의 행 이름 · 개념어),"
        " detail 은 그 요소의 뜻 · 값 · 기본값 한 줄. 원문에 없는 이름은 만들지 마라.",
        "- keywords: 6~10개. 원문 용어와 그 한국어/영어 대응어를 함께 (예: `sandbox`, 샌드박스).",
        "- aliases: 사용자가 이 내용을 부를 법한 다른 표현 2~5개 (약어 · 구어 · 흔한 오기).",
        "- questions: 이 조각으로 답할 수 있는 질문 2~4개 (대충 묻는 말투 포함).",
        "- 조각마다 정확히 하나의 카드, segmentId 는 그대로 돌려준다.",
        "",
        "조각들:",
        json.dumps(payload, ensure_ascii=False),
    ])


def parse_response(batch: list[Segment], data: Any) -> dict[str, dict[str, Any]]:
    """스키마를 벗어난 응답은 조각 단위로 버린다 (나머지는 살린다).

    모델이 `{"cards": [...]}` 대신 배열만 내는 경우가 잦다 (실측) — 둘 다 받는다.
    """
    if isinstance(data, list):
        data = {"cards": data}
    if not isinstance(data, dict):
        return {}
    wanted = {seg.segment_id for seg in batch}
    out: dict[str, dict[str, Any]] = {}
    for item in data.get("cards") or []:
        if not isinstance(item, dict):
            continue
        sid = str(item.get("segmentId") or "").strip()
        if sid not in wanted or sid in out:
            continue
        if not isinstance(item.get("summary"), str):
            continue
        out[sid] = {
            "title": item.get("title") if isinstance(item.get("title"), str) else "",
            "summary": item["summary"],
            "elements": [e for e in item.get("elements") or [] if isinstance(e, dict)],
            "keywords": [k for k in item.get("keywords") or [] if isinstance(k, str)],
            "aliases": [k for k in item.get("aliases") or [] if isinstance(k, str)],
            "questions": [k for k in item.get("questions") or [] if isinstance(k, str)],
        }
    return out
