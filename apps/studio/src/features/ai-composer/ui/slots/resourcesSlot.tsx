import React, { useEffect, useMemo, useState } from "react";
import { FolderTree } from "lucide-react";
import {
  deckStageLabel,
  isDeckBusy,
  isDeckUsable,
  useKnowledgeDeckStore,
  type KnowledgeDeck,
} from "@/entities/knowledge-deck";
import { useResourceStore } from "@/entities/resource";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useAiScopeStore } from "@/entities/ai-scope";
import type { ResourceItem } from "@vibe/vdoc-schema";
import type { CheckItem, ContextSlot, SlotSection, SlotState, TriNode } from "./types";

function deckDetail(d: KnowledgeDeck): string {
  if (isDeckBusy(d)) return `${deckStageLabel(d.stage) || "색인 중"}`;
  if (!d.builtAt) return "재색인 필요";
  const parts: string[] = [];
  if (d.selectedSections?.length) parts.push(`${d.selectedSections.length}/${d.topics.length}섹션`);
  else parts.push(`${d.topics.length}섹션`);
  if (d.builtAt && Date.now() - Date.parse(d.builtAt) < 24 * 3600 * 1000) parts.push("New");
  return parts.join(" · ");
}

/** 노드의 모든 하위 자손 ID(폴더 및 파일)를 재귀 수집 */
function collectSubItemIds(item: ResourceItem): string[] {
  const ids: string[] = [];
  const traverse = (node: ResourceItem) => {
    ids.push(node.id);
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  };
  if (item.children) {
    for (const child of item.children) {
      traverse(child);
    }
  }
  return ids;
}

/** 모든 잎 노드 ID 수집 */
function collectAllLeafIds(items: ResourceItem[]): string[] {
  const ids: string[] = [];
  const traverse = (node: ResourceItem) => {
    if (!node.children || node.children.length === 0) {
      ids.push(node.id);
    } else {
      for (const child of node.children) {
        traverse(child);
      }
    }
  };
  for (const item of items) {
    traverse(item);
  }
  return ids;
}

interface NodeActiveCount {
  totalLeafCount: number;
  activeLeafCount: number;
}

/**
 * Composer 세션 활성 기준 잎 개수 집계.
 * 잎 노드의 활성 조건: RM에서 체크되어 있음(node.isChecked) AND Composer에서 제외되지 않음(!excludedSet.has(node.id))
 */
function computeActiveCounts(
  items: ResourceItem[],
  excludedSet: Set<string>
): Map<string, NodeActiveCount> {
  const map = new Map<string, NodeActiveCount>();

  const traverse = (node: ResourceItem): NodeActiveCount => {
    if (!node.children || node.children.length === 0) {
      const isLeafActive = Boolean(node.isChecked && !excludedSet.has(node.id));
      const info: NodeActiveCount = {
        totalLeafCount: 1,
        activeLeafCount: isLeafActive ? 1 : 0,
      };
      map.set(node.id, info);
      return info;
    }

    let total = 0;
    let active = 0;
    for (const child of node.children) {
      const cInfo = traverse(child);
      total += cInfo.totalLeafCount;
      active += cInfo.activeLeafCount;
    }
    const info: NodeActiveCount = { totalLeafCount: total, activeLeafCount: active };
    map.set(node.id, info);
    return info;
  };

  for (const item of items) {
    traverse(item);
  }
  return map;
}

