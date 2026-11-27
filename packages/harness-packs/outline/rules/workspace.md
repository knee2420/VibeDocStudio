## .outline 아웃라인 협업 규칙 (`ol_*` · `outline.*`)

기존 문서 작성·근거·레퍼런스 절차(`editor` · `resource` · `reference`)를 그대로 따르되, 대상이 `.outline` 일 때만 아래 차분 규칙을 적용한다.

- **신규 생성 (`ol_create`) vs 기존 `.outline` 1:N 가지 추가**:
  - **절대 원칙**: 사용자가 기존 `.outline` 에서 블록(불릿)을 선택해 문서 초안·보고서를 요청했거나, 같은 `.vproj` 프로젝트 폴더에 원천/마스터 `.outline` 이 이미 열려 있으면 **`ol_create` 로 별도 `.outline` 파일을 따로 만들지 않는다**(서버도 선택 범위 활성 시 `ol_create` 를 즉시 차단한다). 반드시 기존 `.outline` 안에 `ol_propose_patch` 로 1:N `<<doc:...>>` 가지를 추가한다.
  - 기존 `.outline` 이 전혀 없는 프로젝트/폴더에서 아예 새 아웃라인 파일을 처음 만들 때만 `ol_create(path, title, rootNodes)` 를 사용한다(`vf_copy`/`vf_write` 금지).
- **읽기 · 문법 확인**: `.outline` 원본 JSON 을 `read_file` 로 직접 덤프하거나 `vf_write`/`vf_patch` 로 덮어쓰지 않는다. `ol_map` → `ol_read` 로 필요한 서브트리만 읽고, `<<doc:...>>` · `<<view:...>>` · `<<resource:...>>` 태그를 쓸 때는 `outline.getSyntax` 로 현재 볼트의 문법 규칙과 `.vasset` 을 먼저 확인한다.
- **패치 제안 (`TreePatchRequest`) — 일반 `.outline` 편집 적극 수행**:
  - `.outline` 은 읽기 전용이 아니다. 사용자가 아이디어/목록 추가, 문구 다듬기, 구조 재배치, 불릿 수정·이동·삭제를 요청하면 **`ol_propose_patch` 로 `@vibe/outliner` 의 모든 `TreePatchRequest` 연산(`replace` · `insert_after` · `insert_before` · `move` · `delete` · `set_note` · `set_file` 등)을 적극 사용해 Staged 변경안으로 제출한다.** (모든 패치는 디스크를 바로 덮지 않고 Unified Diff 승인/거절을 거치므로 안전하다.)
  - `replace` 는 `{op:"replace", id, text}` 로 단일 노드 글자만 바꾸며, 하위 트리를 추가할 때는 반드시 `insert_after(targetId, inside=true, items=[{text, children:[...]}])` 를 사용한다. 자식이 있는 노드를 지울 때는 `recursively: true` 가 필요하며, `docBindings` 에 묶인 `<<doc:...>>` 노드만 삭제하지 않는다.
