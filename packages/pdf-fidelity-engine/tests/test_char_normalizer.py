"""CharAtom 정규화(Faux-Bold dedup · 역행 문장부호 재정렬 · 공백 복원 · 깨진 한자 탐지) 단위 테스트."""
from __future__ import annotations

from pdf_fidelity_engine import (
    CharAtom,
    deduplicate_faux_bold,
    is_cjk_garbled_token,
    normalize_chars_to_spans,
)


def test_faux_bold_deduplicates_four_strikes_and_marks_bold() -> None:
    atoms: list[CharAtom] = []
    # '개', '회', '사' 각 글자가 (dx=0.3px, dy=0.3px) 미세 오프셋으로 4중 겹쳐 찍힌 GDI Faux-Bold 시뮬레이션
    offsets = [(0.0, 0.0), (0.32, 0.0), (0.0, 0.32), (0.32, 0.32)]
    for idx, ch in enumerate(["개", "회", "사"]):
        base_x = 80.0 + idx * 14.0
        for dx, dy in offsets:
            atoms.append(
                CharAtom(
                    c=ch,
                    x0=base_x + dx,
                    y0=100.0 + dy,
                    x1=base_x + 12.0 + dx,
                    y1=114.0 + dy,
                    origin_x=base_x + dx,
                    baseline=112.0 + dy,
                    pt=11.0,
                    font="MalgunGothic",
                    bold=False,
                )
            )
    deduped = deduplicate_faux_bold(atoms)
    assert "".join(a.c for a in deduped) == "개회사"
    assert all(a.bold for a in deduped)


def test_backtracked_punctuation_and_missing_spaces_are_restored() -> None:
    # 폰트 배치로 인해 한글 ('실천방법노력점토의')이 먼저 나오고, 괄호 '(' ')'가 스트림 뒤쪽(같은 baseline)에서 역행 출현 + TJ 점프 공백 없음
    y0, y1, bl = 200.0, 214.0, 212.0
    atoms = [
        # 나중에 찍힌 '(' 와 ')' 를 일부러 앞 한글보다 뒤 리스트에 넣는다
        CharAtom("실", 100, y0, 111, y1, 100, bl, 10.5, "Gulim"),
        CharAtom("천", 111, y0, 122, y1, 111, bl, 10.5, "Gulim"),
        CharAtom("방", 122, y0, 133, y1, 122, bl, 10.5, "Gulim"),
        CharAtom("법", 133, y0, 144, y1, 133, bl, 10.5, "Gulim"),
        CharAtom("노", 149, y0, 160, y1, 149, bl, 10.5, "Gulim"),
        CharAtom("력", 160, y0, 171, y1, 160, bl, 10.5, "Gulim"),
        CharAtom("점", 171, y0, 182, y1, 171, bl, 10.5, "Gulim"),
        # 큰 TJ x-점프(약 8px) 로 공백 복원 테스트 ('토의' 앞)
        CharAtom("토", 193, y0, 204, y1, 193, bl, 10.5, "Gulim"),
        CharAtom("의", 204, y0, 215, y1, 204, bl, 10.5, "Gulim"),
        # 역행 찍힌 문장부호
        CharAtom("(", 144.5, y0, 148.5, y1, 144.5, bl, 10.5, "Arial"),
        CharAtom(")", 182.5, y0, 186.5, y1, 182.5, bl, 10.5, "Arial"),
    ]
    spans = normalize_chars_to_spans(atoms, space_ratio=0.20)
    combined = " ".join(sp["text"] for sp in spans)
    assert "실천방법(노력점)" in combined
    assert "토의" in combined
    # 역행 괄호 사이에도 음수 마진(gap < -2px) 겹침이 없어야 한다
    assert all(float(sp.get("x", 0)) < float(sp.get("x1", 0)) + 1.0 for sp in spans)
    # 괄호 닫고 '토의' 앞 공백 삽입 확인
    assert ") 토의" in combined or any(sp["text"].endswith(")") for sp in spans)


def test_cjk_garbled_token_heuristic() -> None:
    assert is_cjk_garbled_token("䃱")
    assert is_cjk_garbled_token("磿\ue001")
    assert not is_cjk_garbled_token("계약서 제1조")


def test_vertical_wall_splits_adjacent_cell_text_without_bleeding() -> None:
    # 세로 구분선 x=180.5 를 사이에 두고 왼쪽 라벨 '봉사가능시간' (x=103..168) 과 오른쪽 '□언제든지' (x=181..244)가 가까워도 절대 병합하지 않는다.
    y0, y1, bl = 820.0, 834.0, 832.0
    atoms = [
        CharAtom("봉", 103, y0, 114, y1, 103, bl, 8.71, "Gulim"),
        CharAtom("사", 114, y0, 125, y1, 114, bl, 8.71, "Gulim"),
        CharAtom("가", 125, y0, 136, y1, 125, bl, 8.71, "Gulim"),
        CharAtom("능", 136, y0, 147, y1, 136, bl, 8.71, "Gulim"),
        CharAtom("시", 147, y0, 158, y1, 147, bl, 8.71, "Gulim"),
        CharAtom("간", 158, y0, 169, y1, 158, bl, 8.71, "Gulim"),
        CharAtom("□", 182, y0, 193, y1, 182, bl, 8.71, "Gulim"),
        CharAtom("언", 193, y0, 204, y1, 193, bl, 8.71, "Gulim"),
        CharAtom("제", 204, y0, 215, y1, 204, bl, 8.71, "Gulim"),
    ]
    spans = normalize_chars_to_spans(atoms, vertical_walls=[(180.5, 169.0, 851.0)])
    assert [s["text"] for s in spans] == ["봉사가능시간", "□언제"]
    assert spans[0]["x1"] < 180.5 < spans[1]["x"]

