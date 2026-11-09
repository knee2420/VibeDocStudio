# 작업대 평가 — wb-smoke

전체 1/1 · 튜닝 세트 1/1 · 보류 세트 0/0

| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |
|---|---|---|---|---|---|---|---|
| E3-restore | E | ✅ | 4/4 | 31.6s | 28,894/69,826/1,429 | 4 | ready:1 |

## E3-restore — E
> 원래 본문으로 되돌려줘.

- ✅ 후보 제안: ready · 1안 · mode=restore · 칸=['r_summary']
- ✅ 처음 글 그대로: 1/1안
- ✅ 리소스 탐색 0회: 없음
- ✅ 이력 사용: wb_history, wb_read, wb_read

**도구**: wb_history → wb_read → wb_read → wb_propose

**읽은 원천**: 없음
- 후보 prop_3c380ee45c ready 1안 restore · 오류 0 · 경고 0

<details><summary>생각</summary>

The request aims to restore the original content. The system establishes roles: history provides factual origins, the editor handles selections, and the output proposes the restoration (mode=restore). A key rule is that restoration is sourced from history, not from resources. Restoration involves comparing the current version with a previous version to identify changes using the history data and the specified slot. The mode will be set to restore.


Initiating a proposal to restore the "r_summary" slot using the `wb_propose` function. The restore mode is selected, targeting the specified slot. The candidate restoration involves reverting to the initial original content. The rationale focuses on restoring the content to its earliest version before any revisions.


온보딩 개선 핵심은 템플릿 우선 제공이라는 결론에 도달했다. 첫 문서 완성 시간이 47분에서 크게 줄었다는 결과를 확인했다.




</details>

**답변**

[요약](vdoc:slot/r_summary) 칸을 rev:3 이전의 초기 본문 상태로 되돌리는 복원안을 제안했습니다.

### 제안 요약
- **초기 원본으로 복원 (1안)**: rev:3에서 변경되기 전의 원본 텍스트([orig:r_summary](vdoc:slot/r_summary))로 되돌립니다. 분량이 과도하게 늘어나고 지표 검증이 미완료된 장문의 서술 대신, 핵심 메시지(템플릿 우선 제공 및 기준선 47분 단축)만 간결하게 복구합니다.

화면의 미리보기에서 검토 후 적용 여부를 선택해 주세요.