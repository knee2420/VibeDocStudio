/**
 * @vibe/vdoc-schema — Document View Registry (Notion View 개념).
 *
 * 동일한 Document 정본(`pages` · `blocks/elements` · `slots` · `evidenceLinks` · `variables`)을
 * 사용자가 보고·조판·출력하려는 유형(`a4` · `blog` · 향후 `email`/`sns`/`book`)으로 투영하는
 * 선언적 View 프로필 레지스트리.
 */
import type { VDocDocument, VDocSurface } from "./types";

export type BuiltInDocumentViewId = "a4" | "blog" | "web";
export type DocumentViewId = BuiltInDocumentViewId | (string & {});

export interface DocumentViewProfile {
  readonly id: DocumentViewId;
  readonly label: string;
  readonly shortBadge: string;
  readonly description: string;
  readonly surface: Required<VDocSurface>;
  readonly genre: string;
  readonly layerSet: string;
  /** 이 문서 프로파일의 최상위 구성 단위 (`a4` = `"page"`, `blog`/`web` = `"section"`). */
  readonly unitKind: "page" | "section";
  /** 구조 패널 상단에 표시할 최상위 단위 명칭 (`"Pages"` | `"Sections"`). */
  readonly unitLabel: string;
  /** 좌측 하단 구조 패널에 물리 `Pages (1..N) + Page 추가` 구역을 표시할지 여부. */
  readonly showPagesSection: boolean;
  /** 좌측 하단 구조 패널에 `Sections (1..N) + Section 추가` 구역을 표시할지 여부. */
  readonly showSectionsSection?: boolean;
  /** 이 문서 프로파일에서 허용되는 CRUD Element 정의 ID 목록. */
  readonly allowedElementIds?: readonly string[];
  /** 신규 생성 또는 View 전환 시 머리글/바닥글 기본 숨김 여부. */
  readonly hideHeaderFooterByDefault: boolean;
}

export const A4_DOCUMENT_VIEW: DocumentViewProfile = {
  id: "a4",
  label: "A4 문서",
  shortBadge: "A4",
  description: "인쇄 · 페이지 단위 일반 문서 (794px)",
  surface: { kind: "paged", width: 794 },
  genre: "document",
  layerSet: "document",
  unitKind: "page",
  unitLabel: "Pages",
  showPagesSection: true,
  showSectionsSection: false,
  allowedElementIds: ["table", "section", "resource"],
  hideHeaderFooterByDefault: false,
};

export const BLOG_DOCUMENT_VIEW: DocumentViewProfile = {
  id: "blog",
  label: "블로그",
  shortBadge: "BLOG",
  description: "이음매 없는 한 단 섹션 스크롤 글 (720px)",
  surface: { kind: "scroll", width: 720 },
  genre: "blog",
  layerSet: "blog",
  unitKind: "section",
  unitLabel: "Sections",
  showPagesSection: false,
  showSectionsSection: true,
  allowedElementIds: ["section", "table", "resource"],
  hideHeaderFooterByDefault: true,
};

export const WEB_DOCUMENT_VIEW: DocumentViewProfile = {
  id: "web",
  label: "웹 문서",
  shortBadge: "WEB",
  description: "와이드 섹션 기반 웹 아티클 · 랜딩 (960px)",
  surface: { kind: "scroll", width: 960 },
  genre: "web",
  layerSet: "blog",
  unitKind: "section",
  unitLabel: "Sections",
  showPagesSection: false,
  showSectionsSection: true,
  allowedElementIds: ["section", "table", "resource"],
  hideHeaderFooterByDefault: true,
};

const registry = new Map<string, DocumentViewProfile>([
  [A4_DOCUMENT_VIEW.id, A4_DOCUMENT_VIEW],
  [BLOG_DOCUMENT_VIEW.id, BLOG_DOCUMENT_VIEW],
  [WEB_DOCUMENT_VIEW.id, WEB_DOCUMENT_VIEW],
]);

export function listDocumentViews(): readonly DocumentViewProfile[] {
  return Array.from(registry.values());
}

export function getDocumentView(viewId: string | null | undefined): DocumentViewProfile | undefined {
  if (!viewId) return undefined;
  return registry.get(viewId);
}

export function registerDocumentView(profile: DocumentViewProfile): void {
  registry.set(profile.id, profile);
}

/**
 * `.vdoc` 문서에서 활성 View 프로필을 해석한다 (기존 `surface`/`genre` 단독 문서 100% 하위 호환).
 */
export function resolveDocumentView(
  doc: Pick<VDocDocument, "viewId" | "surface" | "genre"> | null | undefined
): DocumentViewProfile {
  if (doc?.viewId) {
    const exact = registry.get(doc.viewId);
    if (exact) return exact;
  }
  if (doc?.surface?.kind === "scroll" || doc?.genre === "blog") {
    return BLOG_DOCUMENT_VIEW;
  }
  return A4_DOCUMENT_VIEW;
}

/**
 * 내용 정본(`pages` · `blocks` · `slots` · `evidenceLinks` · `variables`)을 보존한 채
 * 문서의 활성 View(`a4` ↔ `blog` 등)와 지면 규격(`surface`, `genre`)을 일괄 동기화한다.
 */
export function applyDocumentView(doc: VDocDocument, viewId: DocumentViewId): VDocDocument {
  const profile = registry.get(viewId) ?? A4_DOCUMENT_VIEW;
  return {
    ...doc,
    viewId: profile.id,
    surface: { ...profile.surface },
    genre: profile.genre,
    pages: doc.pages.map((page) => ({
      ...page,
      unitKind: profile.unitKind,
      hideHeaderFooter: profile.surface.kind === "scroll" ? true : page.hideHeaderFooter,
    })),
  };
}
