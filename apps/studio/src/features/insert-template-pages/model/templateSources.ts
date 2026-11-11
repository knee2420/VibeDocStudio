import { createSectionPage, type VDocCatalogManifest, type VDocDocument } from "@vibe/vdoc-schema";

import { catalogApi } from "../api/catalogApi";

export type TemplateSourceKind = "blank" | "pdf" | "catalog" | "url";

export interface TemplateSourceDescriptor {
  kind: TemplateSourceKind;
  label: string;
  description: string;
}

/**
 * 페이지 삽입 템플릿 출처 레지스트리.
 * 장르/카테고리별 하드코딩 없이, `blank` · `pdf` · `catalog` · `url` 네 출처 모두
 * 최종적으로 `VDocDocument` 하나를 반환하여 공용 페이지 선택 · 복제 경로로 합쳐진다.
 */
export const TEMPLATE_SOURCE_REGISTRY: readonly TemplateSourceDescriptor[] = [
  {
    kind: "blank",
    label: "기본 페이지",
    description: "제목과 본문 슬롯이 있는 기본 페이지 1장을 바로 추가합니다.",
  },
  {
    kind: "pdf",
    label: "PDF 파일에서 가져오기",
    description: "PDF를 서식으로 변환해 필요한 페이지만 골라 넣습니다.",
  },
  {
    kind: "catalog",
    label: "카탈로그 · 섹터 템플릿에서",
    description: "등록된 공용 서식이나 섹터 템플릿을 골라 넣습니다.",
  },
  {
    kind: "url",
    label: "URL에서 가져오기",
    description: "웹사이트·블로그·칼럼 주소를 페이지별로 잘라 골라 넣습니다.",
  },
];

/** `blank` 출처: 가장 단순한 1페이지(제목+본문 슬롯) 템플릿 문서를 생성한다. */
export function buildBasicPageTemplate(pageLabel = "새 페이지"): VDocDocument {
  const { page, slots } = createSectionPage({
    pageId: "tmpl_basic_1",
    pageNumber: 1,
    pageLabel,
    headerHtml: "<p></p>",
    footerHtml: "<p></p>",
    headingHtml: "<p></p>",
    bodyHtml: "<p></p>",
  });
  return {
    version: "1.0.0",
    docId: "tmpl_basic_doc",
    title: pageLabel,
    status: "Draft",
    updatedAt: new Date().toISOString(),
    variables: {},
    pages: [page],
    slots,
    backdata: {},
  };
}

/** `pdf` 출처: `/api/catalog/scaffold` 로 PDF를 VDoc 템플릿 문서로 변환한다. */
export async function loadPdfTemplateDocument(file: File): Promise<VDocDocument> {
  const title = file.name.replace(/\.pdf$/i, "") || "PDF 임포트";
  const res = await catalogApi.scaffoldPdf(file, title, "balanced");
  return res.document;
}

/** `catalog` 출처: 등록된 카탈로그 목록 조회 후 category 별로 묶는다. */
export async function listCatalogTemplatesGrouped(): Promise<{
  categories: { category: string; items: VDocCatalogManifest[] }[];
}> {
  const items = await catalogApi.list();
  const byCat = new Map<string, VDocCatalogManifest[]>();
  for (const item of items) {
    const cat = item.category || "기타 서식";
    const list = byCat.get(cat) ?? [];
    list.push(item);
    byCat.set(cat, list);
  }
  return {
    categories: [...byCat.entries()].map(([category, list]) => ({ category, items: list })),
  };
}

/** `catalog` 출처: 특정 카탈로그 번들의 `VDocDocument` 를 불러온다. */
export async function loadCatalogTemplateDocument(catalogId: string): Promise<VDocDocument> {
  const bundle = await catalogApi.getBundle(catalogId);
  return bundle.document;
}
