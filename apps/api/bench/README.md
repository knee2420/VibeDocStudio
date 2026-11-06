# Auto-Index 벤치마크

"스킬 + 하네스 + 색인"으로 탐색했을 때와, agy CLI 가 원문을 알아서 뒤졌을 때를 같은 질문 · 같은 모델로 비교한다.

## 비교군

| 이름 | 무엇을 주나 | 탐색 수단 |
|---|---|---|
| `indexed` | 지식 덱 첨부 (섹션 지도) + 탐색 절차 스킬 | Composer 엔진 + `knowledge.*` 서버 도구 7종 (toc · lookup · grep · section · cards · assets · source) |
| `files` | 덱 폴더 (index.md · sections · cards · archive) + 같은 스킬 문서 | agy 내장 파일 도구 · grep |
| `raw` | 원문 폴더 사본 전체 | agy 내장 파일 도구 · grep |

`indexed` 와 `files` 의 차이 = **하네스(서버 도구)** 의 몫, `files` 와 `raw` 의 차이 = **색인(구조)** 의 몫.

## 테스트셋 (`testsets/*.json`)

문항마다 `criterion` 이 사용자 정의 7개 기준 중 무엇을 재는지 적혀 있다.

| 유형 | 기준 | 무엇을 보나 |
|---|---|---|
| `table` · `figure` | 1 | 표 셀 값 · 그림 캡션처럼 본문 밖 요소를 찾아내는가 |
| `toc` | 2 | 개수 · 순서 · "어느 장 다음" 처럼 목차를 알아야 풀리는가 |
| `vague` · `lookup` · `negative` | 3 | 대충 · 다른 말로 물어도 맞히는가, 없는 내용을 지어내지 않는가 |
| `analysis` | 4 | 여러 섹션을 빠짐없이 엮는가 |
| (전 문항) | 5 | 토큰 · 시간 · 도구 호출 · 읽은 분량 |
| `write` | 6 | 사실 밀도 · 출처 수 |
| `outline` | 7 | 핵심 주제 커버리지 · 출처 |

채점: `facts`(대안 정규식 목록)의 재현율, 0.8 이상이면 정답 (부정 문항은 전부 + `forbid` 미검출).
출처: 카드 링크(`vdoc:kcard/…`) · 카드 id · 파일 경로 표기를 세고, 정답 출처 파일이 들어 있는지 본다.

## 실행

```bash
# 1) 덱 빌드 (structural · enriched). enriched 는 agy 로 카드를 보강한다 — 캐시가 있으면 바뀐 조각만
python bench/build_decks.py --depth both --concurrency 4

# 2) 벤치마크
python bench/run_bench.py --corpus agy fsd --arms indexed raw files --depth enriched --parallel 3
```

결과는 `bench/results/<run>/report.md` · `report.json` · `runs.jsonl`(문항별 답변 전문 포함).