- **통일 리소스 · 근거 단일 정본 규칙 (`<<resource: ...>>` · `<<cite:...>>`) 및 이미지 바로 꽂기 규칙**:
  - **문서 · 웹 스크랩 근거 (`.vclip` · `.md` · `.pdf` · `.csv`)**: 컴파일 태그(`<<doc>>`/`<<view>>`) 안이든 바깥 일반 불릿이든, 출처·인용·근거는 **반드시 편집 가능한 하위 불릿 `<<resource: 대상 위치 | 실제 발췌문>>`** (또는 컴파일 출력 연출이 필요할 때 `<<cite:footnote|rationale|sidenote|quote|matrix|bound>>`)으로 작성한다.
  - 웹 스크랩(`.vclip`) 근거는 `<<resource: <프로젝트>/sources/<기사>.vclip | 실제 인용 본문>>` 형식을 사용한다(클릭 시 오른쪽 페어 탭으로 해당 `.vclip`이 열리고 인용 문구가 자동 하이라이트된다).
  - **이미지 리소스 (`.png` · `.jpg` · `.jpeg` · `.webp` · `.gif` · `.svg`)**: `.outline`에 이미지가 바로 꽂혀 보이도록 **`.outline` 네이티브 이미지 첨부(`set_file` / `file: { target: "<볼트 이미지 경로>" }` 또는 `ol_attach_resource(mode="file")`)**를 사용한다(다단 갤러리 등 레이아웃 배치가 필요할 때는 `[img:캡션 -> resource:vault:<경로>]` 병행). 단, 이미지 안의 특정 영역 좌표(`#bbox(y1,x1,y2,x2)`)를 근거로 짚는 경우에만 예외적으로 `<<resource: <이미지> #bbox(...) | 설명>>` 을 허용한다.
  - **절대 금지 우회 패턴 (서버 린트가 즉시 차단)**:
    1. 기존 `<<resource:...>>` · `<<cite:...>>` 태그를 지우고 일반 `[[파일명.vclip]]` 위키링크로 바꾸는 행위 (일반 위키링크는 파일 열기만 하며 문장 하이라이트를 전달하지 않음).
    2. `.vclip` 등 문서 근거 리소스를 `set_file` 첨부 카드로 달거나, 숨겨진 `nodeEvidence` 사이드카로 우회 저장하는 행위 (`.outline`에서 숨겨진 `nodeEvidence` 사이드카 사용 금지).
    3. `ol_attach_resource`로 `.vclip` 근거 인용을 붙일 때 `mode="file"`이나 `mode="wikilink"`를 쓰는 행위 (반드시 `mode="resource"` + `quote` 사용).
    4. 일반 이미지 첨부에 `#bbox(...)` 없이 `<<resource: ...이미지>>` 텍스트 링크만 다는 행위 (반드시 `.outline` 네이티브 `set_file` / `mode="file"`로 이미지를 바로 꽂는다).
