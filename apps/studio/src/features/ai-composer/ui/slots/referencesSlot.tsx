import React from "react";
import { BookOpen, ExternalLink, FileText, MapPin, Type } from "lucide-react";
import { useAiScopeStore } from "@/entities/ai-scope";
import { useReferenceStore, type ReferencePin } from "@/entities/reference-manager";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import type { CheckItem, ContextSlot, SlotSection, SlotState } from "./types";

const EMPTY_LIST: string[] = [];

/** 레퍼런스 뷰어를 활성화하고 화면에 띄웁니다 (현재 워크스페이스 배치 상태를 준수하여 중복 렌더링 방지). */
const revealReference = (refId: string) => {
  useReferenceStore.getState().setActiveRefId(refId);
  const layout = useWorkspaceLayoutStore.getState();
  if (layout.refPlacement === "split") {
    useWorkspaceSessionStore.getState().openReference(refId);
    if (layout.refSplitCollapsed) {
      layout.setRefSplitCollapsed(false);
    }
  } else {
    layout.setRefViewerOpen(true);
    layout.setLeftSidebarOpen(true);
    layout.setLeftPanelTab("reference-manager");
  }
};

/** 특정 핀으로 뷰어를 이동시키고 포커스를 맞춥니다. */
const jumpToPin = (refId: string, pin: ReferencePin) => {
  revealReference(refId);
  useReferenceStore.getState().setFocusedPin(pin);
};

