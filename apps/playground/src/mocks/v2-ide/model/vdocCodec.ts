import {
  A4_DOCUMENT_VIEW,
  BLOG_DOCUMENT_VIEW,
  getBlockSlotIds,
  isBlockLocked,
  resolveDocumentView,
  type DocumentViewId,
  type LayoutBlock,
  type LinkCardBlockDef,
  type VDocDocument,
  type VDocPage,
  type VDocSlot,
} from "@vibe/vdoc-schema";
import {
  basename,
  matchesCompoundExtension,
  normalizeVaultPath,
  type VaultPort,
  type VaultRenameRewriter,
} from "@vibe/vault-core";
import type { DocumentStructureNode } from "@vibe/workspace-layout/core";

export const VAULT_URI_PREFIX = "vault://";

export function toVaultUri(path: string): string {
  return `${VAULT_URI_PREFIX}${normalizeVaultPath(path)}`;
}

export function fromVaultUri(url: string): string | null {
  if (!url.startsWith(VAULT_URI_PREFIX)) return null;
  return normalizeVaultPath(url.slice(VAULT_URI_PREFIX.length));
}

export function isVDocPath(path: string): boolean {
  return matchesCompoundExtension(path, "vdoc") || matchesCompoundExtension(path, "vdoc.json");
}

/**
 * File Explorer / Tab 아이콘 판별용 경량 View 스니펫 감지기 (전체 JSON 파싱 생략).
 */
