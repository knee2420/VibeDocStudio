import type { ContextProvider, ContextRef } from "@vibe/ai-kernel";
import type { VDocDocument } from "@vibe/vdoc-schema";

import { useAiScopeStore } from "@/entities/ai-scope";
import { activePinsOf, useReferenceStore } from "@/entities/reference-manager";
import { flattenResourceItems, getCheckedResourceItems, type ResourceItem, useResourceStore } from "@/entities/resource";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
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
import { activeReferences, boundReferences } from "./boundReferences";
import { SCOPE_CONTEXT_PROVIDER, scopeNow } from "./scopeAi";

const doc = (): VDocDocument | undefined => selectActiveDocument(useStudioDocumentStore.getState());

function matches(query: string, ...fields: string[]): boolean {
  if (!query) return true;
  return fields.some((f) => f.toLowerCase().includes(query));
}

/**
 * 경로에서 부모 폴더 2단계 경로 꼬리(예: `10.14 공유회 › A5`)를 추출합니다 (P2, §7.2).
 */
function formatPathTail(pathOrUrl?: string): string {
  if (!pathOrUrl) return "";
  const parts = pathOrUrl.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 1) return "";
  const dirParts = parts.slice(0, -1);
  if (dirParts.length === 0) return "";
  return dirParts.slice(-2).join(" › ");
}

function resourceItemRef(item: ResourceItem): ContextRef {
  const sectors = item.sectors ?? [];
  let content = "";
  if (sectors.length > 0) {
    content = sectors.map((s) => `[${s.title || "발췌"}]\n${s.textSnippet}`).join("\n\n");
  } else if (item.pathOrUrl) {
    content = `[원천 소스 파일]\n제목: ${item.title}\n경로: ${item.pathOrUrl}\n유형: ${item.extension || item.type}\n(원문은 read_file(Path=위 경로) 로 읽어라 — 리소스 작업 공간에 마운트돼 있을 때)`;
  }
  const tail = formatPathTail(item.pathOrUrl);
  const hint = sectors.length > 0
    ? `발췌 ${sectors.length}건${tail ? ` · ${tail}` : ""}`
    : tail || item.extension || "리소스";

  return {
    kind: "resource",
    id: item.id,
    label: item.title,
    content: content || `[원천 리소스] ${item.title}`,
    hint,
    access: "read",
    role: "reference",
  };
}

/** RM 이 자동으로 만드는 개요 발췌 — 원문 앞부분과 같으므로 마운트 목록에 다시 싣지 않는다. */
const AUTO_SECTOR_TITLES = new Set(["개요 스니펫"]);

function isFullyActive(node: ResourceItem, excludedSet?: Set<string>): boolean {
  if (!node.isChecked || (excludedSet && excludedSet.has(node.id))) return false;
  if (node.children && node.children.length > 0) {
    return node.children.every((c) => isFullyActive(c, excludedSet));
  }
  return true;
}

/**
 * 체크된 자료를 루트 폴더 단위 + 개별 파일 단위로 마운트한다 (본문 · 스니펫 없이 경로만).
 * Composer 전용 제외 플래그(excludedSet)가 주어지면 해당 항목은 마운트에서 제외된다.
 * 서버가 이것을 agy 에 읽기 전용으로 마운트하고 지도로 바꾸며, agy 가 vibefs 도구와 read_file 로 직접 돌아다닌다.
 */