export const referencesSlot: ContextSlot = {
  id: "references",
  label: "레퍼런스",
  icon: <BookOpen className="w-3 h-3" />,
  tone: "amber",
  testIds: {
    switch: "row-switch-references",
    button: "references-setting-button",
    menu: "references-menu",
  },
  useSlot(): SlotState {
    const referencesOn = useAiScopeStore((s) => s.referencesOn);
    const setReferencesOn = useAiScopeStore((s) => s.setReferencesOn);

    // 프로젝트 식별자
    const activeProject = useProjectStore(selectActiveProject);
    const projectId = activeProject?.projectId ?? "default_project";

    // Composer 전용 독립 제외 플래그 (Reference Manager 원장은 절대 수정하지 않음)
    // getSnapshot 무한 루프 방지를 위해 스토어 맵 자체를 구독하고 useMemo + EMPTY_LIST 로 참조를 캐시합니다.
    const excludedRefMap = useAiScopeStore((s) => s.excludedReferenceIds);
    const excludedPinMap = useAiScopeStore((s) => s.excludedReferencePinIds);
    const excludedRefIds = React.useMemo(
      () => excludedRefMap[projectId] ?? EMPTY_LIST,
      [excludedRefMap, projectId]
    );
    const excludedPinIds = React.useMemo(
      () => excludedPinMap[projectId] ?? EMPTY_LIST,
      [excludedPinMap, projectId]
    );
    const toggleReferenceExcluded = useAiScopeStore((s) => s.toggleReferenceExcluded);
    const setReferencesExcluded = useAiScopeStore((s) => s.setReferencesExcluded);
    const clearExcludedReferences = useAiScopeStore((s) => s.clearExcludedReferences);
    const toggleReferencePinExcluded = useAiScopeStore((s) => s.toggleReferencePinExcluded);
    const clearExcludedReferencePins = useAiScopeStore((s) => s.clearExcludedReferencePins);

    // Reference Manager 가 관리하는 원천 데이터
    const bound = useReferenceStore((s) => s.bound);
    const pins = useReferenceStore((s) => s.pins);

    const setLeftPanelTab = useWorkspaceLayoutStore((s) => s.setLeftPanelTab);
    const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);

    // 각 레퍼런스별 핀 목록 수동 접기/펼치기 로컬 상태 (기본값: 펼쳐짐)
    const [collapsedRefIds, setCollapsedRefIds] = React.useState<Record<string, boolean>>({});

    // 작업 패널 상 활성 레퍼런스 (RM 에서 바인딩된 자원 중 Composer 에서 제외되지 않은 것)
    const active = React.useMemo(() => {
      return bound.filter((b) => b.enabled && !excludedRefIds.includes(b.refId));
    }, [bound, excludedRefIds]);

    // 작업 패널 상 활성 핀 수
    const activePinCount = React.useMemo(() => {
      const excludedPinSet = new Set(excludedPinIds);
      return active.reduce((acc, b) => {
        const list = pins[b.refId] ?? [];
        return acc + list.filter((p) => !excludedPinSet.has(p.pinId)).length;
      }, 0);
    }, [active, pins, excludedPinIds]);

    // 요약 문법: {켜진 수}/{연결 수}개 + (핀 있으면) · 핀 {활성 핀 수}
    const { primary, secondary, state } = React.useMemo(() => {
      if (!referencesOn) return { primary: "꺼짐", state: "off" as const };
      if (bound.length === 0) return { primary: "없음", state: "empty" as const };
      if (active.length === 0) return { primary: "모두 끔", state: "off" as const };

      const primaryText = `${active.length}/${bound.length}개`;
      const secondaryText = activePinCount > 0 ? `핀 ${activePinCount}개` : undefined;

      return {
        primary: primaryText,
        secondary: secondaryText,
        state: "on" as const,
      };
    }, [referencesOn, bound.length, active.length, activePinCount]);

    const tooltip = !referencesOn
      ? "레퍼런스 꺼짐 — AI 가 레퍼런스의 결정 방식을 참고하지 않습니다 (클릭하여 켜기)"
      : bound.length === 0
        ? "연결된 레퍼런스 없음"
        : `레퍼런스 ${active.length}건 사용 (연결 ${bound.length}건, 핀 ${activePinCount}개)`;

    // 레퍼런스 및 핀 트리 아이템 구성
    const items: CheckItem[] = [];

    bound.forEach((b, idx) => {
      const refPins = pins[b.refId] ?? [];
      const pinCount = refPins.length;
      const hasPins = pinCount > 0;
      const layersOff = Object.values(b.layers).filter((on) => !on).length;

      // 작업 패널 기준 활성화 여부 (RM 원장과 분리된 독립 플래그)
      const isRefChecked = b.enabled && !excludedRefIds.includes(b.refId);

      // 메타 표시 포맷팅
      const metaParts: string[] = [];
      if (b.item.status === "failed") {
        metaParts.push("가져오기 실패");
      } else {
        const kindLabel =
          b.item.kind === "pdf"
            ? "PDF"
            : b.item.kind === "web"
              ? "웹"
              : "이미지";
        metaParts.push(kindLabel);
        if (b.item.pageCount > 0) metaParts.push(`${b.item.pageCount}쪽`);
        if (pinCount > 0) metaParts.push(`핀 ${pinCount}개`);
        if (layersOff > 0) metaParts.push(`층위 ${layersOff}개 끔`);
      }

      // 선택된(체크된) 항목만 핀 펼침이 가능함 (미선택 시 하위 핀 완전 숨김)
      const isExpanded = isRefChecked && hasPins && !collapsedRefIds[b.refId];

      // 1) 레퍼런스 부모 행 (클릭 시 Composer 전용 제외 플래그만 토글, RM 원장 보존)
      items.push({
        id: b.refId,
        title: `참조${idx + 1}: ${b.item.title}`,
        detail: metaParts.join(" · "),
        checked: isRefChecked,
        onClick: () => toggleReferenceExcluded(projectId, b.refId),
        expand:
          isRefChecked && hasPins
            ? {
                open: isExpanded,
                onToggle: () =>
                  setCollapsedRefIds((prev) => ({
                    ...prev,
                    [b.refId]: !prev[b.refId],
                  })),
              }
            : undefined,
        extraAction: (
          <button
            type="button"
            title="레퍼런스 뷰어에서 열기"
            onClick={() => revealReference(b.refId)}
            className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-slate-200/50 cursor-pointer transition"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        ),
      });

      // 2) 선택된 항목에 대해서만 하위 핀과 페이지 표시!
      if (isRefChecked && isExpanded) {
        refPins.forEach((pin) => {
          const isPinChecked = !excludedPinIds.includes(pin.pinId);
          const pageNum = pin.page ?? 1;

          items.push({
            id: `pin-${pin.pinId}`,
            title: pin.label || `${pageNum}p 핀`,
            indent: true,
            icon:
              pin.kind === "text" ? (
                <Type className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              ) : (
                <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              ),
            detail: (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-50 border border-amber-200/80 text-amber-800 font-mono text-[10px] font-bold shrink-0"
                title={`${pageNum}페이지 핀`}
              >
                {pageNum}p{pin.layer ? ` · ${pin.layer}` : ""}
              </span>
            ),
            checked: isPinChecked,
            onCheck: () => toggleReferencePinExcluded(projectId, pin.pinId),
            onClick: () => jumpToPin(b.refId, pin),
            testId: `reference-pin-${pin.pinId}`,
            extraAction: (
              <button
                type="button"
                title={`${pageNum}페이지 핀 위치로 뷰어 이동`}
                onClick={() => jumpToPin(b.refId, pin)}
                className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-slate-200/50 cursor-pointer transition"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            ),
          });
        });
      }
    });

    const sections: SlotSection[] = [
      {
        kind: "check-list",
        title: "이 프로젝트에 연결된 레퍼런스",
        emptyText: "연결된 레퍼런스가 없습니다.",
        items,
      },
    ];

    return {
      on: referencesOn,
      setOn: setReferencesOn,
      summary: {
        primary,
        secondary,
        state,
      },
      tooltip,
      header: {
        allOn:
          bound.length > 0
            ? () => {
                clearExcludedReferences(projectId);
                clearExcludedReferencePins(projectId);
              }
            : undefined,
        allOff:
          bound.length > 0
            ? () => {
                setReferencesExcluded(
                  projectId,
                  bound.map((b) => b.refId),
                  true
                );
              }
            : undefined,
      },
      sections,
      footer: {
        hint: "층위 · 핀은 Reference Manager 에서",
        manage: {
          label: "Reference Manager 열기 →",
          onClick: () => {
            setLeftSidebarOpen(true);
            setLeftPanelTab("reference-manager");
          },
        },
      },
    };
  },
};