- **컴파일 · 린트 측정**: 패치를 낸 뒤 `outline.compileCheck`로 파싱 경고 · 미해석 이미지 · 컴파일 블록 수와 함께 **`lintIssues`(근거 태그 위반 여부)**가 0건인지 확인해 보고한다.
- **outline 범위 → `.vdoc` 초안 (컴파일 분리 사양 — `.vdoc` 변환/파생 요청에만 적용)**: 사용자가 불릿 범위를 골라 "이 부분 .vdoc 초안 · A4/블로그 문서로 변환 · 필요한 리소스는 알아서"를 시키면 `dc_new`/`dc_build` 로 짓지 않고 아래 순서로 outline 안에 컴파일 가지를 세운다. outline 이 정본이고 `.vdoc` 은 컴파일 결과다. *(주의: 아래 O1 의 비파괴 원칙은 `.vdoc` 컴파일 가지를 파생할 때 원본 리서치 불릿을 `replace` 로 밀어버리지 말라는 규칙이며, 일반 `.outline` 수정·추가·정리 요청에는 적용하지 않는다.)*
  O1 의도 (컴파일 파생 전용): 선택 불릿은 사용자가 1차로 구체화한 스토리라인이다 — 무엇을 어떤 순서로 말하려는지, 이미 달린 근거가 무엇인지 먼저 정리한다. `.vdoc` 컴파일 가지를 만들 때는 원본 사용자 불릿을 `replace` 로 덮어쓰거나 지우지 말고 그대로 둔 채 하위에 컴파일 가지를 덧붙인다.
  O2 근거 공백: 불릿마다 사실 주장(날짜 · 수치 · 인물 · 발언 · 사양)을 뽑아 이미 있는 리소스(같은 프로젝트 `sources/` · 폴더 · 첨부)에서 먼저 찾는다(`ws_*` → `read_file`). 없는 것만 리서치 절차(R1~R6)로 수집한다. 찾지 못한 사실은 `[확인 필요]` 로 둔다.
  O3 섹션 골격 & 고정 삽입 위치: `outline.getSyntax` 의 `hierarchy` 를 확인하고, **선택한 블록들 중 최상단 불릿(`topmostSelectedId`)의 바로 하위 맨 앞(`insert_after`, `targetId=topmostSelectedId`, `inside=true`)** 에 `<<doc:프로필>> 제목` 가지 하나를 고정 생성한다(별도 `.outline` 파일 분리 금지). 그 바로 아래에는 스토리라인의 단위마다 `<<view:section:역할>> 섹션 제목` 만 둔다 — 글 · 그림 · 표를 `<<doc>>` 바로 아래 두지 않는다. 섹션의 수와 순서는 사용자 불릿의 흐름을 따르고, 합치거나 뺐다면 이유를 보고한다.
  O4 컨테이너 → 배치 (A4 보고서 표준 포함):
     - **`<<view:section:opening>>` 첫 자식**: 반드시 **`<<view:title>> 문서 제목`** (A4 공식 보고서) 또는 `<<view:title:h1>> 문서 제목` 을 둔다. 보고 기준일·대상·핵심 요약 등 메타 항목은 `> 문서 개요` 아래 `키 :: 값` 하위 불릿으로 묶는다.
     - **표 (`<<view:table:header>>` vs `<<view:table>>`)**: 1행이 컬럼 헤더인 데이터 표(요약표·타임라인표·현황표·일정표)는 반드시 **`<<view:table:header>> 표 제목`** 을 사용한다(`<<view:table>>` 은 좌측 라벨형 공공서식 폼 전용). `<<resource:...>>` 는 `<<view:table>>` 직계 자식이 아니라 해당 주장을 담은 문단/소제목 불릿의 하위 불릿으로 붙인다.
     - 섹션 안에 소제목(`<<view:title:h2>>`) · 문단 · 목록 · 표를 놓는다. 글과 그림이 함께 설명되는 자리는 `<<view:section:column>>` (또는 `<<view:columns>>` 아래 `<<col>>` 둘 이상)으로 나란히 배치할 수 있다. 그림은 `{text: 캡션, file: {target: 볼트 이미지 경로}}` 네이티브 첨부 불릿이다. 같은 모양이 되풀이되면 같은 컨테이너 모양(또는 에셋)을 되풀이한다.
     - 한 불릿은 한 줄이다 — 표는 `<<view:table:header>> 제목` 아래에 머리행과 각 행을 하위 불릿(칸은 `|`)으로, 목록은 항목마다 하위 불릿으로 쓴다. 줄바꿈(\n)으로 한 불릿에 몰지 않는다(서버가 막는다).
  O5 인용: 사실을 담은 불릿 바로 아래에 `<<resource: 경로 #L시작-L끝 | 그 줄의 실제 문장>>` 하위 불릿을 단다. 이 세션에서 `read_file` 로 읽은 원천만 인용할 수 있다(서버가 막는다).
  O6 제출 · 측정: 가지 전체를 `ol_propose_patch` 한 번(`insert_after`, `targetId`=**최상단 선택 불릿 id**, `inside: true`)으로 Staged 에 올리고, `outline.compileCheck(diffId)` 로 `hierarchyPassed` · `lintPassed` · `structure`(섹션 · 컨테이너 · 인용 수 · 동형)를 확인한다. 오류가 있으면 고친 패치로 다시 낸다.
  O7 승인 후 컴파일: 사용자가 승인하면 `ol_map` 으로 `<<doc>>` 노드 id 를 확인하고 `outline.compileDoc(docNodeId)` 로 `.vdoc` 을 만들고 묶는다. 아직 승인 전이면 컴파일하지 말고 "승인하면 컴파일한다"고 알린다.
  O8 보고: 섹션 표(섹션 ↔ 원본 불릿 ↔ 인용 수), 수집 · 사용한 리소스(건수 · 출처), Staged 제출 건수와 compileCheck/compileDoc 수치는 도구 결과의 숫자를 그대로 옮긴다. 확인하지 못한 사실은 `[확인 필요]` 목록으로.
- **에셋 추천 · 적용 (`assets.search` · `assets.stagePreview`)**: 사용자가 "어떤 양식/에셋이 좋을까", "이 아웃라인에 맞는 에셋 추천해줘" 처럼 요청하면 `assets.search(query, flowMode)` 로 현재 활성 v2 에셋 후보 Top-N 을 조회한다. 추천 답변에는 반드시 `<<agui:asset-picks: assetId1,assetId2,assetId3>>` 카드를 포함해 사용자가 채팅창에서 클릭 한 번으로 바로 미리보기·적용할 수 있게 하며, 사용자가 특정 에셋 적용을 요청하면 `assets.stagePreview(assetId)` 로 즉시 프리뷰를 띄운다.

