## .outline 아웃라인 협업 규칙 (`ol_*` · `outline.*`)

기존 문서 작성·근거·레퍼런스 절차(`editor` · `resource` · `reference`)를 그대로 따르되, 대상이 `.outline` 일 때만 아래 차분 규칙을 적용한다.

- **신규 생성 (`ol_create`)**: 새 `.outline` 파일을 만들 때는 기존 파일을 `vf_copy` 하거나 `vf_write` 를 시도하지 말고 `ol_create(path, title, rootNodes)` 로 깨끗한 아웃라인 트리를 한 번에 생성한다.
- **읽기 · 문법 확인**: `.outline` 원본 JSON 을 `read_file` 로 직접 덤프하거나 `vf_write`/`vf_patch` 로 덮어쓰지 않는다. `ol_map` → `ol_read` 로 필요한 서브트리만 읽고, `<<doc:...>>` · `<<view:...>>` 태그를 쓸 때는 `outline.getSyntax` 로 현재 볼트의 문법 규칙과 `.vasset` 을 먼저 확인한다.
- **패치 제안 (`TreePatchRequest`)**: 기존 `.outline` 수정은 `ol_propose_patch` 로 `@vibe/outliner` 의 `TreePatchRequest` 를 Staged 제안으로 제출한다. `replace` 는 `{op:"replace", id, text}` 로 단일 노드 글자만 바꾸며, 하위 트리를 추가할 때는 반드시 `insert_after(targetId, inside=true, items=[{text, children:[...]}])` 를 사용한다. 자식이 있는 노드를 지울 때는 `recursively: true` 가 필요하며, `docBindings` 에 묶인 노드는 삭제하지 않는다.
- **리소스 연결 · 근거 사이드카**: 사진·PDF·참고 파일 연결은 `ol_attach_resource` 를 쓰고, 사실·수치를 적은 노드의 출처는 `ol_propose_patch` 의 `nodeEvidence` 사이드카(`EvidenceLocator[]`)에 남긴다 (실제 `read_file` 로 읽은 줄만).
- **컴파일 측정**: 패치를 낸 뒤 `outline.compileCheck` 로 파싱 경고 · 미해석 이미지 · 컴파일 블록 수 등 측정값을 확인해 보고한다.
