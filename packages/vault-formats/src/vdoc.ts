/** `.vdoc` 볼트 파일 형식 — 읽기 · 쓰기 · 기본 문서 · `vault://` 포인터 · 이름 변경 리라이트. */
import {
  A4_DOCUMENT_VIEW,
  BLOG_DOCUMENT_VIEW,
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

export const VAULT_URI_PREFIX = "vault://";

export function toVaultUri(path: string): string {
  return `${VAULT_URI_PREFIX}${normalizeVaultPath(path)}`;
}

export function fromVaultUri(url: string): string | null {
  if (!url.startsWith(VAULT_URI_PREFIX)) return null;
  return normalizeVaultPath(url.slice(VAULT_URI_PREFIX.length));
}

/**
 * 파일 또는 폴더가 `oldPath` → `newPath` 로 이동/이름변경될 때
 * 정확히 일치하는 URI 뿐 아니라 하위 경로(`vault://<oldPath>/...`)까지 일괄 재작성한다.
 */
export function rewriteVaultUriPrefix(uri: string, oldPath: string, newPath: string): string {
  const oldUri = toVaultUri(oldPath);
  const newUri = toVaultUri(newPath);
  if (uri === oldUri) return newUri;
  if (uri.startsWith(`${oldUri}/`)) {
    return `${newUri}${uri.slice(oldUri.length)}`;
  }
  return uri;
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

/** 양식 메타(viewId·surface·genre·schemaRef·styleRef·sourceRef·outlineRef)를 JSON 최상단에 두어 사람이 열어봐도 바로 보이게 한다. */
function withFormatFieldsFirst(doc: VDocDocument): VDocDocument {
  const {
    version,
    docId,
    title,
    viewId,
    surface,
    genre,
    schemaRef,
    styleRef,
    sourceRef,
    outlineRef,
    ...rest
  } = doc;
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
    ...(outlineRef ? { outlineRef } : {}),
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
        outlineRef: parsed.outlineRef,
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
 * Vault 내 파일·폴더가 이름변경/이동되었을 때 모든 `.vdoc` / `.vdoc.json` 파일 안의
 * `vault://<oldPath>` 및 하위 경로(`vault://<oldPath>/...`) 포인터를 자동 갱신하는 리라이트 훅.
 */
export const rewriteVDocPointersOnRename: VaultRenameRewriter = (
  vault: VaultPort,
  oldPath: string,
  newPath: string
) => {
  const oldUri = toVaultUri(oldPath);
  const updatedFiles: string[] = [];
  let totalReplacements = 0;

  for (const node of vault.listAll()) {
    if (node.kind !== "file" || !isVDocPath(node.path)) continue;
    const raw = vault.read(node.path);
    if (!raw.includes(oldUri)) continue;

    try {
      const doc = parseVDocJson(raw, node.stem);
      let fileReplacements = 0;
      const rewriteBlockPointers = (blk: LayoutBlock): LayoutBlock => {
        let nextBlk: LayoutBlock = blk;
        if (nextBlk.kind === "link-card") {
          const nextUrl = rewriteVaultUriPrefix(nextBlk.url, oldPath, newPath);
          if (nextUrl !== nextBlk.url) {
            fileReplacements += 1;
            const nextTargetPath = fromVaultUri(nextUrl) ?? newPath;
            nextBlk = {
              ...nextBlk,
              title: nextBlk.url === oldUri ? basename(nextTargetPath) : nextBlk.title,
              url: nextUrl,
              domain: `vault · ${nextTargetPath}`,
            };
          }
        }
        if (nextBlk.assetRef?.assetPath) {
          const nextAssetPath = rewriteVaultUriPrefix(nextBlk.assetRef.assetPath, oldPath, newPath);
          if (nextAssetPath !== nextBlk.assetRef.assetPath) {
            fileReplacements += 1;
            nextBlk = {
              ...nextBlk,
              assetRef: { ...nextBlk.assetRef, assetPath: nextAssetPath },
            };
          }
        }
        if (nextBlk.kind === "structured-table") {
          let rowChanged = false;
          const nextRows = nextBlk.rows.map((row) => {
            let cellChanged = false;
            const nextCells = row.cells.map((cell) => {
              if (!cell.blocks || cell.blocks.length === 0) return cell;
              const nextBlocks = cell.blocks.map(rewriteBlockPointers);
              if (nextBlocks.some((nb, i) => nb !== cell.blocks![i])) {
                cellChanged = true;
                return { ...cell, blocks: nextBlocks };
              }
              return cell;
            });
            if (cellChanged) {
              rowChanged = true;
              return { ...row, cells: nextCells };
            }
            return row;
          });
          if (rowChanged) {
            nextBlk = { ...nextBlk, rows: nextRows };
          }
        } else if (nextBlk.kind === "columns-grid" && Array.isArray(nextBlk.columns)) {
          let colChanged = false;
          const nextCols = nextBlk.columns.map((col) => {
            if (!col.blocks || col.blocks.length === 0) return col;
            const nextBlocks = col.blocks.map(rewriteBlockPointers);
            if (nextBlocks.some((nb, i) => nb !== col.blocks![i])) {
              colChanged = true;
              return { ...col, blocks: nextBlocks };
            }
            return col;
          });
          if (colChanged) {
            nextBlk = { ...nextBlk, columns: nextCols };
          }
        }
        return nextBlk;
      };
      const nextPages = doc.pages.map((page) => ({
        ...page,
        blocks: page.blocks.map(rewriteBlockPointers),
      }));

      let nextStyleRef = doc.styleRef;
      if (doc.styleRef?.packPath) {
        const rewritten = rewriteVaultUriPrefix(doc.styleRef.packPath, oldPath, newPath);
        if (rewritten !== doc.styleRef.packPath) {
          fileReplacements += 1;
          nextStyleRef = { ...doc.styleRef, packPath: rewritten };
        }
      }
      let nextSchemaRef = doc.schemaRef;
      if (doc.schemaRef?.registryPath) {
        const rewritten = rewriteVaultUriPrefix(doc.schemaRef.registryPath, oldPath, newPath);
        if (rewritten !== doc.schemaRef.registryPath) {
          fileReplacements += 1;
          nextSchemaRef = { ...doc.schemaRef, registryPath: rewritten };
        }
      }
      let nextSourceRef = doc.sourceRef;
      if (doc.sourceRef) {
        const rewritten = rewriteVaultUriPrefix(doc.sourceRef, oldPath, newPath);
        if (rewritten !== doc.sourceRef) {
          fileReplacements += 1;
          nextSourceRef = rewritten;
        }
      }
      let nextOutlineRef = doc.outlineRef;
      if (doc.outlineRef?.outlinePath) {
        const rewritten = rewriteVaultUriPrefix(doc.outlineRef.outlinePath, oldPath, newPath);
        if (rewritten !== doc.outlineRef.outlinePath) {
          fileReplacements += 1;
          nextOutlineRef = { ...doc.outlineRef, outlinePath: rewritten };
        }
      }

      if (fileReplacements > 0) {
        vault.write(
          node.path,
          serializeVDocJson({
            ...doc,
            styleRef: nextStyleRef,
            schemaRef: nextSchemaRef,
            sourceRef: nextSourceRef,
            outlineRef: nextOutlineRef,
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
