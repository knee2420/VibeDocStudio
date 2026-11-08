import type { ContextProvider, ContextRef } from "@vibe/ai-kernel";
import type { VDocDocument } from "@vibe/vdoc-schema";

import { useAiScopeStore } from "@/entities/ai-scope";
import { useReferencePinStore } from "@/entities/reference-manager";
import { flattenResourceItems, getCheckedResourceItems, type ResourceItem, useResourceStore } from "@/entities/resource";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { htmlToPlain } from "@/shared/lib";

import {
  backdataRef,
  blockRef,
  docIndex,
  pageRef,
  referenceRef,
  resolveContextContent,
  slotRangeRef,
  slotRef,
  variableRef,
} from "./contextBuilders";
import { referenceDocs } from "./referenceDocs";
import { SCOPE_CONTEXT_PROVIDER } from "./scopeAi";

const doc = (): VDocDocument | undefined => selectActiveDocument(useStudioDocumentStore.getState());

function matches(query: string, ...fields: string[]): boolean {
  if (!query) return true;
  return fields.some((f) => f.toLowerCase().includes(query));
}

function resourceItemRef(item: ResourceItem): ContextRef {
  const sectors = item.sectors ?? [];
  let content = "";
  if (sectors.length > 0) {
    content = sectors.map((s) => `[${s.title || "발췌"}]\n${s.textSnippet}`).join("\n\n");
  } else if (item.pathOrUrl) {
    content = `[원천 소스 파일]\n제목: ${item.title}\n경로: ${item.pathOrUrl}\n유형: ${item.extension || item.type}\n(원문은 read_file(Path=위 경로) 로 읽어라 — 리소스 작업 공간에 마운트돼 있을 때)`;
  }
  return {
    kind: "resource",
    id: item.id,
    label: item.title,
    content: content || `[원천 리소스] ${item.title}`,
    hint: sectors.length > 0 ? `발췌 ${sectors.length}건` : item.extension || "리소스",
    access: "read",
    role: "reference",
  };
}

/** RM 이 자동으로 만드는 개요 발췌 — 원문 앞부분과 같으므로 마운트 목록에 다시 싣지 않는다. */
const AUTO_SECTOR_TITLES = new Set(["개요 스니펫"]);

function isFullyChecked(node: ResourceItem): boolean {
  if (!node.isChecked) return false;
  if (node.children && node.children.length > 0) {
    return node.children.every(isFullyChecked);
  }
  return true;
}

/**
 * 체크된 자료를 루트 폴더 단위 + 개별 파일 단위로 마운트한다 (본문 · 스니펫 없이 경로만).
 * 서버가 이것을 agy 에 읽기 전용으로 마운트하고 지도로 바꾸며, agy 가 vibefs 도구와 read_file 로 직접 돌아다닌다.
 */
