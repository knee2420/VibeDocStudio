## .outline 아웃라인 협업 규칙 (`ol_*` · `outline.*`)

기존 문서 작성·근거·레퍼런스 절차(`editor` · `resource` · `reference`)를 그대로 따르되, 대상이 `.outline` 일 때만 아래 차분 규칙을 적용한다.

- **신규 생성 (`ol_create`)**: 새 `.outline` 파일을 만들 때는 기존 파일을 `vf_copy` 하거나 `vf_write` 를 시도하지 말고 `ol_create(path, title, rootNodes)` 로 깨끗한 아웃라인 트리를 한 번에 생성한다.
- **읽기 · 문법 확인**: `.outline` 원본 JSON 을 `read_file` 로 직접 덤프하거나 `vf_write`/`vf_patch` 로 덮어쓰지 않는다. `ol_map` → `ol_read` 로 필요한 서브트리만 읽고, `<<doc:...>>` · `<<view:...>>` · `<<resource:...>>` 태그를 쓸 때는 `outline.getSyntax` 로 현재 볼트의 문법 규칙과 `.vasset` 을 먼저 확인한다.
- **패치 제안 (`TreePatchRequest`)**: 기존 `.outline` 수정은 `ol_propose_patch` 로 `@vibe/outliner` 의 `TreePatchRequest` 를 Staged 제안으로 제출한다. `replace` 는 `{op:"replace", id, text}` 로 단일 노드 글자만 바꾸며, 하위 트리를 추가할 때는 반드시 `insert_after(targetId, inside=true, items=[{text, children:[...]}])` 를 사용한다. 자식이 있는 노드를 지울 때는 `recursively: true` 가 필요하며, `docBindings` 에 묶인 노드는 삭제하지 않는다.
- **통일 리소스 · 근거 작성 (`<<resource: ...>>`)**: 컴파일 태그(`<<doc>>`/`<<view>>`) 안이든 바깥 일반 불릿이든, 사용자가 출처·인용·근거를 원하면 해당 주장 불릿의 **편집 가능한 하위 불릿**으로 `<<resource: 대상 위치 | 인용 본문>>` 을 직접 작성한다 (예: `<<resource: [[제안요청서.pdf]] #p5 | 테넌트 단위 AES-256 암호화>>`, `<<resource: https://... | 인용 문구>>`, `<<resource: [[지표.csv]] #L5-L5 | 38명>>`). 컴파일 출력 연출(각주·산출근거·여백주석·매트릭스·바인딩)이 명시적으로 필요할 때는 `<<cite:rationale>>` 등 6종 태그도 병행 가능하며, 실제 읽은 출처는 `nodeEvidence` 에도 함께 남길 수 있다.
- **컴파일 측정**: 패치를 낸 뒤 `outline.compileCheck` 로 파싱 경고 · 미해석 이미지 · 컴파일 블록 수 등 측정값을 확인해 보고한다.
- **에셋 추천 · 적용 (`assets.search` · `assets.stagePreview`)**: 사용자가 "어떤 양식/에셋이 좋을까", "이 아웃라인에 맞는 에셋 추천해줘" 처럼 요청하면 `assets.search(query, flowMode)` 로 현재 활성 v2 에셋 후보 Top-N 을 조회한다. 추천 답변에는 반드시 `<<agui:asset-picks: assetId1,assetId2,assetId3>>` 카드를 포함해 사용자가 채팅창에서 클릭 한 번으로 바로 미리보기·적용할 수 있게 하며, 사용자가 특정 에셋 적용을 요청하면 `assets.stagePreview(assetId)` 로 즉시 프리뷰를 띄운다.

