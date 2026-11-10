"""작업대 평가 시나리오 — 영역별 묶음. 모음과 실행 순서는 `wb_scenarios.py` 가 정한다.

- reference: 레퍼런스 질의 경우의 수(Q1~Q16 · 보류 H1~H3) + 레퍼런스 단독(F)
- resource: 리소스 단독(R)
- editor: 에디터 단독 + 이력(E)
- combined: 섞인 출처(MIX) · 조합(RE · FE · RF · RFE)

holdout=True 인 시나리오는 엔진을 튜닝할 때 보지 않는다 (일반화 확인용).
"""