export function detectVDocViewId(raw: string): "a4" | "blog" {
  // 키 순서나 본문 길이와 무관하게 판별한다. `viewId` 는 최상위에만 존재하는 키라 전체 문자열에서 찾아도 안전하다.
  const explicit = /"viewId"\s*:\s*"(a4|blog)"/.exec(raw);
  if (explicit) return explicit[1] as "a4" | "blog";
  if (/"surface"\s*:\s*\{[^{}]*"kind"\s*:\s*"scroll"/.test(raw)) return "blog";
  return "a4";
}

/** 양식 메타(viewId·surface·genre·schemaRef·styleRef·sourceRef)를 JSON 최상단에 두어 사람이 열어봐도 바로 보이게 한다. */
function withFormatFieldsFirst(doc: VDocDocument): VDocDocument {
  const { version, docId, title, viewId, surface, genre, schemaRef, styleRef, sourceRef, ...rest } = doc;
  return {
    version,
    docId,
    title,
    viewId,
    surface,
    genre,
    ...(schemaRef ? { schemaRef } : {}),
    ...(styleRef ? { styleRef } : {}),
    ...(sourceRef ? { sourceRef } : {}),
    ...rest,
  } as VDocDocument;
}

export function createDefaultVDoc(
  title: string,
  viewOrSurface: DocumentViewId | "paged" | "scroll" = "a4"
): VDocDocument {
  const isBlog = viewOrSurface === "blog" || viewOrSurface === "scroll";
  const profile = isBlog ? BLOG_DOCUMENT_VIEW : A4_DOCUMENT_VIEW;
  const now = new Date().toISOString();
  const uid = Date.now().toString(36);
  return {
    version: "1.0.0",
    docId: `vdoc-${uid}`,
    title,
    status: "Draft",
    updatedAt: now,
    variables: {},
    viewId: profile.id,
    surface: { ...profile.surface },
    genre: profile.genre,
    pages: [
      {
        pageId: `page-${uid}-1`,
        pageNumber: 1,
        pageLabel: isBlog ? "Article Flow" : "Page 1",
        headerSlotId: `slot-${uid}-hdr`,
        footerSlotId: `slot-${uid}-ftr`,
        hideHeaderFooter: true,
        blocks: [
          {
            blockId: `blk-${uid}-h1`,
            kind: "heading",
            title: isBlog ? "포스팅 제목" : "문서 제목",
            level: 1,
            slotId: `slot-${uid}-h1`,
          },
          {
            blockId: `blk-${uid}-body`,
            kind: "text",
            title: isBlog ? "도입부" : "개요",
            slotId: `slot-${uid}-body`,
          },
        ],
      },
    ],
    slots: {
      [`slot-${uid}-hdr`]: {
        slotId: `slot-${uid}-hdr`,
        label: "Header",
        role: "editable-slot",
        content: "",
        backDataRefs: [],
      },
      [`slot-${uid}-ftr`]: {
        slotId: `slot-${uid}-ftr`,
        label: "Footer",
        role: "editable-slot",
        content: "",
        backDataRefs: [],
      },
      [`slot-${uid}-h1`]: {
        slotId: `slot-${uid}-h1`,
        label: isBlog ? "포스팅 제목" : "제목",
        role: "editable-slot",
        content: `<h1>${title}</h1>`,
        backDataRefs: [],
      },
      [`slot-${uid}-body`]: {
        slotId: `slot-${uid}-body`,
        label: isBlog ? "도입부" : "개요",
        role: "editable-slot",
        content: isBlog
          ? "<p>이음매 없는 블로그 스크롤 캔버스입니다. 소제목 · 이미지 · 링크 카드를 자유롭게 이어 작성해 보세요.</p>"
          : "<p>2D 캔버스 위에서 직접 편집하거나, 좌측 File Explorer에서 파일을 중앙으로 드래그해 링크 카드를 배치해 보세요.</p>",
        backDataRefs: [],
      },
    },
    backdata: {},
  };
}

function sanitizeVDocPages(
  pages: VDocPage[],
  surface?: { kind: "paged" | "scroll"; width?: number }
): VDocPage[] {
  return pages.map((page) => ({
    ...page,
    ...(surface?.kind === "scroll" && !page.pageRect
      ? { pageRect: { width: surface.width ?? 720, height: 1123, unit: "px" as const } }
      : {}),
    blocks: (Array.isArray(page.blocks) ? page.blocks : []).map((rawBlock) => {
      const block = rawBlock as LayoutBlock & Record<string, unknown>;
      if (block.kind === "columns-grid") {
        const colCount = Array.isArray(block.columns)
          ? block.columns.length
          : Array.isArray(block.slotIds)
            ? block.slotIds.length
            : 2;
        if (!Array.isArray(block.widths) || block.widths.length === 0) {
          return {
            ...block,
            widths: Array.from({ length: Math.max(1, colCount) }, () => "1fr"),
          } as LayoutBlock;
        }
      }
      if (block.kind === "hero" && !block.titleSlotId && typeof block.slotId === "string") {
        return {
          ...block,
          titleSlotId: block.slotId,
        } as LayoutBlock;
      }
      return block;
    }),
  }));
}

export function parseVDocJson(raw: string, fallbackTitle: string): VDocDocument {
  try {
    const parsed = JSON.parse(raw) as Partial<VDocDocument>;
    if (Array.isArray(parsed.pages) && parsed.slots && typeof parsed.slots === "object") {
      const resolvedView = resolveDocumentView(parsed);
      return {
        version: "1.0.0",
        docId: parsed.docId ?? `vdoc-${Date.now().toString(36)}`,
        title: parsed.title ?? fallbackTitle,
        viewId: parsed.viewId ?? resolvedView.id,
        surface: parsed.surface ?? { ...resolvedView.surface },
        genre: parsed.genre ?? resolvedView.genre,
        schemaRef: parsed.schemaRef,
        styleRef: parsed.styleRef,
        sourceRef: parsed.sourceRef,
        status: parsed.status ?? "Draft",
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
        variables: parsed.variables ?? {},
        pages: sanitizeVDocPages(
          parsed.pages,
          parsed.styleRef ? undefined : (parsed.surface ?? resolvedView.surface)
        ),
        slots: parsed.slots,
        backdata: parsed.backdata ?? {},
        preview: parsed.preview,
        evidenceLinks: parsed.evidenceLinks,
        revision: parsed.revision,
        origin: parsed.origin,
        projectId: parsed.projectId,
      };
    }
  } catch {
    // Fallback cleanly to valid default VDoc
  }
  return createDefaultVDoc(fallbackTitle);
}

export function serializeVDocJson(doc: VDocDocument): string {
  return JSON.stringify(
    {
      ...withFormatFieldsFirst(doc),
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

/**
 * Vault 파일을 2D 캔버스에 끌어놓았을 때 삽입되는 포인터 기반 LinkCard 블록을 생성한다.
 * 본문 사본을 복사하지 않고 `url: "vault://<path>"` 포인터만 저장한다.
 */
export function createVaultLinkCardDraft(
  vaultPath: string,
  summaryText?: string
): { block: LinkCardBlockDef; slots: Record<string, VDocSlot> } {
  const uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const slotId = `slot-link-${uid}`;
  const label = basename(vaultPath);
  const block: LinkCardBlockDef = {
    blockId: `blk-link-${uid}`,
    kind: "link-card",
    title: label,
    slotId,
    url: toVaultUri(vaultPath),
    domain: `vault · ${vaultPath}`,
  };
  const slots: Record<string, VDocSlot> = {
    [slotId]: {
      slotId,
      label,
      role: "editable-slot",
      content: `<p><strong>${label}</strong></p><p>${summaryText || "Vault 문서 포인터 카드 (클릭 또는 우측에서 열기)"}</p>`,
      backDataRefs: [],
    },
  };
  return { block, slots };
}

/**
 * Codec -> Schema-agnostic DocumentStructureNode 프로젝션 (하단 Figma Pages & Elements 패널용).
 * 향후 `.vdoc` 스키마가 개편되어도 이 매퍼만 바꾸면 하단 Document Structure UI는 무수정 유지된다.
 */
export function projectVDocToStructure(
  doc: VDocDocument,
  activePageId: string,
  selectedBlockId: string | null,
  selectedSlotId: string | null,
  hiddenBlockIds: ReadonlySet<string>
): {
  pages: DocumentStructureNode[];
  elements: DocumentStructureNode[];
} {
  const view = resolveDocumentView(doc);
  const pages: DocumentStructureNode[] = doc.pages.map((page) => {
    const isSection = page.unitKind === "section" || view.unitKind === "section";
    const roleTag = isSection && page.sectionRole ? `${page.sectionRole} · ` : "";
    return {
      id: page.pageId,
      kind: isSection ? "section" : "page",
      label: page.pageLabel || (isSection ? `Section ${page.pageNumber}` : `Page ${page.pageNumber}`),
      badge: `${roleTag}${page.blocks.length}`,
      active: page.pageId === activePageId,
    };
  });

  const activePage: VDocPage | undefined =
    doc.pages.find((p) => p.pageId === activePageId) ?? doc.pages[0];
  if (!activePage) {
    return { pages, elements: [] };
  }

  const elements: DocumentStructureNode[] = activePage.blocks.map((block: LayoutBlock) => {
    const slotIds = getBlockSlotIds(block);
    const locked = isBlockLocked(block, doc.slots);
    const hidden = hiddenBlockIds.has(block.blockId);

    const slotChildren: DocumentStructureNode[] = slotIds.map((sid) => {
      const slot = doc.slots[sid];
      return {
        id: sid,
        kind: "slot",
        label: slot?.label || sid,
        active: sid === selectedSlotId,
        locked: Boolean(slot?.constraints?.locked),
      };
    });

    return {
      id: block.blockId,
      kind: "block",
      label: block.title || block.kind,
      badge: block.frame ? "2D" : block.kind,
      locked,
      hidden,
      active: block.blockId === selectedBlockId,
      children: slotChildren,
    };
  });

  return { pages, elements };
}

/**
 * Vault 내 파일이 이름변경/이동되었을 때 모든 `.vdoc` / `.vdoc.json` 파일 안의
 * `vault://<oldPath>` 포인터(link-card url, domain)를 자동 갱신하는 리라이트 훅.
 */
export const rewriteVDocPointersOnRename: VaultRenameRewriter = (
  vault: VaultPort,
  oldPath: string,
  newPath: string
) => {
  const oldUri = toVaultUri(oldPath);
  const newUri = toVaultUri(newPath);
  const updatedFiles: string[] = [];
  let totalReplacements = 0;

  for (const node of vault.listAll()) {
    if (node.kind !== "file" || !isVDocPath(node.path)) continue;
    const raw = vault.read(node.path);
    if (!raw.includes(oldUri)) continue;

    try {
      const doc = parseVDocJson(raw, node.stem);
      let fileReplacements = 0;
      const nextPages = doc.pages.map((page) => ({
        ...page,
        blocks: page.blocks.map((blk) => {
          if (blk.kind === "link-card" && blk.url === oldUri) {
            fileReplacements += 1;
            return {
              ...blk,
              title: basename(newPath),
              url: newUri,
              domain: `vault · ${newPath}`,
            };
          }
          return blk;
        }),
      }));

      let nextStyleRef = doc.styleRef;
      if (doc.styleRef?.packPath === oldUri) {
        fileReplacements += 1;
        nextStyleRef = { ...doc.styleRef, packPath: newUri };
      }
      let nextSchemaRef = doc.schemaRef;
      if (doc.schemaRef?.registryPath === oldUri) {
        fileReplacements += 1;
        nextSchemaRef = { ...doc.schemaRef, registryPath: newUri };
      }
      let nextSourceRef = doc.sourceRef;
      if (doc.sourceRef === oldUri) {
        fileReplacements += 1;
        nextSourceRef = newUri;
      }

      if (fileReplacements > 0) {
        vault.write(
          node.path,
          serializeVDocJson({
            ...doc,
            styleRef: nextStyleRef,
            schemaRef: nextSchemaRef,
            sourceRef: nextSourceRef,
            pages: nextPages,
          })
        );
        updatedFiles.push(node.path);
        totalReplacements += fileReplacements;
      }
    } catch {
      // Skip unparsable vdoc files safely
    }
  }

  return { updatedFiles, totalReplacements };
};

export function createSampleProposalVDoc(): VDocDocument {
  const now = "2026-11-19T09:00:00.000Z";
  return {
    version: "1.0.0",
    docId: "vdoc-system-proposal",
    title: "VibeDoc 2D 아키텍처 제안서",
    status: "Draft",
    updatedAt: now,
    variables: { project: "VibeDocStudio v2", version: "2.0" },
    surface: { kind: "paged", width: 794 },
    pages: [
      {
        pageId: "page-1",
        pageNumber: 1,
        pageLabel: "Page 1 · 개요 및 구조",
        headerSlotId: "slot-p1-hdr",
        footerSlotId: "slot-p1-ftr",
        hideHeaderFooter: true,
        blocks: [
          {
            blockId: "blk-p1-hero",
            kind: "hero",
            title: "표지 배너",
            titleSlotId: "slot-p1-hero",
            subtitleSlotId: "slot-p1-hero-sub",
            height: 150,
            align: "left",
          },
          {
            blockId: "blk-p1-grid",
            kind: "columns-grid",
            title: "핵심 2단 요약",
            widths: ["50%", "50%"],
            columns: [{ slotId: "slot-p1-col1" }, { slotId: "slot-p1-col2" }],
          },
          {
            blockId: "blk-p1-table",
            kind: "structured-table",
            title: "모듈별 구현 현황표",
            columnWidths: ["28%", "34%", "38%"],
            rows: [
              {
                rowId: "r-hdr",
                cells: [
                  { cellId: "c-h1", slotId: "slot-t-h1", isHeader: true },
                  { cellId: "c-h2", slotId: "slot-t-h2", isHeader: true },
                  { cellId: "c-h3", slotId: "slot-t-h3", isHeader: true },
                ],
              },
              {
                rowId: "r-1",
                cells: [
                  { cellId: "c-11", slotId: "slot-t-11" },
                  { cellId: "c-12", slotId: "slot-t-12" },
                  { cellId: "c-13", slotId: "slot-t-13" },
                ],
              },
              {
                rowId: "r-2",
                cells: [
                  { cellId: "c-21", slotId: "slot-t-21" },
                  { cellId: "c-22", slotId: "slot-t-22" },
                  { cellId: "c-23", slotId: "slot-t-23" },
                ],
              },
            ],
          },
          {
            blockId: "blk-p1-link",
            kind: "link-card",
            title: "01. Vault-Contract.md",
            slotId: "slot-p1-link",
            url: toVaultUri("01. Architecture/01. Vault-Contract.md"),
            domain: "vault · 01. Architecture/01. Vault-Contract.md",
          },
        ],
      },
      {
        pageId: "page-2",
        pageNumber: 2,
        pageLabel: "Page 2 · 피그마 2D 자유 배치",
        headerSlotId: "slot-p2-hdr",
        footerSlotId: "slot-p2-ftr",
        hideHeaderFooter: true,
        blocks: [
          {
            blockId: "blk-p2-fixed-1",
            kind: "callout-box",
            title: "자유 배치 카드 A",
            slotId: "slot-p2-c1",
            tone: "info",
            frame: { x: 44, y: 48, w: 330, h: 170 },
          },
          {
            blockId: "blk-p2-fixed-2",
            kind: "callout-box",
            title: "자유 배치 카드 B",
            slotId: "slot-p2-c2",
            tone: "warning",
            frame: { x: 404, y: 48, w: 340, h: 170 },
          },
          {
            blockId: "blk-p2-fixed-3",
            kind: "text",
            title: "2D 디렉팅 메모",
            slotId: "slot-p2-note",
            frame: { x: 44, y: 248, w: 700, h: 140 },
          },
        ],
      },
    ],
    slots: {
      "slot-p1-hdr": { slotId: "slot-p1-hdr", label: "Header", role: "editable-slot", content: "", backDataRefs: [] },
      "slot-p1-ftr": { slotId: "slot-p1-ftr", label: "Footer", role: "editable-slot", content: "", backDataRefs: [] },
      "slot-p2-hdr": { slotId: "slot-p2-hdr", label: "Header", role: "editable-slot", content: "", backDataRefs: [] },
      "slot-p2-ftr": { slotId: "slot-p2-ftr", label: "Footer", role: "editable-slot", content: "", backDataRefs: [] },
      "slot-p1-hero": {
        slotId: "slot-p1-hero",
        label: "표지 타이틀",
        role: "editable-slot",
        content: "<h1>VibeDoc 2D 아키텍처 제안서</h1>",
        backDataRefs: [],
      },
      "slot-p1-hero-sub": {
        slotId: "slot-p1-hero-sub",
        label: "표지 부제",
        role: "editable-slot",
        content:
          "<p>판다독 4층 페이지 + 피그마 2D 좌표/레이어 + 옵시디언 Vault &amp; 탭 통합 워크벤치</p>",
        backDataRefs: [],
      },
      "slot-p1-col1": {
        slotId: "slot-p1-col1",
        label: "좌측 요약",
        role: "editable-slot",
        content:
          "<h3>2D-First 디렉팅</h3><p>캔버스 위에서 블록을 선택해 바로 AI 디렉팅을 내리면, 새 마크다운·아웃라인 파일이 좌측 File Explorer에 즉시 생성됩니다.</p>",
        backDataRefs: [],
      },
      "slot-p1-col2": {
        slotId: "slot-p1-col2",
        label: "우측 요약",
        role: "editable-slot",
        content:
          "<h3>Figma Pages &amp; Elements</h3><p>좌측 하단 Document Structure에서 페이지 추가, 레이어 선택·호버 강조, 잠금(🔒), 숨김(👁)을 실시간 조작할 수 있습니다.</p>",
        backDataRefs: [],
      },
      "slot-t-h1": { slotId: "slot-t-h1", label: "영역", role: "editable-slot", content: "<p><strong>영역</strong></p>", backDataRefs: [] },
      "slot-t-h2": { slotId: "slot-t-h2", label: "패키지", role: "editable-slot", content: "<p><strong>Headless 패키지</strong></p>", backDataRefs: [] },
      "slot-t-h3": { slotId: "slot-t-h3", label: "역할", role: "editable-slot", content: "<p><strong>역할 및 확장 포인트</strong></p>", backDataRefs: [] },
      "slot-t-11": { slotId: "slot-t-11", label: "Vault", role: "editable-slot", content: "<p>Vault &amp; Cache</p>", backDataRefs: [] },
      "slot-t-12": { slotId: "slot-t-12", label: "패키지1", role: "editable-slot", content: "<p>@vibe/vault-core</p>", backDataRefs: [] },
      "slot-t-13": { slotId: "slot-t-13", label: "역할1", role: "editable-slot", content: "<p>단일 정본 · 위키링크 &amp; .vdoc 포인터 자동 갱신</p>", backDataRefs: [] },
      "slot-t-21": { slotId: "slot-t-21", label: "2D 캔버스", role: "editable-slot", content: "<p>2D Editor</p>", backDataRefs: [] },
      "slot-t-22": { slotId: "slot-t-22", label: "패키지2", role: "editable-slot", content: "<p>@vibe/slot-canvas</p>", backDataRefs: [] },
      "slot-t-23": { slotId: "slot-t-23", label: "역할2", role: "editable-slot", content: "<p>A4/Scroll · 피그마 2D 좌표 · Tiptap 슬롯</p>", backDataRefs: [] },
      "slot-p1-link": {
        slotId: "slot-p1-link",
        label: "연결 문서",
        role: "editable-slot",
        content:
          "<p><strong>01. Vault-Contract.md</strong></p><p>파일 이름을 바꾸면 이 카드의 vault:// 포인터도 자동 업데이트됩니다. 좌측 탐색기에서 다른 파일을 중앙으로 드래그해 보세요.</p>",
        backDataRefs: [],
      },
      "slot-p2-c1": {
        slotId: "slot-p2-c1",
        label: "카드 A",
        role: "editable-slot",
        content: "<h3>피그마 자유 좌표 (Fixed Frame)</h3><p>상단 ⋮⋮ 핸들을 드래그해 자유롭게 이동하고, 모서리를 끌어 크기를 조절해 보세요.</p>",
        backDataRefs: [],
      },
      "slot-p2-c2": {
        slotId: "slot-p2-c2",
        label: "카드 B",
        role: "editable-slot",
        content: "<h3>정렬 스냅 가이드</h3><p>다른 블록과 좌·우·상·하·중앙선이 맞으면 피그마식 빨간 정렬 가이드선이 자동 스냅됩니다.</p>",
        backDataRefs: [],
      },
      "slot-p2-note": {
        slotId: "slot-p2-note",
        label: "디렉팅 메모",
        role: "editable-slot",
        content:
          "<p>이 블록을 선택한 뒤 하단 플로팅 바의 <strong>AI Direct</strong>를 눌러 새 <code>.md</code> 또는 <code>.outline</code> 파일을 추출해 보세요. 좌측 탐색기에 <code>AI</code> 배지와 함께 자동 반영됩니다.</p>",
        backDataRefs: [],
      },
    },
    backdata: {},
  };
}
