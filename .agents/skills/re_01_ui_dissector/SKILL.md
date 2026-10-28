---
name: re_01_ui_dissector
description: "사용자가 외부 웹 서비스(PandaDoc 등)나 앱의 프론트엔드 UI/DOM/CSS 토큰, 내부 문서 JSON 스키마, 압축된 JS 번들 로직을 REA(Reverse Engineer Anything)로 해체·분석하여 '_dissections/<서비스명>/'에 표본으로 추출하라고 지시할 때 발동합니다."
---

# 🔬 External Web & UI Dissector (`REA` 기반 역설계 스킬)

이 스킬은 `REA`(`rea-agents` MCP 서버 및 CLI)를 활용하여 외부 레퍼런스 서비스(예: PandaDoc)의 **① 화면 DOM/CSS 레이아웃 토큰**, **② 네트워크/HAR 기반 내부 문서 JSON 스키마**, **③ 프론트엔드 JS 번들 모듈 그래프 및 에디터 로직**을 증거(Evidence) 기반으로 해체하여 `_dissections/<서비스명>/` 디렉토리에 정형 표본으로 저장하는 표준 워크플로우입니다.

---

## 🛠️ 1. 핵심 해체 명령어 (`rea` CLI / MCP 도구)

| 분석 단계 | `rea` 명령어 (MCP / CLI) | 추출 결과물 |
| :--- | :--- | :--- |
| **1. 웹 번들 & 모듈 정적 해체** | `rea analyze-web-bundle <URL 또는 번들경로>` | 압축된 프론트엔드 JS 번들 구조 및 핵심 모듈 식별 |
| **2. JS 소스 복원 (Deobfuscation)** | `rea recover-javascript-sources` | 난독화/압축된 에디터 모듈을 읽을 수 있는 JS/TS 코드로 복원 |
| **3. 네트워크 캡처(HAR) → 상태/스키마 추출** | `rea environment-build` / `rea compare-web-captures` | 브라우저 HAR 기록에서 실제 문서 JSON 스키마 및 API 계약 추출 |
| **4. 특정 기능 시맨틱 추적** | `rea trace-javascript-semantics` / `rea trace-application-feature` | 슬롯 선택, 드래그 앤 드롭, 변수 바인딩 등 특정 기능의 호출 사슬 추적 |

---

## 📂 2. 표본 저장 규격 (`_dissections/<target>/`)

해체된 모든 결과물은 재분석 비용을 없애기 위해 반드시 아래 파일 규격으로 `_dissections/<target>/` 하위에 영구 보존합니다:

1. `01.layout_tokens.json` — 3단 패널 치수, 툴바 높이, 여백, 색상, 타이포그래피 등 CSS 디자인 토큰
2. `02.document_schema.json` — 타겟 서비스의 실제 문서 저장/렌더링 JSON 스키마 표본
3. `03.module_anatomy.md` — JS 번들에서 역추적한 에디터 노드/슬롯/상태 관리 아키텍처 요약

