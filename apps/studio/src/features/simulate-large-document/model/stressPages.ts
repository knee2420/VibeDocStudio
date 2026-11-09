import { createSectionPage, type VDocDocument } from "@vibe/vdoc-schema";

/** 대용량 문서 시뮬레이션 크기. 캔버스의 슬라이딩 윈도우(`WINDOW_CHUNK_PAGES`)보다 커야 의미가 있다. */
export const STRESS_PAGE_COUNT = 25;

/** 시뮬레이션 페이지가 붙어 있는지 (붙인 페이지는 `sim-page-` 로 시작한다). */
export function hasStressPages(doc: VDocDocument): boolean {
  return doc.pages.some((p) => p.pageId.startsWith("sim-page-"));
}

/** 개발용: 문서를 25쪽으로 늘리거나, 붙였던 시뮬레이션 페이지만 걷어낸다. */
export function toggleStressPages(doc: VDocDocument): VDocDocument {
  if (hasStressPages(doc)) {
    const keep = doc.pages.filter((p) => !p.pageId.startsWith("sim-page-"));
    const slots = Object.fromEntries(Object.entries(doc.slots).filter(([id]) => !id.startsWith("sim-page-")));
    return { ...doc, pages: keep, slots };
  }
  const pages = [...doc.pages];
  const slots = { ...doc.slots };
  for (let pageNumber = pages.length + 1; pageNumber <= STRESS_PAGE_COUNT; pageNumber++) {
    const section = createSectionPage({
      pageId: `sim-page-${pageNumber}`,
      pageNumber,
      pageLabel: `시뮬레이션 섹션 #${pageNumber}`,
      headerHtml: `<p>${doc.title} · 대용량 슬라이딩 윈도우 검증</p>`,
      footerHtml: `<p>Page ${pageNumber} / ${STRESS_PAGE_COUNT}</p>`,
      headingHtml: `<h3>Section ${pageNumber} · 대용량 조판 윈도우 청크 페이지 (${pageNumber}p)</h3>`,
      bodyHtml: `<p>대용량 문서에서도 슬라이딩 윈도우 안의 페이지만 DOM에 마운트됩니다.</p>`,
    });
    pages.push(section.page);
    Object.assign(slots, section.slots);
  }
  return { ...doc, pages, slots };
}
