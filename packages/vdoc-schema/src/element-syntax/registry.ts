/**
 * @vibe/vdoc-schema — CRUD 가능한 ElementSyntaxRegistry 구현 및 표준 시드(`table`, `section`).
 */
import type {
  DocumentProfileSchema,
  ElementRegistrySnapshot,
  ElementSyntaxDefinition,
  ElementSyntaxRule,
} from "./contract";

export const DEFAULT_DOCUMENT_PROFILES: readonly DocumentProfileSchema[] = [
  {
    id: "blog",
    label: "블로그 (Blog)",
    description: "이음매 없는 720px 스크롤 지면, SECTION 최상위 단위 기반 블로그 문서",
    unitKind: "section",
    surface: { kind: "scroll", width: 720 },
    allowedElementIds: ["section", "table", "resource"],
    defaultSkin: "korean-editorial-blog",
  },
  {
    id: "a4",
    label: "A4 문서 (Paged)",
    description: "794px 인쇄 페이지 단위 일반·공공 서식 문서",
    unitKind: "page",
    surface: { kind: "paged", width: 794 },
    allowedElementIds: ["table", "section", "resource"],
    defaultSkin: "korean-form-sheet",
  },
  {
    id: "web",
    label: "웹 아티클 (Web)",
    description: "960px 와이드 SECTION 기반 웹 문서 및 랜딩",
    unitKind: "section",
    surface: { kind: "scroll", width: 960 },
    allowedElementIds: ["section", "table", "resource"],
    defaultSkin: "korean-editorial-blog",
  },
];

export const DEFAULT_TABLE_ELEMENT_DEF: ElementSyntaxDefinition = {
  id: "table",
  viewTag: "table",
  version: "1.0.0",
  label: "표 형식 (Table)",
  description: "복잡한 한국형 폼 표와 데이터 표를 직교 기호 4종과 트리 들여쓰기(rowspan)로 조합하는 표준 표 규격",
  allowedInViews: ["a4", "blog", "web"],
  defaultSkin: "korean-form-sheet",
  fallbackPolicy: "plain-text",
  skins: {
    "korean-form-sheet": {
      id: "korean-form-sheet",
      label: "한국형 폼 서식 표",
      align: "left",
    },
  },
  rules: [
    {
      id: "tree-rowspan",
      symbol: "indent",
      primitive: "span",
      position: "tree",
      description: "부모 노드가 자식을 가지면 1열 세로 병합(rowspan) 헤더 셀로 전개",
      options: { axis: "row" },
    },
    {
      id: "col-split",
      symbol: "|",
      primitive: "split",
      position: "infix",
      description: "열 구분 (한 행의 셀을 가로로 분할)",
    },
    {
      id: "empty-slot",
      symbol: "[-]",
      primitive: "slot",
      position: "bracket",
      description: "빈 칸 표시 (입력 슬롯)",
      options: { slotKind: "empty" },
    },
    {
      id: "merge-left",
      symbol: "[<]",
      primitive: "span",
      position: "bracket",
      description: "왼쪽 기준 병합 (colspan 확장)",
      options: { mergeDir: "left" },
    },
    {
      id: "merge-up",
      symbol: "[^]",
      primitive: "span",
      position: "bracket",
      description: "위쪽 칸과 병합 (rowspan 확장)",
      options: { mergeDir: "up" },
    },
    {
      id: "cell-container",
      symbol: "<<cell>>",
      primitive: "frame",
      position: "bracket",
      description: "복합 컨테이너 셀 (하위 트리 전체를 셀 내부 블록으로 재귀 배치)",
      options: { container: "cell" },
    },
    {
      id: "row-container",
      symbol: "<<row>>",
      primitive: "stack",
      position: "prefix",
      description: "다중 복합 셀 행 (| 없이 하위 <<cell>> 들을 한 행으로 묶음)",
      options: { container: "row" },
    },
  ],
};

