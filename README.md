# VibeDocStudio (`.vdoc`)

> **PandaDoc 3-Pane Document Builder + AI WYSIWYG + WYSIWYM (Grid-Slot) + Component-Attached AI Composer**

1차원 마크다운(`.md`) 줄글의 가독성 한계를 넘어, **모니터 화면에서 한눈에 들어오는 2차원 시각 레이아웃(다단 그리드, 요약 배너, 카드, 정밀 표)**을 유지하면서도 **화면 위에서 즉시 수정·재배치(WYSIWYG)**하고 **각 컴포넌트에 직접 붙는 AI Composer 및 슬롯별 백데이터로 상호작용(WYSIWYM)**하는 차세대 문서 스튜디오입니다.

---

## 📂 디렉토리 구조 (Repository Architecture)

```text
VibeDocStudio/
 ├─ _upstreams/           # [Git 제외] 원본 오픈소스 부품 창고 (읽기 전용 레퍼런스)
 │   ├─ puck/             # measuredco/puck (3-Pane 쉘 & CSS Grid/DropZone & Overlay Portal)
 │   ├─ maily.to/         # arikchakma/maily.to (Tiptap 커스텀 노드 & 변수 칩 & 서식 툴바)
 │   ├─ novel/            # steven-tey/novel (cmdk + Floating UI 기반 컴포넌트 부착형 AI 바)
 │   └─ assistant-ui/     # assistant-ui/assistant-ui (ComposerPrimitive & 컨텍스트 칩)
 │
 ├─ _dissections/         # 외부 레퍼런스 서비스(PandaDoc 등) 역설계 표본실
 │   └─ pandadoc/         # DOM/CSS 레이아웃 토큰 및 문서 JSON 스키마 분석본
 │
 ├─ packages/             # 핵심 알맹이 발췌·개조 패키지 (In-Tree Vendor Packages)
 │   ├─ slot-canvas/      # @vibe/slot-canvas : Puck 기반 페이지·그리드·슬롯 레이아웃 엔진 (WYSIWYM)
 │   ├─ slot-editor/      # @vibe/slot-editor : Maily.to(Tiptap) 기반 슬롯 내부 위지윅 에디터 (WYSIWYG)
 │   └─ ai-composer/      # @vibe/ai-composer : Novel + assistant-ui 기반 컴포넌트 부착형 AI Composer
 │
 └─ apps/
     ├─ studio/           # @vibe/studio : 판다독 스타일 3단 문서 빌더 통합 프론트엔드
     └─ api/              # @vibe/api    : 양식/백데이터 이중 임포트 & 슬롯 AI FastAPI 백엔드
```

---

## 📄 전용 파일 포맷: `.vdoc` (UTF-8 JSON)

* **확장자**: `*.vdoc` (*Vibe Document*)
* **내부 구조**: 100% 순수 UTF-8 JSON (`LayoutTree` + `SlotMap` + `BackdataStore`)
