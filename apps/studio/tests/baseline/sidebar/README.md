# 사이드바 동작 기준선 (1차)

사이드바를 개편하거나 다른 브랜치를 합칠 때 **무엇이 사라지고 바뀌었는지**를 사람의 기억이 아니라 비교로 확인하기 위한 기준선이다.
기준선은 개편 **전**의 main 에서 뜬다. 합친 뒤에 뜨면 이미 사라진 동작은 기준선에 들어가지 않는다.

| 파일 | 내용 |
|---|---|
| `main.contract.json` | main 의 행 종류별 동작 버튼 · 사이드바 test id · 행 밖 버튼 툴팁 |
| `main.orphans.json` | main 의 고아 export (슬라이스 public API 로 내보냈지만 슬라이스 밖 사용처 0) |
| `main.perf.json` | 캔버스 슬롯 클릭당 메인 스레드 긴 작업 (ms) |
| `captureSidebarContract.js` | 브라우저에서 실행하는 캡처 도구 (`__captureSidebarContract`, `__perfProbe`) |
| `orphanExports.mjs` | 고아 export 정적 스캔 |
| `diffContract.mjs` | 기준선 ↔ 새 캡처 비교 → Markdown. 줄어든 항목이 있으면 종료 코드 1 |

## 다시 뜨는 법

1. 스튜디오를 1920×1080 으로 열고 `/?phase=drafting&zoom=project-root&doc=vdoc_meeting_minutes_1028` 로 이동, `sessionStorage.clear()` 후 새로고침 (접힘 상태 초기화).
2. 콘솔에서 `captureSidebarContract.js` 내용을 실행하고 `copy(JSON.stringify(__captureSidebarContract(), null, 2))` → `<name>.contract.json` 으로 저장.
3. `apps/studio` 에서 `node tests/baseline/sidebar/orphanExports.mjs src > tests/baseline/sidebar/<name>.orphans.json`
4. 비교:
   ```
   node tests/baseline/sidebar/diffContract.mjs tests/baseline/sidebar/main.contract.json tests/baseline/sidebar/<name>.contract.json tests/baseline/sidebar/main.orphans.json tests/baseline/sidebar/<name>.orphans.json
   ```

## 읽는 법 · 한계

- 행 종류는 노드 id 접두사(`auto-<kind>-` · `node-<kind>-`)로 나눈다. 투영의 id 규칙이 바뀌면 `rowKind` 를 같이 고친다.
- 호버 때만 보이는 버튼도 DOM 에 있으므로 잡힌다. **열어야 보이는 메뉴 항목(더보기 · 새 문서 메뉴)은 잡지 않는다** — 2차에서 메뉴를 열고 캡처하는 단계를 더한다.
- 행 수는 그 문서 · 줌 · 화면 구성에 따라 달라진다. 비교의 기준은 행 수가 아니라 **동작 종류의 집합**이다.
- 고아 기준선에 이미 있는 41개는 대부분 슬라이스 안이나 `tests/` 에서만 쓰이는 export 다. 신호는 **새로 생긴 고아**다.
- 성능 값은 패널이 숨겨진 상태의 dev 빌드에서 쟀다. CPU(긴 작업)만 비교에 쓴다.
- 줄어든 항목이 의도된 제거라면, PR 에 그 목록을 그대로 적고 기준선을 새로 뜬다.