export const DEFAULT_SECTION_ELEMENT_DEF: ElementSyntaxDefinition = {
  id: "section",
  viewTag: "section",
  version: "1.0.0",
  label: "섹션 (Blog / Web Section)",
  description:
    "블로그·웹 문서의 다양한 시각 표현(1+2 콜라주, 인용구, 스팟 정보 프레임, 하이라이트 바, 제휴 CTA, 고지 배지, 중첩 표)을 최소 직교 기호 조합으로 표현하는 표준 섹션 규격",
  allowedInViews: ["blog", "web", "a4"],
  defaultSkin: "korean-editorial-blog",
  fallbackPolicy: "plain-text",
  skins: {
    "korean-editorial-blog": {
      id: "korean-editorial-blog",
      label: "한국형 에디토리얼 블로그",
      align: "center",
      quoteStyle: "underline-frame",
      accentColor: "pink",
      imageGap: 4,
      maxWidthPx: 720,
    },
  },
  rules: [
    {
      id: "tree-group",
      symbol: "indent",
      primitive: "stack",
      position: "tree",
      description: "들여쓰기로 시각 컨테이너 묶음 (> 하위 메타 정보 카드, [img] 하위 캡션 등)",
    },
    {
      id: "horizontal-split",
      symbol: "|",
      primitive: "split",
      position: "infix",
      description: "가로 병렬 분할 ([img] | [img] 2단 스트립, [img] | 텍스트 2단 배치)",
    },
    {
      id: "frame-box",
      symbol: ">",
      primitive: "frame",
      position: "prefix",
      description: "프레임/인용구 (단독 1줄 = 중앙 인용구, 자식 KV 포함 = 좌측 정보 프레임 카드)",
    },
    {
      id: "accent-bar",
      symbol: "!",
      primitive: "accent",
      position: "prefix",
      description: "팁 · 포인트 · 형광펜 강조 바",
    },
    {
      id: "kv-meta",
      symbol: "::",
      primitive: "kv",
      position: "infix",
      description: "경량 Key-Value 메타 행 (입장료 :: 무료)",
    },
    {
      id: "divider-line",
      symbol: "---",
      primitive: "stack",
      position: "line",
      description: "시각적 구분선 / 호흡 전환",
      options: { divider: true },
    },
    {
      id: "image-slot",
      symbol: "[img]",
      primitive: "slot",
      position: "bracket",
      description: "이미지 슬롯 ([img:설명] 또는 [img:설명 | url], 연속 배치 + | 로 콜라주 구성)",
      options: { slotKind: "img" },
    },
    {
      id: "cta-slot",
      symbol: "[cta]",
      primitive: "slot",
      position: "bracket",
      description: "클릭 유도 액션 / 제휴·할인 CTA ([cta:라벨 -> url])",
      options: { slotKind: "cta" },
    },
    {
      id: "embed-slot",
      symbol: "[embed]",
      primitive: "embed",
      position: "bracket",
      description: "확장형 외부 오브젝트 슬롯 ([embed:disclosure|map|video|og | 내용])",
      options: { slotKind: "embed" },
    },
    {
      id: "inline-highlight",
      symbol: "==",
      primitive: "accent",
      position: "inline",
      description: "본문 인라인 형광펜 강조 (==텍스트==)",
    },
    {
      id: "form-title",
      symbol: "<<view:title>>",
      primitive: "accent",
      position: "prefix",
      description: "문서·서식 상단 제목 블록",
    },
    {
      id: "list-view",
      symbol: "<<view:list>>",
      primitive: "stack",
      position: "prefix",
      description: "항목 목록 컨테이너 (글머리 기호 모양은 .vstyle · 인스펙터에서 지정)",
    },
    {
      id: "columns-container",
      symbol: "<<view:columns>>",
      primitive: "split",
      position: "prefix",
      description: "다단 컨테이너 (하위 <<col>> 블록들을 가로 다단 배치, 열 비율은 인스펙터에서 지정)",
    },
    {
      id: "col-container",
      symbol: "<<col>>",
      primitive: "frame",
      position: "prefix",
      description: "다단 컬럼 컨테이너 (하위 트리 전체를 해당 열 내부 블록으로 재귀 배치)",
    },
  ],
};

