import { getObsidianDisplayName, type MemoryVaultSeedEntry } from "@vibe/vault-core";
import { createSampleProposalVDoc, serializeVDocJson } from "./vdocCodec";

export function resolveTabTitle(path: string): string {
  const name = path.split("/").pop() ?? path;
  const display = getObsidianDisplayName(name, "file");
  return display.extensionBadge
    ? `${display.label}.${display.extensionBadge.toLowerCase()}`
    : display.label;
}

function makeOutlineDoc(id: string, title: string, rootNodes: unknown[]): string {
  const now = "2026-11-19T09:00:00.000Z";
  return JSON.stringify(
    {
      version: 1,
      id,
      title,
      defaultView: "bullets",
      createdAt: now,
      updatedAt: now,
      rootNodes,
    },
    null,
    2
  );
}

export const V2_SAMPLE_VAULT_SEEDS: readonly MemoryVaultSeedEntry[] = [
  {
    path: "01. Architecture/00. System-Proposal.vdoc",
    kind: "file",
    ctime: 1763499000000,
    mtime: 1763542000000,
    content: serializeVDocJson(createSampleProposalVDoc()),
  },
  {
    path: "01. Architecture/v2-component-system.outline",
    kind: "file",
    ctime: 1763500000000,
    mtime: 1763540000000,
    content: makeOutlineDoc("v2-component-system", "v2 신규 레퍼런스 컴포넌트 시스템", [
      {
        id: "obs-root",
        text: "옵시디언 (Workspace · Vault · Document Engine)",
        isFolded: false,
        children: [
          {
            id: "obs-fe",
            text: "File Explorer — 90% Parity (가이드선 · 6종 정렬 · Auto-reveal · 다중선택 · DnD)",
            isFolded: false,
            children: [],
          },
          {
            id: "obs-tab",
            text: "탭 - Split Layout (무한 이진 분할 · 4방향 드래그 도킹 · Open With 어댑터 전환)",
            isFolded: false,
            children: [],
          },
          {
            id: "obs-vault",
            text: "Vault & MetadataCache (Headless VaultPort + [[위키링크]] 자동 리네임)",
            isFolded: false,
            children: [],
          },
          {
            id: "obs-engine",
            text: "플러그인 에디터 어댑터 (.md CM6 Live Preview · .outline 정식 사양 · 향후 2D 엔진)",
            isFolded: false,
            children: [],
          },
        ],
      },
      {
        id: "agy-root",
        text: "AGY-IDE (AI-Composer · Harness · Terminal)",
        isFolded: false,
        children: [
          {
            id: "agy-comp",
            text: "AI-Composer ↔ File Explorer / Editor 선택 영역 연동",
            isFolded: false,
            children: [],
          },
          {
            id: "agy-harness",
            text: "Harness Engineering (/skill · @mention)",
            isFolded: false,
            children: [],
          },
          {
            id: "agy-term",
            text: "Terminal — 실시간 AI & Vault 실행 로그 콘솔",
            isFolded: false,
            children: [],
          },
        ],
      },
    ]),
  },
  {
    path: "01. Architecture/01. Vault-Contract.md",
    kind: "file",
    ctime: 1763501000000,
    mtime: 1763539000000,
    content: `---
title: Vault Port & Markdown Tier-1
tags: [architecture, obsidian, cm6]
status: active
---

> [!tip] CodeMirror 6 Live Preview 엔진이 활성화되어 있습니다
> 커서가 다른 줄에 있을 때는 문법 기호가 숨겨지고, **줄을 클릭해 커서를 넣으면** 원시 마크다운이 펼쳐집니다. \`Ctrl+E\`로 Reading View를 전환하거나, 상단에서 **Source Mode**로 바꿀 수 있습니다.

## 핵심 기능 바로 테스트하기
- [x] YAML Frontmatter Properties 폼 편집 (위 Properties 패널 확인)
- [ ] 체크박스를 클릭해서 완료 상태 토글해 보기
- [ ] 문서 최상단 **Inline Title**을 수정하면 파일명 변경 + 전체 \`[[위키링크]]\` 자동 갱신!
- [ ] \`[[\` 를 타이핑해서 Vault 파일 자동완성 팝업 띄우기
- [ ] \`#\` 를 타이핑해서 #obsidian 태그 자동완성 띄우기

## Wikilink & Transclusion Embed
- 일반 링크 클릭: [[02. Layout-Parity-Checklist|탭 & 분할 체크리스트]] (Ctrl+Click으로 새 탭)
- 아웃라인 파일 열기: [[v2-component-system.outline]]
- ==형광펜 하이라이트== 및 ~~취소선~~ 지원 #architecture

### 실시간 트랜스클루전 임베드 (![[...]])
![[v2-component-system.outline]]

> [!note] Editor Adapter ("Open With...")
> 탭을 우클릭하거나 우상단 \`⋯\` 메뉴에서 **Open With → Raw Source / Code**를 눌러 같은 파일을 다른 에디터 엔진으로 즉시 전환해 보세요.

\`\`\`ts
// 새 에디터 엔진(예: 2D 캔버스)은 어댑터 1줄 등록으로 확장됩니다.
editorRegistry.register(canvas2dAdapter);
\`\`\`
`,
  },
  {
    path: "01. Architecture/02. Layout-Parity-Checklist.md",
    kind: "file",
    ctime: 1763502000000,
    mtime: 1763538000000,
    content: `---
title: Tab & Split Layout Parity Checklist
tags: [obsidian, layout, checklist]
---

> [!warning] 점검 가이드
> 아래 항목들은 모두 \`@vibe/workspace-layout\` + \`@vibe/markdown-editor\` 패키지로 동작합니다. 상위 설계는 [[01. Vault-Contract|Vault 계약 문서]]를 참고하세요.

## 10대 손맛 시나리오
- [ ] **탭 고정(Pin)**: 탭 우클릭 → \`Pin\` 후 다른 파일 클릭 시 고정 탭 보호
- [ ] **4방향 드래그 도킹**: 탭이나 파일을 에디터 상·하·좌·우 가장자리로 드래그해 무한 분할
- [ ] **Open With 엔진 전환**: \`.outline\` 탭을 \`Raw Source / Code\`로 전환해 원본 JSON 확인
- [ ] **스택 탭(Stacked Tabs)**: 탭 바 우측 레이어 아이콘으로 세로 스파인 모드 전환
- [ ] **히스토리 탐색**: \`Alt+←\` / \`Alt+→\`로 탭별 독립 뒤로/앞으로 이동

| 영역 | 패키지 | 상태 |
| --- | --- | --- |
| 파일시스템 & 링크 캐시 | \`@vibe/vault-core\` | 완료 |
| 탐색기 90% | \`@vibe/file-explorer\` | 완료 |
| 분할·도킹·어댑터 | \`@vibe/workspace-layout\` | 완료 |
| 마크다운 CM6 Tier 1 | \`@vibe/markdown-editor\` | 완료 |
`,
  },
  {
    path: "02. Specs/Project-Roadmap.outline",
    kind: "file",
    ctime: 1763503000000,
    mtime: 1763537000000,
    content: makeOutlineDoc("project-roadmap", "IDE 워크벤치 단계별 로드맵", [
      {
        id: "rm-1",
        text: "Phase 1 — Headless 코어 패키지 4종 구축",
        isFolded: false,
        children: [
          {
            id: "rm-1-1",
            text: "@vibe/vault-core (MemoryVaultAdapter + MetadataCache + 위키링크 자동 갱신)",
            isFolded: false,
            children: [],
          },
          {
            id: "rm-1-2",
            text: "@vibe/file-explorer (Obsidian 90% 탐색기)",
            isFolded: false,
            children: [],
          },
          {
            id: "rm-1-3",
            text: "@vibe/workspace-layout (이진 분할 + 4방향 도킹 + EditorRegistry 어댑터)",
            isFolded: false,
            children: [],
          },
          {
            id: "rm-1-4",
            text: "@vibe/markdown-editor (CodeMirror 6 Obsidian Tier-1 Live Preview)",
            isFolded: false,
            children: [],
          },
        ],
      },
      {
        id: "rm-2",
        text: "Phase 2 — AGY-IDE AI-Composer & Harness 통합",
        isFolded: false,
        children: [
          {
            id: "rm-2-1",
            text: "@mention 파일/선택영역 정밀 컨텍스트 주입",
            isFolded: false,
            children: [],
          },
          {
            id: "rm-2-2",
            text: "/skill 실행 및 Terminal 스트림 로그 연동",
            isFolded: false,
            children: [],
          },
        ],
      },
      {
        id: "rm-3",
        text: "Phase 3 — LocalFsVaultAdapter (:8090) & 2D 캔버스 어댑터 추가",
        isFolded: false,
        children: [],
      },
    ]),
  },
  {
    path: "02. Specs/Notes/Meeting-261119.md",
    kind: "file",
    ctime: 1763504000000,
    mtime: 1763536000000,
    content: `---
date: 2026-11-19
tags: [meeting, spec]
---

# 2026-11-19 설계 메모

- 깊은 폴더(\`02. Specs/Notes/\`) 안에 있는 파일입니다.
- **Auto-reveal**을 켜면 상위 폴더가 자동으로 펼쳐집니다.
- 관련 문서: [[01. Vault-Contract]] · [[Project-Roadmap.outline]]
`,
  },
  {
    path: "03. Harness/skills/outline-review.md",
    kind: "file",
    ctime: 1763505000000,
    mtime: 1763535000000,
    content: `---
name: outline-review
tags: [skill, harness]
description: 아웃라인 문서의 계층 구조와 누락 항목을 점검하는 스킬
---

# /outline-review

1. 대상 \`.outline\` 파일의 루트 노드를 순회한다.
2. 중복·고아 항목을 찾아 요약한다.
`,
  },
  {
    path: "03. Harness/vault.config.json",
    kind: "file",
    ctime: 1763506000000,
    mtime: 1763534000000,
    content: JSON.stringify(
      {
        vaultId: "vibe-ide-vault",
        defaultMarkdownEngine: "obsidian-markdown",
        defaultOutlineEngine: "vibe-outliner",
        autoUpdateWikilinksOnRename: true,
        theme: "obsidian-dark",
      },
      null,
      2
    ),
  },
  {
    path: "README.md",
    kind: "file",
    ctime: 1763507000000,
    mtime: 1763541000000,
    content: `---
title: VibeDocStudio v2-ide Playground
tags: [readme, obsidian, agy-ide]
---

# VibeDocStudio v2-ide Playground

**Obsidian (Vault · File Explorer · Split Tabs · CodeMirror 6 Markdown · .outline)** + **AGY-IDE (Composer · Harness · Terminal)** 결합 목업입니다.

- 시작 문서: [[01. Vault-Contract]] · [[v2-component-system.outline]] · [[02. Layout-Parity-Checklist]]
- 에디터에서 텍스트를 드래그해 선택하면 우측 **AI-Composer** 패널에 실시간 선택 컨텍스트가 연동됩니다.
`,
  },
];
