"""Tests for Reference Manager and AI Composer context integration.

Verifies:
1. Prompts clearly delineate Reference (Normative/Form Guide) vs Resource (Raw Fact/Content).
2. render_contexts correctly serializes reference items with role="reference".
3. High priority and budgeting rules apply properly to reference context items.
"""

from app.assistant.models import ContextItem
from app.assistant.prompts import COMPOSER_RULES, render_contexts


def test_base_system_prompt_distinguishes_reference_and_resource():
    """출처 넷의 역할: 레퍼런스 = 층위별 결정 패턴(사실 근거 아님), 리소스 = 사실, 이력 = 되돌리기 근거, 에디터 = 대상."""
    assert "레퍼런스" in COMPOSER_RULES and "리소스" in COMPOSER_RULES
    assert "이력" in COMPOSER_RULES and "에디터" in COMPOSER_RULES
    # 레퍼런스는 패턴을 옮기는 것이지, 규범을 그대로 따르거나 내용을 가져오는 게 아니다
    assert "패턴" in COMPOSER_RULES and "옮기지 않는다" in COMPOSER_RULES
    assert "엄격히 준수" not in COMPOSER_RULES
    # 리소스는 사실 · 내용의 근거
    assert "사실" in COMPOSER_RULES


def test_build_context_xml_with_reference_items():
    """Reference items with role='reference' should be formatted into <context> XML."""
    items = [
        ContextItem(
            kind="reference",
            ref_id="doc_101",
            label="사내_무역규정_표준세칙",
            role="reference",
            content="[참조 문서 표준·서식 가이드] 사내_무역규정_표준세칙\n- [영역 핀 p.1] 제3조 의결정족수: 재적위원 과반수 출석",
        ),
        ContextItem(
            kind="resource",
            ref_id="meeting_01",
            label="10월4주차_의사결정회의록",
            role="reference",
            content="[원천 리소스] 10월 4주차 안건 의결 결과",
        ),
    ]

    xml = render_contexts(items, limit=8000)
    assert 'id="doc_101"' in xml
    assert 'kind="reference"' in xml
    assert 'role="reference"' in xml
    assert "사내_무역규정_표준세칙" in xml
    assert "제3조 의결정족수" in xml
    assert 'id="meeting_01"' in xml
    assert 'kind="resource"' in xml


def test_build_context_xml_empty_when_no_items():
    """Empty context returns empty string."""
    assert render_contexts([], limit=4000) == ""


def test_build_context_xml_respects_budget_truncation():
    """Very large reference document snippets are safely truncated within budget."""
    long_rule_text = "제1조 (목적) 본 규정은 회사의 표준 업무 프로세스를 규정함을 목적으로 한다.\n" * 200
    items = [
        ContextItem(
            kind="reference",
            ref_id="doc_large",
            label="거대_사내규정_집",
            role="reference",
            content=long_rule_text,
        )
    ]
    # Restrict limit to 2000 chars
    xml = render_contexts(items, limit=2000)
    assert 'id="doc_large"' in xml
    assert len(xml) <= 3000
    assert "…(truncated)" in xml