export const DEFAULT_RESOURCE_ELEMENT_DEF: ElementSyntaxDefinition = {
  id: "resource",
  viewTag: "cite",
  version: "1.0.0",
  label: "리소스 · 근거 형식 (Resource / Citation)",
  description:
    "원본 리소스·백데이터의 인용문, 출처, 산출 근거, 여백 주석, 1:N 추적 매트릭스, 근거 바인딩 팩트 토큰을 편집 가능한 하위 불릿으로 선언하는 표준 근거 규격",
  allowedInViews: ["a4", "blog", "web"],
  defaultSkin: "provenance-review",
  fallbackPolicy: "plain-text",
  skins: {
    "provenance-review": {
      id: "provenance-review",
      label: "검토 · 출처 추적 레이어 (기본)",
      align: "left",
      quoteStyle: "left-bar",
      accentColor: "emerald",
    },
  },
  rules: [
    {
      id: "resource-unified",
      symbol: "<<resource: 대상 위치 | 본문>>",
      primitive: "embed",
      position: "prefix",
      description:
        "통합 리소스 참조 태그 (웹 URL · PDF #pN/#bbox · MD/CSV #L.. · Outline #node: · VDoc #slot: · Ref #block: · 이미지 #bbox · 클릭 시 페어 하이라이팅)",
      options: { presentation: "quote-embed" },
    },
    {
      id: "cite-footnote",
      symbol: "<<cite:footnote>>",
      primitive: "slot",
      position: "prefix",
      description: "각주 번호 표기 ([1], [1,2] + 하단 출처 목록 자동 생성)",
      options: { presentation: "footnote" },
    },
    {
      id: "cite-rationale",
      symbol: "<<cite:rationale>>",
      primitive: "accent",
      position: "prefix",
      description: "인라인 산출 근거 표기 (← 산출 근거: ... · N:1 복수 출처 합산)",
      options: { presentation: "inline-rationale" },
    },
    {
      id: "cite-sidenote",
      symbol: "<<cite:sidenote>>",
      primitive: "frame",
      position: "prefix",
      description: "여백 주석 · 사이드노트 (§N 마커 + 본문 우측 발췌 레일)",
      options: { presentation: "sidenote" },
    },
    {
      id: "cite-quote",
      symbol: "<<cite:quote>>",
      primitive: "embed",
      position: "prefix",
      description: "원문 직접 인용 · 트랜스클루전 카드 (원문 구절·표 발췌 직접 삽입)",
      options: { presentation: "quote-embed" },
    },
    {
      id: "cite-matrix",
      symbol: "<<cite:matrix>>",
      primitive: "kv",
      position: "prefix",
      description: "1:N / M:N 요구사항·출처 추적 매트릭스 (<<cite:matrix @REQ-ID>>)",
      options: { presentation: "matrix" },
    },
    {
      id: "cite-bound",
      symbol: "<<cite:bound>>",
      primitive: "slot",
      position: "prefix",
      description: "근거 바인딩 팩트 토큰 (<<cite:bound {값} = 산식>> · 동일 수치 1:N 재사용)",
      options: { presentation: "bound-value" },
    },
    {
      id: "cite-source-link",
      symbol: "[[파일명]]",
      primitive: "embed",
      position: "bracket",
      description: "원본 리소스·백데이터 파일 포인터 (클릭 시 페어 그룹 탭으로 열림)",
    },
    {
      id: "cite-page-anchor",
      symbol: "#pN",
      primitive: "kv",
      position: "inline",
      description: "원본 문서 페이지 번호 앵커 (예: #p12, #p42)",
    },
    {
      id: "cite-line-range",
      symbol: "#L시작-L끝",
      primitive: "kv",
      position: "inline",
      description: "원본 텍스트·CSV 줄 범위 앵커 (예: #L2-L36)",
    },
    {
      id: "cite-segment-split",
      symbol: "|",
      primitive: "split",
      position: "infix",
      description: "산출 근거 문구 · 복수 출처 · 원문 발췌문 구분자",
    },
  ],
};