export const resourcesSlot: ContextSlot = {
  id: "resources",
  label: "리소스",
  icon: <FolderTree className="w-3 h-3" />,
  tone: "violet",
  testIds: {
    switch: "settings-sources-switch",
    button: "settings-sources",
    menu: "settings-sources-menu",
  },
  useSlot(): SlotState {
    const projectId = useProjectStore(
      (s) => selectActiveProject(s)?.projectId ?? "default_project"
    );
    const items = useResourceStore((s) => s.items);
    const loadSession = useResourceStore((s) => s.loadSession);

    const decks = useKnowledgeDeckStore((s) => s.decks);
    const toggleDeckChoice = useKnowledgeDeckStore((s) => s.toggleDeckChoice);
    const selectDeckSections = useKnowledgeDeckStore((s) => s.selectDeckSections);

    const sourcesOn = useAiScopeStore((s) => s.sourcesOn);
    const setSourcesOn = useAiScopeStore((s) => s.setSourcesOn);

    // Composer 전용 리소스 제외 플래그 (RM 원장은 보존)
    const excludedSourceIds = useAiScopeStore((s) => s.excludedSourceIds);
    const setSourcesExcluded = useAiScopeStore((s) => s.setSourcesExcluded);
    const clearExcludedSources = useAiScopeStore((s) => s.clearExcludedSources);

    const excludedList = useMemo(
      () => excludedSourceIds[projectId] ?? [],
      [excludedSourceIds, projectId]
    );
    const excludedSet = useMemo(() => new Set(excludedList), [excludedList]);

    const [openDecks, setOpenDecks] = useState<Set<string>>(new Set());

    // RM 패널을 아직 안 열었어도 체크 상태 로드
    useEffect(() => {
      if (items.length === 0) void loadSession(projectId);
    }, [projectId, items.length, loadSession]);

    // Composer 세션 활성 기준 잎 집계
    const activeCounts = useMemo(
      () => computeActiveCounts(items, excludedSet),
      [items, excludedSet]
    );

    const { totalLeaves, totalActive } = useMemo(() => {
      let totalLeaves = 0;
      let totalActive = 0;
      for (const item of items) {
        const info = activeCounts.get(item.id);
        if (info) {
          totalLeaves += info.totalLeafCount;
          totalActive += info.activeLeafCount;
        }
      }
      return { totalLeaves, totalActive };
    }, [items, activeCounts]);

    const shownDecks = useMemo(
      () => decks.filter((d) => !!d.builtAt || isDeckBusy(d)),
      [decks]
    );
    const usableDecks = useMemo(() => decks.filter(isDeckUsable), [decks]);

    // 3상태 트리 노드 생성: Composer 제외 플래그 기반으로 독립 작동 (RM 원장 보존)
    const triTreeNodes: TriNode[] = useMemo(() => {
      const buildNode = (item: ResourceItem, depth: number): TriNode => {
        const isDir = Boolean(item.children && item.children.length > 0);

        if (isDir) {
          const count = activeCounts.get(item.id) ?? {
            totalLeafCount: 0,
            activeLeafCount: 0,
          };
          const state: "checked" | "unchecked" | "indeterminate" =
            count.activeLeafCount === 0
              ? "unchecked"
              : count.activeLeafCount === count.totalLeafCount
                ? "checked"
                : "indeterminate";

          return {
            id: item.id,
            title: item.title,
            state,
            meta: `${count.activeLeafCount}/${count.totalLeafCount}`,
            hint: item.pathOrUrl,
            testId: "settings-source-item",
            depth,
            isFolder: true,
            children: (item.children ?? []).map((child) => buildNode(child, depth + 1)),
            onClick: () => {
              // 폴더 클릭 시 하위 모든 항목을 일괄 exclude 설정/해제 (RM 원장은 보존!)
              const subIds = collectSubItemIds(item);
              const targets = [item.id, ...subIds];
              const shouldExclude = state === "checked";
              setSourcesExcluded(projectId, targets, shouldExclude);
            },
          };
        }

        // 파일(단일 문서) 노드
        const isActive = Boolean(item.isChecked && !excludedSet.has(item.id));
        const state: "checked" | "unchecked" = isActive ? "checked" : "unchecked";
        return {
          id: item.id,
          title: item.title,
          state,
          meta: item.extension || "",
          hint: item.pathOrUrl,
          testId: "settings-source-item",
          depth,
          isFolder: false,
          children: [],
          onClick: () => {
            // 개별 파일 클릭 시 해당 파일만 exclude 토글 (RM 원장은 보존!)
            const shouldExclude = isActive;
            setSourcesExcluded(projectId, [item.id], shouldExclude);
          },
        };
      };

      return items.map((root) => buildNode(root, 0));
    }, [items, activeCounts, excludedSet, projectId, setSourcesExcluded]);

    // 지식 덱 섹션 토글 로직
    const toggleSection = (d: KnowledgeDeck, sectionId: string, on: boolean) => {
      const all = d.topics.map((t) => t.id);
      const chosen = new Set(
        d.isChecked
          ? d.selectedSections?.length
            ? d.selectedSections
            : all
          : []
      );
      if (on) chosen.add(sectionId);
      else chosen.delete(sectionId);

      if (chosen.size === 0) {
        void toggleDeckChoice(projectId, d.id, false);
        void selectDeckSections(projectId, d.id, null);
        return;
      }
      if (!d.isChecked) void toggleDeckChoice(projectId, d.id, true);
      const ordered = all.filter((id) => chosen.has(id));
      void selectDeckSections(
        projectId,
        d.id,
        ordered.length === all.length ? null : ordered
      );
    };

    // 지식 덱 check-list 아이템들 구성 (아코디언 토픽 포함)
    const deckCheckItems = useMemo(() => {
      const itemsList: CheckItem[] = [];

      for (const d of shownDecks) {
        const on = d.isChecked && !!d.builtAt;
        const expanded = openDecks.has(d.id);
        const chosen = new Set(
          d.isChecked
            ? d.selectedSections?.length
              ? d.selectedSections
              : d.topics.map((t) => t.id)
            : []
        );

        itemsList.push({
          id: d.id,
          testId: "settings-deck-item",
          title: d.title,
          detail: deckDetail(d),
          checked: on,
          onClick: () => {
            if (d.builtAt) void toggleDeckChoice(projectId, d.id, !d.isChecked);
          },
          expand: d.topics.length
            ? {
                open: expanded,
                onToggle: () => {
                  setOpenDecks((prev) => {
                    const next = new Set(prev);
                    if (next.has(d.id)) next.delete(d.id);
                    else next.add(d.id);
                    return next;
                  });
                },
              }
            : undefined,
        });

        if (expanded) {
          for (const t of d.topics) {
            itemsList.push({
              id: `${d.id}:${t.id}`,
              testId: "settings-deck-section",
              title: t.title,
              detail: `${t.children?.length ?? 0}카드`,
              checked: chosen.has(t.id),
              indent: true,
              onClick: () => toggleSection(d, t.id, !chosen.has(t.id)),
            });
          }
        }
      }

      return itemsList;
    }, [shownDecks, openDecks, projectId, toggleDeckChoice]);

    // 요약 문법: {활성 잎}/{전체 잎}개 + (덱 있으면) · 덱 {n}
    const { primary, secondary, state } = useMemo(() => {
      if (!sourcesOn) return { primary: "꺼짐", state: "off" as const };
      if (totalLeaves === 0 && usableDecks.length === 0) {
        return { primary: "없음", state: "empty" as const };
      }

      const primaryText = `${totalActive}/${totalLeaves}개`;
      const secondaryText =
        usableDecks.length > 0 ? `덱 ${usableDecks.length}` : undefined;

      return {
        primary: primaryText,
        secondary: secondaryText,
        state: "on" as const,
      };
    }, [sourcesOn, totalActive, totalLeaves, usableDecks.length]);

    const tooltip = useMemo(() => {
      if (!sourcesOn) return "리소스 꺼짐 — AI가 리소스를 참고하지 않습니다 (클릭하여 켜기)";
      if (totalLeaves === 0 && usableDecks.length === 0) {
        return "선택된 리소스 없음 — 눌러서 원본/지식 덱 선택";
      }
      const parts: string[] = [];
      if (totalActive > 0) {
        parts.push(`활성 자료 ${totalActive}/${totalLeaves}개`);
      }
      if (usableDecks.length > 0) {
        parts.push(`덱 ${usableDecks.length}개`);
      }
      return `AI 참고 리소스: ${parts.join(" · ")}\n눌러서 변경`;
    }, [sourcesOn, totalActive, totalLeaves, usableDecks.length]);

    const sections: SlotSection[] = [
      {
        kind: "tri-tree",
        title: "원본 리소스 (RM)",
        nodes: triTreeNodes,
        emptyText: "RM 에서 원본을 체크하세요.",
      },
      {
        kind: "check-list",
        title: "지식 덱",
        items: deckCheckItems,
        emptyText: "색인된 지식 덱이 없습니다.",
      },
    ];

    return {
      on: sourcesOn,
      setOn: setSourcesOn,
      summary: {
        primary,
        secondary,
        state,
      },
      tooltip,
      header: {
        allOn:
          items.length > 0
            ? () => clearExcludedSources(projectId)
            : undefined,
        allOff:
          items.length > 0
            ? () => {
                const allIds = collectAllLeafIds(items);
                setSourcesExcluded(projectId, allIds, true);
              }
            : undefined,
      },
      sections,
      footer: {
        hint: "파일 하나하나는 RM 에서 · 이번 질문만은 @",
        manage: {
          label: "RM 열기 →",
          onClick: () => {
            useWorkspaceLayoutStore.getState().openRightPanel("resource-manager");
          },
        },
      },
    };
  },
};