function resourceMountRef(
  treeOrChecked: ResourceItem[],
  excludedSet?: Set<string>
): ContextRef {
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
    const isExcluded = Boolean(excludedSet?.has(node.id));

    if (underFullRoot) {
      if (node.children) {
        for (const child of node.children) visit(child, true);
      }
      return;
    }

    if (isDir) {
      if (!isExcluded && isFullyActive(node, excludedSet) && validPath) {
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
      if (node.isChecked && !isExcluded && validPath) {
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

  const allActiveLeaves = getCheckedResourceItems(treeOrChecked).filter(
    (it) => !it.children?.length && !excludedSet?.has(it.id)
  );
  const totalCount = allActiveLeaves.length || files.length;
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
  label: "레퍼런스",
  auto: true,
  current: () => {
    const project = selectActiveProject(useProjectStore.getState());
    const projectId = project?.projectId ?? "default_project";
    const refs = activeReferences(useAiScopeStore.getState().referencesOn, projectId);
    const { layers } = useReferenceStore.getState();
    const excludedPinSet = new Set(useAiScopeStore.getState().excludedReferencePinIds[projectId] ?? []);

    return refs.map((r) => {
      const pins = activePinsOf(r.refId).filter((p) => !excludedPinSet.has(p.pinId));
      const pinLines = pins.map((p) => {
        const where = p.page ? `p.${p.page}` : "";
        const layer = p.layer ? ` [${p.layer}]` : "";
        const note = p.note ? ` (메모: ${p.note})` : "";
        return `- ${p.anchor}${layer} ${p.label} ${where}${p.text ? ` — "${p.text}"` : ""}${note}`;
      });
      const report = layers[r.refId];
      const layerLines = (report?.layers ?? [])
        .filter((l) => !r.layersOff.includes(l.id))
        .map((l) => `- ${l.id} ${l.name}: ${Object.entries(l.values).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ") || "(정성 판단)"}`);
      const sections = [
        `[레퍼런스 ${r.number}] ${r.title} — ref:${r.refId} (${r.kind}${r.pageCount ? ` · ${r.pageCount}쪽` : ""})`,
        "남이 비슷한 문제를 풀며 내린 결정의 궤적이다. 층위별 패턴만 옮기고, 문장 · 고유명사 · 수치는 내 문서로 가져오지 않는다. 원문은 wb_read(ref:" +
          r.refId +
          "…) 로 읽는다.",
      ];
      if (r.layersOff.length) sections.push(`따르지 않을 층위: ${r.layersOff.join(", ")}`);
      if (layerLines.length) sections.push(`[층위 측정]\n${layerLines.join("\n")}`);
      if (pinLines.length) sections.push(`[사용자가 꽂은 핀]\n${pinLines.join("\n")}`);
      return {
        kind: "reference",
        id: `ref:${r.refId}`,
        label: `참조${r.number}: ${r.title}`,
        content: sections.join("\n"),
        hint: pins.length > 0 ? `핀 ${pins.length}건${r.layersOff.length ? ` · 층위 ${r.layersOff.length}개 끔` : ""}` : "패턴 참고",
        access: "read",
        role: "reference",
        meta: { entityId: r.refId, entityKind: "reference" },
      } satisfies ContextRef;
    });
  },
  search: (q) =>
    boundReferences()
      .filter((r) => matches(q, r.title))
      .map((r) => ({ ...referenceRef(r.refId, r.title), hint: `${r.kind}${r.pageCount ? ` · ${r.pageCount}쪽` : ""}${r.openInSplit ? " · 분할보기" : ""}` })),
};

export const RESOURCE_CONTEXT_PROVIDER: ContextProvider = {
  id: "resources",
  label: "리소스",
  auto: true,
  current: () => {
    const { sourcesOn, excludedSourceIds } = useAiScopeStore.getState();
    if (!sourcesOn) return [];
    const items = useResourceStore.getState().items;
    const project = selectActiveProject(useProjectStore.getState());
    const projectId = project?.projectId ?? "default_project";
    const excludedSet = new Set(excludedSourceIds[projectId] ?? []);

    const activeLeaves = getCheckedResourceItems(items).filter(
      (it) => !it.children?.length && !excludedSet.has(it.id)
    );
    if (activeLeaves.length === 0) return [];
    return [resourceMountRef(items, excludedSet)];
  },
  search: (q) => {
    const items = useResourceStore.getState().items;
    const all = flattenResourceItems(items).filter((it) => !it.children?.length);
    return all
      .filter((it) => matches(q, it.title, it.pathOrUrl || "", formatPathTail(it.pathOrUrl)))
      .slice(0, 8)
      .map(resourceItemRef);
  },
};

/**
 * 작업대 상태 — 서버가 agy 의 wb_* 도구(문서 · 레퍼런스 · 이력 읽기, 후보 제안)에 넘긴다.
 * 본문은 싣지 않는다 (서버가 저장된 문서를 직접 읽는다). 열린 문서 · 범위 · 선택 칸 · 켠 레퍼런스와 핀만.
 */
export const WORKBENCH_CONTEXT_PROVIDER: ContextProvider = {
  id: "workbench",
  label: "작업대",
  auto: true,
  current: () => {
    const d = doc();
    const store = useAiScopeStore.getState();
    const scope = d && store.scopeOn ? scopeNow() : null;
    const sel = useSlotSelectionStore.getState();
    const selection = [
      ...(sel.selectedSlotId ? [sel.selectedSlotId] : []),
      ...(sel.slotRange?.unitIds ?? []),
    ];
    const project = selectActiveProject(useProjectStore.getState());
    const projectId = project?.projectId ?? "default_project";
    const excludedPinSet = new Set(store.excludedReferencePinIds[projectId] ?? []);

    // 레퍼런스는 라이브러리 refId 로 보낸다 (서버가 extraction · 핀을 직접 읽는다).
    const references = activeReferences(store.referencesOn, projectId).map((r) => {
      const pins = activePinsOf(r.refId).filter((p) => !excludedPinSet.has(p.pinId));
      return {
        refId: r.refId,
        title: r.title,
        // 고른 핀 목록 (핀 제외 플래그 반영)
        pinIds: pins.map((p) => p.pinId),
        layers: Object.fromEntries(r.layersOff.map((id) => [id, false])),
      };
    });
    if (!d && references.length === 0) return [];
    const payload = {
      // 서버가 이 프로젝트의 확정 해석 카드(레퍼런스 합의)를 찾는 데 쓴다
      projectId,
      docId: d?.docId ?? null,
      scope: scope
        ? {
            mode: scope.mode,
            label: scope.label,
            pageIds: scope.pageIds ? [...scope.pageIds] : undefined,
            slotIds: scope.slotIds ? [...scope.slotIds] : undefined,
          }
        : { mode: "off" },
      selection: [...new Set(selection)],
      references,
    };
    return [
      {
        kind: "workbench",
        id: "wb:state",
        label: "작업대",
        content: JSON.stringify(payload),
        hint: `${d?.title ?? "문서 없음"} · 레퍼런스 ${references.length}`,
        access: "read",
        role: "reference",
      },
    ];
  },
};

export const WORKSPACE_CONTEXT_PROVIDERS: ContextProvider[] = [
  WORKBENCH_CONTEXT_PROVIDER,
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
