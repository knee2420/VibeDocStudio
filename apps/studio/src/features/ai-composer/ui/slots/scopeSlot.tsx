import React from "react";
import { Crosshair, Pin, RefreshCw, X } from "lucide-react";
import {
  DEFAULT_SCOPE,
  pageTitle,
  resolveScope,
  useAiScopeStore,
  type ScopeMode,
} from "@/entities/ai-scope";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import type { ContextSlot, SlotSection, SlotState } from "./types";

const MODES: { id: ScopeMode; label: string; hint: string; testId: string }[] = [
  { id: "selection", label: "선택만", hint: "캔버스에서 고른 칸 · 블록만 보고 고칩니다", testId: "scope-mode-selection" },
  { id: "page", label: "이 페이지", hint: "한 페이지만 보고 고칩니다", testId: "scope-mode-page" },
  { id: "document", label: "문서 전체", hint: "문서 전체 (빼 둔 페이지 제외)", testId: "scope-mode-document" },
];

export const scopeSlot: ContextSlot = {
  id: "scope",
  label: "범위",
  icon: <Crosshair className="w-3 h-3" />,
  tone: "blue",
  testIds: {
    switch: "settings-scope-switch",
    button: "settings-scope",
    menu: "settings-scope-menu",
  },
  useSlot(): SlotState {
    const doc = useStudioDocumentStore(selectActiveDocument);
    const docId = doc?.docId ?? "";
    const stored = useAiScopeStore((s) => s.settings[docId]);
    const setting = React.useMemo(
      () => ({ ...DEFAULT_SCOPE, ...(stored ?? {}) }),
      [stored]
    );
    const live = useAiScopeStore((s) => s.live);
    const scopeOn = useAiScopeStore((s) => s.scopeOn);
    const setScopeOn = useAiScopeStore((s) => s.setScopeOn);
    const {
      setMode,
      setFixed,
      pinTarget,
      pinPage,
      togglePageSelected,
      selectAllPages,
      clearSelectedPages,
      togglePageExcluded,
      clearPin,
    } = useAiScopeStore.getState();

    const liveHere = React.useMemo(() => {
      if (!doc) return { target: null, pageId: null };
      return live.docId === docId ? live : { target: null, pageId: null };
    }, [doc, live, docId]);

    const resolved = React.useMemo(() => {
      if (!doc) return { label: "문서 없음", target: null, pageId: null, pageIds: [] };
      return resolveScope(doc, setting, liveHere);
    }, [doc, setting, liveHere]);

    const currentTarget = setting.fixed
      ? setting.target
      : liveHere.target ?? setting.target;
    const currentPage =
      (setting.fixed ? setting.pageId : liveHere.pageId) ??
      setting.pageId ??
      doc?.pages[0]?.pageId ??
      "";

    const selectedPageIds = React.useMemo(() => {
      if (!doc) return [];
      if (setting.pageIds && setting.pageIds.length > 0) return setting.pageIds;
      if (setting.pageId) return [setting.pageId];
      if (!setting.fixed && liveHere.pageId) return [liveHere.pageId];
      return doc.pages[0]?.pageId ? [doc.pages[0].pageId] : [];
    }, [doc, setting.pageIds, setting.pageId, setting.fixed, liveHere.pageId]);

    const excluded = React.useMemo(() => {
      if (!doc) return [];
      return setting.excludedPageIds.filter((p) =>
        doc.pages.some((x) => x.pageId === p)
      );
    }, [doc, setting.excludedPageIds]);

    // 고정 중에 캔버스 초점이 달라지면 점선 제안
    let suggestion: { label: string; apply: () => void } | null = null;
    if (doc && setting.fixed) {
      if (
        setting.mode === "selection" &&
        liveHere.target &&
        liveHere.target.id !== setting.target?.id
      ) {
        const t = liveHere.target;
        suggestion = {
          label: `${pageTitle(doc, t.pageId)} ${t.label}`,
          apply: () => pinTarget(docId, t),
        };
      } else if (
        setting.mode === "page" &&
        liveHere.pageId &&
        liveHere.pageId !== setting.pageId
      ) {
        const p = liveHere.pageId;
        suggestion = { label: pageTitle(doc, p), apply: () => pinPage(docId, p) };
      }
    }

    const waitingForSelection = setting.mode === "selection" && !currentTarget;

    const modeDetail: Record<ScopeMode, string> = React.useMemo(() => {
      if (!doc) return { selection: "", page: "", document: "" };
      return {
        selection: currentTarget
          ? `${pageTitle(doc, currentTarget.pageId).split(" ")[0]} ${currentTarget.label}`
          : "칸을 고르세요",
        page:
          selectedPageIds.length > 1
            ? `${selectedPageIds.length}쪽 선택`
            : pageTitle(doc, selectedPageIds[0] || currentPage).split(" ")[0],
        document: `${doc.pages.length - excluded.length}/${doc.pages.length}쪽`,
      };
    }, [doc, currentTarget, selectedPageIds, currentPage, excluded.length]);

    // 요약 문법: {방식} · {대상} (P1, §6.3, §5.3)
    const { primary, secondary, state } = React.useMemo(() => {
      if (!scopeOn) return { primary: "꺼짐", state: "off" as const };
      if (waitingForSelection) return { primary: "선택 필요", state: "waiting" as const };
      if (!doc) return { primary: "없음", state: "empty" as const };

      if (setting.mode === "selection") {
        const pName = currentTarget ? pageTitle(doc, currentTarget.pageId).split(" ")[0] : "";
        const targetLabel = currentTarget ? `${pName} ${currentTarget.label}` : "";
        return {
          primary: "선택만",
          secondary: targetLabel || undefined,
          state: "on" as const,
        };
      }
      if (setting.mode === "page") {
        if (selectedPageIds.length > 1) {
          const labels = selectedPageIds
            .map((id) => pageTitle(doc, id).split(" ")[0])
            .join(", ");
          return {
            primary: "여러 쪽",
            secondary: `${labels} (${selectedPageIds.length}쪽)`,
            state: "on" as const,
          };
        }
        const pName = pageTitle(doc, selectedPageIds[0] || currentPage).split(" ")[0];
        return {
          primary: "이 페이지",
          secondary: pName,
          state: "on" as const,
        };
      }
      return {
        primary: "문서 전체",
        secondary: `${doc.pages.length - excluded.length}/${doc.pages.length}쪽`,
        state: "on" as const,
      };
    }, [scopeOn, waitingForSelection, doc, setting.mode, currentTarget, selectedPageIds, currentPage, excluded.length]);

    const tooltip = !scopeOn
      ? "범위 꺼짐 — 누르면 켭니다"
      : `${resolved.label}${setting.fixed ? " — 고정됨" : " — 캔버스 초점을 따라갑니다"}\n눌러서 범위 · 페이지 · 고정 바꾸기`;

    // 섹션 리스트 조립
    const sections: SlotSection[] = [];

    if (doc) {
      // 1. 방식 라디오
      sections.push({
        kind: "radio",
        title: "방식",
        value: setting.mode,
        options: MODES.map((m) => ({
          id: m.id,
          label: m.label,
          detail: modeDetail[m.id],
          hint: m.hint,
          testId: m.testId,
        })),
        onChange: (val) => setMode(docId, val as ScopeMode),
      });

      // 2. 모드별 서브 섹션
      if (setting.mode === "page") {
        sections.push({
          kind: "check-list",
          title: "페이지 — 여러 쪽 중복 선택 가능",
          headerAction: (
            <div className="flex items-center gap-1.5 text-[10px]">
              <button
                type="button"
                className="text-amber-700 hover:underline font-semibold cursor-pointer"
                onClick={() => selectAllPages(docId, doc.pages.map((p) => p.pageId))}
              >
                전체
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                className="text-slate-500 hover:underline cursor-pointer"
                onClick={() => clearSelectedPages(docId)}
              >
                초기화
              </button>
            </div>
          ),
          items: doc.pages.map((p) => ({
            id: p.pageId,
            title: pageTitle(doc, p.pageId),
            checked: selectedPageIds.includes(p.pageId),
            testId: "scope-page-item",
            onClick: () => togglePageSelected(docId, p.pageId),
          })),
        });
      } else if (setting.mode === "document") {
        sections.push({
          kind: "check-list",
          title: "페이지 — 끈 페이지는 AI 가 보지도 고치지도 않음",
          items: doc.pages.map((p) => ({
            id: p.pageId,
            title: pageTitle(doc, p.pageId),
            checked: !excluded.includes(p.pageId),
            testId: "scope-page-item",
            onClick: () => togglePageExcluded(docId, p.pageId),
          })),
        });
      } else if (setting.mode === "selection") {
        sections.push({
          kind: "note",
          testId: "scope-selection-detail",
          text: currentTarget
            ? `${pageTitle(doc, currentTarget.pageId)} · ${currentTarget.label} (${currentTarget.slotIds.length}칸)`
            : "아직 고른 칸이 없습니다",
        });
      }

      // 3. 고정 / 고정 해제 액션
      if (setting.mode !== "document") {
        sections.push({
          kind: "action",
          item: {
            id: "fix",
            testId: "scope-fix",
            icon: <Pin className="w-3.5 h-3.5 text-amber-500" />,
            title: "고정",
            detail: setting.fixed ? "초점을 따라가지 않음" : "지금은 캔버스 초점을 따라감",
            checked: setting.fixed,
            onClick: () => setFixed(docId, !setting.fixed),
          },
        });

        if (setting.fixed || setting.target) {
          sections.push({
            kind: "action",
            item: {
              id: "clear",
              testId: "scope-clear",
              icon: <X className="w-3.5 h-3.5 text-slate-400" />,
              title: "고정 해제 · 붙잡은 선택 지우기",
              radio: true,
              onClick: () => clearPin(docId),
            },
          });
        }
      }
    }

    // 초점 제안 배너
    const banner = suggestion ? (
      <div className="px-2.5 py-1.5 bg-amber-50 border-b border-amber-200">
        <button
          type="button"
          onClick={() => {
            suggestion?.apply();
          }}
          className="w-full flex items-center justify-between gap-1 text-[11px] font-semibold text-amber-900 hover:underline cursor-pointer"
        >
          <span className="flex items-center gap-1.5 truncate">
            <RefreshCw className="w-3 h-3 text-amber-600 shrink-0" />
            <span className="truncate">새 초점 적용: {suggestion.label}</span>
          </span>
          <span className="text-[10px] text-amber-700 shrink-0 font-bold">적용 →</span>
        </button>
      </div>
    ) : undefined;

    return {
      on: scopeOn,
      setOn: setScopeOn,
      summary: {
        primary,
        secondary,
        state,
        testId: "scope-current",
        prefixIcon: setting.fixed ? (
          <Pin className="w-2.5 h-2.5 shrink-0 text-amber-600" />
        ) : undefined,
        extraBadge:
          suggestion && scopeOn ? (
            <span
              role="button"
              data-testid="scope-suggestion"
              onClick={(e) => {
                e.stopPropagation();
                suggestion?.apply();
              }}
              className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded border border-dashed border-amber-400 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold shrink-0 cursor-pointer transition"
              title={`캔버스 초점이 바뀌었습니다 (${suggestion.label}) — 누르면 범위를 이것으로 바꿉니다`}
            >
              <RefreshCw className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate max-w-[48px]">
                {suggestion.label.split(" ")[0]}
              </span>
            </span>
          ) : undefined,
      },
      tooltip,
      banner,
      sections,
    };
  },
};
