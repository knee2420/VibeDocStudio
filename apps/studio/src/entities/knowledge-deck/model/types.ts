/**
 * Knowledge Deck(구조화 지식 덱) — 서버 `app.knowledge` 계약과 1:1.
 *
 * 색인은 비동기다: 승격 요청은 곧바로 `queued` 덱 + 작업(job)을 돌려주고,
 * 진행은 작업 이벤트(SSE)로 받는다. 본체(카드 · 인덱스 · 원문 조각)는 서버에 있고
 * Composer 는 `knowledge.*` 서버 도구로 읽는다.
 */

export interface TopicNode {
  id: string;
  title: string;
  level: number;
  page?: number | null;
  snippet: string;
  children?: TopicNode[];
}

export interface DeckStat {
  topicsCount: number;
  tablesCount: number;
  chunksCount: number;
  filesCount: number;
  sectionsCount?: number;
  cardsCount?: number;
  figuresCount?: number;
  codeCount?: number;
  enrichedCount?: number;
}

export type DeckStatus = "queued" | "indexing" | "ready" | "failed" | "cancelled";
export type DeckDepth = "structural" | "enriched";

export interface DeckQuality {
  passed?: boolean;
  failing?: string[];
  metrics?: Record<string, unknown>;
}

/** 덱 안 원본 파일 하나의 색인 진행 (단위: 조각). */
export interface DeckFileProgress {
  path: string;
  /** 파일 이름 (RM 과 같게) */
  title: string;
  /** 문서 안 제목 (있으면) */
  docTitle?: string;
  segments: number;
  done: number;
  status: "pending" | "running" | "done" | "skipped";
  /** skipped 일 때 이유 */
  reason?: string;
}

export const deckFilePercent = (f: DeckFileProgress): number =>
  f.status === "done" ? 100 : f.segments > 0 ? Math.min(100, Math.round((f.done / f.segments) * 100)) : 0;

export interface KnowledgeDeck {
  id: string;
  projectId: string;
  title: string;
  description: string;
  sourcePaths: string[];
  status: DeckStatus;
  progress: number;
  stage?: string;
  depth?: DeckDepth;
  jobId?: string;
  error?: string;
  stat: DeckStat;
  topics: TopicNode[];
  quality?: DeckQuality;
  profile?: { include?: string[]; exclude?: string[] };
  createdAt: number;
  updatedAt: number;
  builtAt?: string;
  isChecked: boolean;
  tags: string[];
  /** 원본 파일별 진행 — 파일이 여러 개인 덱을 펼쳐 "몇 개 끝났나 · 각각 몇 %"를 본다 */
  files?: DeckFileProgress[];
  /** AI 가 쓸 섹션만 고른 것 (비면 전부) — RM 섹션 체크박스 */
  selectedSections?: string[];
}

export interface KnowledgeDeckListResponse {
  decks: KnowledgeDeck[];
}

export interface IndexJob {
  jobId: string;
  deckId: string;
  projectId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  stage: string;
  progress: number;
  depth: DeckDepth;
  error: string;
  usage?: Record<string, number>;
}

export interface JobEvent {
  seq: number;
  type: "queued" | "started" | "progress" | "warning" | "resumed" | "succeeded" | "failed" | "cancelled";
  jobId: string;
  deckId: string;
  status: IndexJob["status"];
  stage: string;
  progress: number;
  detail: Record<string, unknown>;
  ts: number;
}

export interface PromoteOptions {
  title: string;
  sourcePaths: string[];
  itemIds?: string[];
  tags?: string[];
  depth?: DeckDepth;
  profile?: { include?: string[]; exclude?: string[] };
}

export interface DeckSectionOverview {
  sectionId: string;
  title: string;
  source: string;
  cardIds: string[];
  keywords: string[];
  description: string;
}

export interface DeckAsset {
  id: string;
  kind: "table" | "figure" | "code";
  caption: string;
  summary: string;
  columns: string[];
  rows: number;
  rowKeys: string[];
  target: string;
  cardId: string;
  source: string;
}

export interface DeckOverview {
  deckId: string;
  manifest: Record<string, unknown> & { stats?: Record<string, number>; usage?: Record<string, number> };
  sections: DeckSectionOverview[];
  quality: { gates?: Record<string, { pass: boolean; value: string; threshold: string }>; metrics?: Record<string, unknown> };
  assets: { total: number; assets: DeckAsset[] };
}

export interface DeckCardSibling {
  cardId: string;
  title: string;
  lines?: [number, number];
  page?: number | null;
  box?: [number, number, number, number] | null;
  isCurrent?: boolean;
}

export interface DeckCardDetail {
  cardId: string;
  section: string;
  title: string;
  path: string;
  summary: string;
  elements: { name: string; detail?: string; line?: number; origin?: string }[];
  assets: { id: string; kind: string; caption: string; columns: string[]; rows: number }[];
  linksOut: { cardId: string; title: string }[];
  source: string;
  keywords?: string[];
  aliases?: string[];
  questions?: string[];
  depth?: DeckDepth;
  sourceText?: string;
  fullDocument?: string;
  highlightRange?: [number, number];
  totalDocumentLines?: number;
  isPdf?: boolean;
  pdfUrl?: string;
  pdfPage?: number;
  pdfBox?: [number, number, number, number];
  siblings?: DeckCardSibling[];
  error?: string;
}