export function createDefaultRegistrySnapshot(updatedAt = new Date().toISOString()): ElementRegistrySnapshot {
  return {
    version: "1.0.0",
    updatedAt,
    description: "VibeDoc 문서 스키마 표준 Element · Syntax · Document Profile CRUD 레지스트리",
    profiles: DEFAULT_DOCUMENT_PROFILES.map((p) => ({
      ...p,
      surface: { ...p.surface },
      allowedElementIds: [...p.allowedElementIds],
    })),
    elements: [
      cloneElementDef(DEFAULT_TABLE_ELEMENT_DEF),
      cloneElementDef(DEFAULT_SECTION_ELEMENT_DEF),
      cloneElementDef(DEFAULT_RESOURCE_ELEMENT_DEF),
    ],
  };
}

function cloneRule(rule: ElementSyntaxRule): ElementSyntaxRule {
  return { ...rule, options: rule.options ? { ...rule.options } : undefined };
}

function cloneElementDef(def: ElementSyntaxDefinition): ElementSyntaxDefinition {
  return {
    ...def,
    allowedInViews: [...def.allowedInViews],
    rules: def.rules.map(cloneRule),
    skins: def.skins
      ? Object.fromEntries(Object.entries(def.skins).map(([k, v]) => [k, { ...v }]))
      : undefined,
  };
}

function cloneProfile(profile: DocumentProfileSchema): DocumentProfileSchema {
  return {
    ...profile,
    surface: { ...profile.surface },
    allowedElementIds: [...profile.allowedElementIds],
  };
}

/**
 * 런타임 CRUD 가 가능한 Element / Syntax / DocumentProfile 레지스트리.
 * 볼트 JSON 파일(`element-registry.json`)과 손실 없이 import/export 된다.
 */
export class ElementSyntaxRegistry {
  private version: string;
  private updatedAt: string;
  private description?: string;
  private readonly profiles = new Map<string, DocumentProfileSchema>();
  private readonly elements = new Map<string, ElementSyntaxDefinition>();

  constructor(snapshot?: ElementRegistrySnapshot) {
    const seed = snapshot ?? createDefaultRegistrySnapshot();
    this.version = seed.version || "1.0.0";
    this.updatedAt = seed.updatedAt || new Date().toISOString();
    this.description = seed.description;
    for (const profile of seed.profiles ?? []) {
      this.profiles.set(profile.id, cloneProfile(profile));
    }
    for (const el of seed.elements ?? []) {
      this.elements.set(el.id, cloneElementDef(el));
    }
  }

  getVersion(): string {
    return this.version;
  }

  // ---- Element CRUD ----

  listElements(): ElementSyntaxDefinition[] {
    return Array.from(this.elements.values()).map(cloneElementDef);
  }

  getElement(id: string): ElementSyntaxDefinition | undefined {
    const found = this.elements.get(id);
    return found ? cloneElementDef(found) : undefined;
  }

  getElementByViewTag(viewTag: string): ElementSyntaxDefinition | undefined {
    const needle = viewTag.trim().toLowerCase();
    for (const def of this.elements.values()) {
      if (def.viewTag.toLowerCase() === needle) return cloneElementDef(def);
    }
    return undefined;
  }

  createElement(def: ElementSyntaxDefinition): ElementSyntaxDefinition {
    if (!def.id.trim()) throw new Error("Element definition requires non-empty `id`.");
    if (this.elements.has(def.id)) {
      throw new Error(`Element definition already exists: ${def.id}`);
    }
    const stored = cloneElementDef(def);
    this.elements.set(stored.id, stored);
    this.touch();
    return cloneElementDef(stored);
  }

