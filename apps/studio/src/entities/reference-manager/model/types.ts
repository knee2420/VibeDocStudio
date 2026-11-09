/**
 * Reference(레퍼런스) 모델 — 남이 만든 완성물에서 "어떻게 썼나"를 꺼내기 위한 읽기 전용 원료.
 *
 * 레퍼런스는 작업 문서(VDoc)가 아니다. 에디터 문서 스토어 · 템플릿 허브 · 자동 저장과 무관하고,
 * 서버의 `/api/reference` 라이브러리(원본 · 구조 추출 · 층위 측정 · 핀)만 쓴다.
 * 앵커: `ref:<refId>[#p<쪽>][#pin:<pinId>][#blk:<blockId>]`
 */

export type ReferenceKind = "pdf" | "web" | "image";
export type ReferenceStatus = "ready" | "failed";
export type ReferencePinKind = "region" | "text" | "memo";

/** 라이브러리 항목 (프로젝트에 묶이지 않는다). */
export interface ReferenceItem {
  refId: string;
  kind: ReferenceKind;
  title: string;
  sourceName: string;
  sourceUrl: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  layerSet: string;
  status: ReferenceStatus;
  error: string;
  createdAt: number;
  updatedAt: number;
}

/** 원본 위의 한 곳 — "이 부분의 결정을 가져오고 싶다" 는 표시. 서버에 저장된다. */
export interface ReferencePin {
  pinId: string;
  refId: string;
  kind: ReferencePinKind;
  page: number | null;
  /** [ymin, xmin, ymax, xmax] 0~1000 */
  bbox: [number, number, number, number] | null;
  text: string;
  label: string;
  note: string;
  /** 층위 태그 (D1 …) — 비우면 층위를 정하지 않은 핀 */
  layer: string;
  anchor: string;
  createdAt: number;
}

/** 프로젝트에 연결된 레퍼런스 (순서 = 화면의 참조 번호). `layers` 에 없는 층위는 켜진 것으로 본다. */
export interface BoundReference {
  refId: string;
  enabled: boolean;
  layers: Record<string, boolean>;
  item: ReferenceItem;
}

export interface ProjectReferenceBinding {
  projectId: string;
  entries: BoundReference[];
  updatedAt: number;
}

export interface ReferenceBlock {
  id: string;
  page: number;
  kind: "heading" | "paragraph" | "list" | "table";
  level: number;
  text: string;
  html: string;
  bbox: [number, number, number, number] | null;
}

export interface ReferenceOutlineEntry {
  blockId: string;
  title: string;
  level: number;
  page: number;
}

/** 구조 추출 결과 (읽기 전용 분석 재료). */
export interface ReferenceExtraction {
  version: number;
  refId: string;
  kind: ReferenceKind;
  pages: { page: number; width: number; height: number }[];
  blocks: ReferenceBlock[];
  outline: ReferenceOutlineEntry[];
  article?: { title: string; siteName?: string; byline?: string; url?: string; html: string; text: string };
}

export interface ReferenceLayer {
  id: string;
  name: string;
  question: string;
  values: Record<string, unknown>;
  qualitative: boolean;
}

/** 층위 측정 (D1–D6 …). */
export interface ReferenceLayers {
  version: number;
  set: string;
  metrics: Record<string, unknown>;
  layers: ReferenceLayer[];
}

/** 뷰어에서 지금 초점을 받은 핀 · 영역. */
export interface FocusedReferencePin {
  refId: string;
  pinId: string;
  page: number;
  kind?: ReferencePinKind;
  bbox?: [number, number, number, number];
  text?: string;
  at: number;
}

export const isLayerOn = (ref: Pick<BoundReference, "layers">, layerId: string): boolean =>
  ref.layers[layerId] ?? true;
