import type { VDocDocument } from "@vibe/vdoc-schema";

/**
 * 문서의 원본 캡처 · 원문 주소는 문서 데이터(`doc.preview`)가 들고 온다.
 * 캡처가 없는 문서는 `null` 을 돌려주고, 화면은 다른 문서의 그림 대신 자리표시를 보여준다.
 */

/** `pageNumber` 는 1부터. 캡처보다 페이지가 많으면 마지막 캡처를 쓴다. */
export function getPageThumbnailUrl(doc: VDocDocument | undefined, pageNumber: number): string | null {
  const thumbnails = doc?.preview?.pageThumbnails;
  if (!thumbnails || thumbnails.length === 0) return null;
  const index = Math.min(Math.max(1, pageNumber), thumbnails.length) - 1;
  return thumbnails[index];
}

export type DocumentSourceView =
  | { kind: "pdf"; url: string }
  | { kind: "web"; url: string }
  | { kind: "none" };

/** 미리보기 패널 하단 뷰어가 띄울 원본. PDF 가 웹 원문보다 우선한다. */
export function getDocumentSource(doc: VDocDocument | undefined): DocumentSourceView {
  if (doc?.preview?.sourcePdfUrl) return { kind: "pdf", url: doc.preview.sourcePdfUrl };
  if (doc?.preview?.sourceWebUrl) return { kind: "web", url: doc.preview.sourceWebUrl };
  return { kind: "none" };
}

/** 페이지 ID 의 1부터 시작하는 번호 (문서에 없으면 1). */
export function getPageNumber(doc: VDocDocument | undefined, pageId: string | null | undefined): number {
  return doc?.pages.find((p) => p.pageId === pageId)?.pageNumber ?? 1;
}