  updateElement(
    id: string,
    patch: Partial<Omit<ElementSyntaxDefinition, "id">>
  ): ElementSyntaxDefinition {
    const existing = this.elements.get(id);
    if (!existing) throw new Error(`Element definition not found: ${id}`);
    const merged: ElementSyntaxDefinition = cloneElementDef({
      ...existing,
      ...patch,
      id: existing.id,
      rules: patch.rules ? patch.rules.map(cloneRule) : existing.rules,
      allowedInViews: patch.allowedInViews ? [...patch.allowedInViews] : existing.allowedInViews,
      skins: patch.skins ? { ...existing.skins, ...patch.skins } : existing.skins,
    });
    this.elements.set(id, merged);
    this.touch();
    return cloneElementDef(merged);
  }

  upsertElement(def: ElementSyntaxDefinition): ElementSyntaxDefinition {
    if (this.elements.has(def.id)) {
      const { id, ...rest } = def;
      return this.updateElement(id, rest);
    }
    return this.createElement(def);
  }

  deleteElement(id: string): boolean {
    const removed = this.elements.delete(id);
    if (removed) this.touch();
    return removed;
  }

  /** 특정 Element 정의 안에서 ruleId 로 기호 문자열을 조회한다 (없으면 defaultSymbol 폴백). */
  resolveSymbol(elementId: string, ruleId: string, defaultSymbol: string): string {
    const def = this.elements.get(elementId);
    const rule = def?.rules.find((r) => r.id === ruleId);
    return rule?.symbol || defaultSymbol;
  }

  // ---- Document Profile CRUD ----

  listProfiles(): DocumentProfileSchema[] {
    return Array.from(this.profiles.values()).map(cloneProfile);
  }

  getProfile(id: string): DocumentProfileSchema | undefined {
    const found = this.profiles.get(id);
    return found ? cloneProfile(found) : undefined;
  }

  upsertProfile(profile: DocumentProfileSchema): DocumentProfileSchema {
    const stored = cloneProfile(profile);
    this.profiles.set(stored.id, stored);
    this.touch();
    return cloneProfile(stored);
  }

  deleteProfile(id: string): boolean {
    const removed = this.profiles.delete(id);
    if (removed) this.touch();
    return removed;
  }

  // ---- Snapshot Import / Export ----

  exportSnapshot(): ElementRegistrySnapshot {
    return {
      version: this.version,
      updatedAt: this.updatedAt,
      description: this.description,
      profiles: this.listProfiles(),
      elements: this.listElements(),
    };
  }

  importSnapshot(raw: ElementRegistrySnapshot | string): void {
    const parsed: ElementRegistrySnapshot =
      typeof raw === "string" ? (JSON.parse(raw) as ElementRegistrySnapshot) : raw;
    if (!parsed || !Array.isArray(parsed.elements)) {
      throw new Error("Invalid ElementRegistrySnapshot payload.");
    }
    this.version = parsed.version || this.version;
    this.updatedAt = parsed.updatedAt || new Date().toISOString();
    this.description = parsed.description;
    this.profiles.clear();
    this.elements.clear();
    for (const profile of parsed.profiles ?? DEFAULT_DOCUMENT_PROFILES) {
      this.profiles.set(profile.id, cloneProfile(profile));
    }
    for (const el of parsed.elements) {
      this.elements.set(el.id, cloneElementDef(el));
    }
  }

  private touch(): void {
    this.updatedAt = new Date().toISOString();
  }
}

export function createElementSyntaxRegistry(
  snapshot?: ElementRegistrySnapshot | string
): ElementSyntaxRegistry {
  if (typeof snapshot === "string") {
    const reg = new ElementSyntaxRegistry();
    reg.importSnapshot(snapshot);
    return reg;
  }
  return new ElementSyntaxRegistry(snapshot);
}