function resourceMountRef(treeOrChecked: ResourceItem[]): ContextRef {
  const roots: Array<{ id: string; path: string; title: string; kind: "dir" }> = [];
  const files: Array<{ id: string; path: string; title: string; kind: "file"; sectors?: any[] }> = [];
  const idMap: Record<string, string> = {};

  function recordIds(list: ResourceItem[]) {
    for (const it of list) {
      if (it.pathOrUrl && !/^[a-z]+:\/\//i.test(it.pathOrUrl)) {
        idMap[it.pathOrUrl] = it.id;
      }
      if (it.children) recordIds(it.children);
    }
  }
  recordIds(treeOrChecked);

  function visit(node: ResourceItem, underFullRoot: boolean) {
    const isDir = Boolean(node.children && node.children.length > 0);
    const validPath = Boolean(node.pathOrUrl && !/^[a-z]+:\/\//i.test(node.pathOrUrl));

    if (underFullRoot) {
      if (node.children) {
        for (const child of node.children) visit(child, true);
      }
      return;
    }

    if (isDir) {
      if (isFullyChecked(node) && validPath) {
        roots.push({
          id: node.id,
          path: node.pathOrUrl!,
          title: node.title,
          kind: "dir",
        });
        if (node.children) {
          for (const child of node.children) visit(child, true);
        }
      } else {
        if (node.children) {
          for (const child of node.children) visit(child, false);
        }
      }
    } else {
      if (node.isChecked && validPath) {
        const sectors = (node.sectors ?? []).filter((s) => !AUTO_SECTOR_TITLES.has(s.title || s.label || ""));
        files.push({
          id: node.id,
          path: node.pathOrUrl!,
          title: node.title,
          kind: "file",
          ...(sectors.length ? { sectors: sectors.map((s) => ({ sectorId: s.sectorId, title: s.title || s.label, page: s.page })) } : {}),
        });
      }
    }
  }

  for (const top of treeOrChecked) {
    visit(top, false);
  }

  const allCheckedLeaves = getCheckedResourceItems(treeOrChecked).filter((it) => !it.children?.length);
  const totalCount = allCheckedLeaves.length || files.length;
  const items = [...roots, ...files];

  const labelParts = roots.map((r) => r.title);
  const label =
    labelParts.length > 0
      ? `${labelParts.slice(0, 2).join(" · ")}${labelParts.length > 2 ? ` 외 ${labelParts.length - 2}곳` : ""} (${totalCount})`
      : `리소스 작업 공간 ${totalCount}건`;

  return {
    kind: "resource-mount",
    id: "rm:checked-resources",
    label,
    content: JSON.stringify({ roots, files, idMap, items }),
    hint: `체크된 자료 ${totalCount}건 — AI 가 직접 찾아 읽음`,
    access: "read",
    role: "reference",
  };
}

export const REFERENCES_CONTEXT_PROVIDER: ContextProvider = {
  id: "references",
  label: "참조 문서",
  auto: true,
  current: () => {
    const { referencesOn, excludedRefDocIds = [] } = useAiScopeStore.getState();
    if (!referencesOn) return [];

    const allDocs = referenceDocs();
    const activeDocs = allDocs.filter((d) => !excludedRefDocIds.includes(d.docId));
    if (activeDocs.length === 0) return [];

    const { snippetsByDoc, checkedSnippetIds } = useReferencePinStore.getState();
    const checkedSet = new Set(checkedSnippetIds ?? []);

    return activeDocs.map((d) => {
      const docSnippets = snippetsByDoc[d.docId] ?? [];
      const activeSnippets = docSnippets.filter(
        (s) => checkedSet.size === 0 || checkedSet.has(s.id)
      );

      const snippetLines = activeSnippets.map((s) => {
        if (s.kind === "region") {
          const detail = s.excerpt ? ` - "${s.excerpt}"` : "";
          return `- [영역 핀 p.${s.page}] ${s.label}${detail}`;
        }
        if (s.kind === "text") {
          return `- [텍스트 p.${s.page ?? 1}] ${s.label}: "${s.text}"`;
        }
        return `- [메모] ${s.label}: "${s.comment}"`;
      });

      const hint = activeSnippets.length > 0
        ? `${d.pageCount ?? "?"}p · 핀 ${activeSnippets.length}건`
        : `${d.pageCount ?? "?"}페이지 · 규정/서식`;

      const contentSections = [
        `[참조 문서 표준·서식 가이드] ${d.title} (${d.projectTitle})`,
        `이 참조 문서는 본문 작성 시 준수해야 할 서식 템플릿 및 규범적 제약(Normative Standard)입니다.`,
      ];
      if (snippetLines.length > 0) {
        contentSections.push(`[지정 핀 및 핵심 조항·영역 발췌]:\n${snippetLines.join("\n")}`);
      }

      return {
        kind: "reference",
        id: `ref_doc_${d.docId}`,
        label: d.title,
        content: contentSections.join("\n"),
        hint,
        access: "read",
        role: "reference",
      };
    });
  },
  search: (q) =>
    referenceDocs()
      .filter((r) => matches(q, r.title))
      .map((r) => ({ ...referenceRef(r.docId, r.title), hint: `${r.pageCount ?? "?"}페이지${r.openInSplit ? " · 분할보기" : ""}` })),
};

export const RESOURCE_CONTEXT_PROVIDER: ContextProvider = {
  id: "resources",
  label: "리소스",
  auto: true,
  current: () => {
    const { sourcesOn } = useAiScopeStore.getState();
    if (!sourcesOn) return [];
    const items = useResourceStore.getState().items;
    const checked = getCheckedResourceItems(items).filter((it) => !it.children?.length);
    if (checked.length === 0) return [];
    return [resourceMountRef(items)];
  },
  search: (q) => {
    const items = useResourceStore.getState().items;
    const all = flattenResourceItems(items).filter((it) => !it.children?.length);
    return all
      .filter((it) => matches(q, it.title, it.pathOrUrl || ""))
      .slice(0, 8)
      .map(resourceItemRef);
  },
};

export const WORKSPACE_CONTEXT_PROVIDERS: ContextProvider[] = [
  REFERENCES_CONTEXT_PROVIDER,
  RESOURCE_CONTEXT_PROVIDER,
  {
    // 캔버스 선택은 자동으로 붙이지 않는다 — Composer 입력창에 "첨부 제안"으로만 보이고,
    // 사용자가 누르거나(제안 칩) Ctrl+L · 끌어 놓기 · 우클릭으로 첨부할 때만 들어간다.
    id: "selection",
    label: "현재 선택",
    suggest: true,
    current: () => {
      const d = doc();
      if (!d) return [];
      const { slotRange, selectedSlotId, selectedBlockId } = useSlotSelectionStore.getState();
      if (slotRange) return [slotRangeRef(d, slotRange.slotIds, slotRange.unitIds)];
      if (selectedSlotId && d.slots[selectedSlotId]) return [slotRef(d, d.slots[selectedSlotId])];
      const found = selectedBlockId ? docIndex(d).blocks.get(selectedBlockId) : undefined;
      return found ? [blockRef(d, found.page, found.block)] : [];
    },
  },
  // 예전 "열린 문서" 자동 첨부 자리 → 작업 범위 (설정바 · 이번 메시지 @선택). 범위가 좁으면 문서 제목도 싣지 않는다.
  SCOPE_CONTEXT_PROVIDER,
  {
    id: "slots",
    label: "슬롯",
    search: (q) => {
      const d = doc();
      if (!d) return [];
      return Object.values(d.slots)
        .filter((s) => s.role !== "boilerplate" && matches(q, s.label, s.slotId))
        .slice(0, 10)
        .map((s) => ({ ...slotRef(d, s), hint: htmlToPlain(s.content, 40) }));
    },
  },
  {
    id: "blocks",
    label: "블록",
    search: (q) => {
      const d = doc();
      if (!d) return [];
      const out: ContextRef[] = [];
      for (const { page, block } of docIndex(d).blocks.values()) {
        if (matches(q, block.title ?? "", block.blockId, block.kind)) out.push(blockRef(d, page, block));
        if (out.length >= 8) break;
      }
      return out;
    },
  },
  {
    id: "pages",
    label: "페이지",
    search: (q) => {
      const d = doc();
      if (!d) return [];
      return d.pages
        .filter((p) => matches(q, p.pageLabel ?? "", p.pageId))
        .slice(0, 6)
        .map((p) => pageRef(d, p));
    },
  },
  {
    id: "backdata",
    label: "백데이터",
    search: (q) => {
      const d = doc();
      if (!d) return [];
      return Object.values(d.backdata)
        .filter((c) => matches(q, c.sourceTitle, c.excerpt))
        .slice(0, 6)
        .map((c) => backdataRef(d, c.chunkId))
        .filter((r): r is ContextRef => Boolean(r));
    },
  },
  {
    id: "variables",
    label: "문서 변수",
    search: (q) => {
      const d = doc();
      if (!d) return [];
      return Object.keys(d.variables ?? {})
        .filter((name) => matches(q, name, d.variables[name] ?? ""))
        .slice(0, 6)
        .map((name) => variableRef(d, name));
    },
  },
  {
    // 끌어 놓기 · 우클릭 · Ctrl+L · @ 로 붙은 칩(슬롯 · 블록 · 페이지 · 노드 · 참조)의 본문을 보내기 직전에 채운다.
    id: "workspace-elements",
    label: "워크스페이스 요소",
    resolve: (ref) => {
      const content = resolveContextContent(ref);
      return content == null ? ref : { ...ref, content };
    },
  },
];
