import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  OutlineEditorProvider,
  OutlineHeader,
  OutlineTree,
  createOutlineEditorStore,
  type OutlineHost,
} from "@vibe/outliner/editor";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ClipboardList,
  Compass,
  FilePlus2,
  FileText,
  FolderKanban,
  Globe,
  ListTree,
  MousePointerClick,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Sparkles,
  Table2,
  Tag,
} from "lucide-react";
import {
  AGUI_A2UI_CANDIDATE_GROUPS,
  buildInitialSubagents,
  buildInitialSuggestions,
  buildSeedWireEvents,
  createTimestamp,
  type A2uiCandidateCard,
  type A2uiCandidateGroup,
  type AguiSurfacePlacement,
  type AguiToneFilter,
  type AguiWireEvent,
  type CandidateApplyAction,
  type SubagentRunState,
  type WysiwygSuggestion,
} from "../model/aguiDemoModel";
import {
  hasBlockTag,
  hasDocumentTag,
  hasPageTag,
  resolveNodesForLinkedDoc,
  stripLinkTags,
  toggleNodeLinkTag,
} from "../model/documentLinkParser";
import { PLAYGROUND_PRESET_LIST } from "../model/presets";
import type { PlaygroundNode, PlaygroundPresetId } from "../model/types";
import { findPlaygroundNode, usePlaygroundStore } from "../model/usePlaygroundStore";
import { AguiA2uiDemoPanel } from "./AguiA2uiDemoPanel";
import { FormAssetHubSidebar } from "./FormAssetHubSidebar";
import { UnifiedSheetViewport } from "./UnifiedSheetViewport";
import { WysiwygSuggestionOverlay } from "./WysiwygSuggestionOverlay";

function unescapeInlineMarkdownPrefix(text: string): string {
  return text
    .replace(/^(\s*)(\d+)\\\.(\s)/, "$1$2.$3")
    .replace(/^(\s*)\\([-*+])(\s)/, "$1$2$3")
    .replace(/^(\s*)\\(#{1,6})(\s)/, "$1$2$3")
    .replace(/^(\s*)\\(>+)/, "$1$2")
    .replace(/^(\s*)\\([-*+]\s*\[[ xX]\])/, "$1$2");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderLinkTagHtml(rawSafeText: string, containerEl: HTMLElement): void {
  const plain = unescapeInlineMarkdownPrefix(rawSafeText);
  const encodedRaw = encodeURIComponent(plain.trim());

  const html = escapeHtml(plain).replace(
    /(&lt;&lt;(document|page|section|title|list|table|view|callout|quote|block)(?::([^&\n]+?))?&gt;&gt;)/gi,
    (_full, rawDirective: string, rawKind: string) => {
      const lowerKind = rawKind.toLowerCase();
      const kind =
        lowerKind === "document"
          ? "document"
          : lowerKind === "page"
            ? "page"
            : "block";
      const cls =
        kind === "document"
          ? "internal-link inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold no-underline hover:bg-indigo-100"
          : kind === "page"
            ? "internal-link inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold no-underline hover:bg-emerald-100"
            : lowerKind === "section"
              ? "internal-link inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-semibold no-underline hover:bg-slate-200"
              : lowerKind === "table"
                ? "internal-link inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 text-[11px] font-semibold no-underline hover:bg-violet-100"
                : lowerKind === "view"
                  ? "internal-link inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-300 text-[11px] font-semibold no-underline hover:bg-cyan-100"
                  : lowerKind === "list"
                    ? "internal-link inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-semibold no-underline hover:bg-sky-100"
                    : "internal-link inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold no-underline hover:bg-amber-100";
      return `<a href="#" data-href="doclink:${kind}:${encodedRaw}" class="${cls}">${rawDirective}</a>`;
    }
  );
  containerEl.innerHTML = html;
}

function findNodeIdByLinkText(
  nodes: readonly PlaygroundNode[],
  kind: "document" | "page" | "block",
  rawText: string
): string | null {
  const matchesKind = (text: string) =>
    kind === "document"
      ? hasDocumentTag(text)
      : kind === "page"
        ? hasPageTag(text)
        : hasBlockTag(text);
  const cleanedTarget = stripLinkTags(rawText);
  for (const node of nodes) {
    if (matchesKind(node.text) && node.text.trim() === rawText) {
      return node.id;
    }
    if (node.children.length > 0) {
      const childMatch = findNodeIdByLinkText(node.children, kind, rawText);
      if (childMatch) return childMatch;
    }
  }
  if (cleanedTarget) {
    for (const node of nodes) {
      if (matchesKind(node.text) && stripLinkTags(node.text) === cleanedTarget) {
        return node.id;
      }
      if (node.children.length > 0) {
        const childMatch = findNodeIdByLinkText(node.children, kind, cleanedTarget);
        if (childMatch) return childMatch;
      }
    }
  }
  return null;
}

const OutlineNavigatorList: React.FC<{
  nodes: readonly PlaygroundNode[];
  depth?: number;
  onFocusNode: (nodeId: string) => void;
}> = ({ nodes, depth = 0, onFocusNode }) => {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            onClick={() => onFocusNode(node.id)}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            className="w-full flex items-center gap-2 py-1.5 pr-2 rounded-md text-left hover:bg-slate-100 transition cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
            <span className="text-xs text-slate-700 truncate">{stripLinkTags(node.text)}</span>
          </button>
          {node.children.length > 0 ? (
            <OutlineNavigatorList
              nodes={node.children}
              depth={depth + 1}
              onFocusNode={onFocusNode}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
};

function renderPresetIcon(id: PlaygroundPresetId): React.ReactNode {
  if (id === "blank") return <FilePlus2 className="w-3.5 h-3.5 shrink-0" />;
  if (id === "workshop-request") return <ClipboardList className="w-3.5 h-3.5 shrink-0" />;
  if (id === "rfp-complex") return <Table2 className="w-3.5 h-3.5 shrink-0" />;
  if (id === "a4-report") return <FileText className="w-3.5 h-3.5 shrink-0" />;
  if (id === "agui-protocol-demo") return <Sparkles className="w-3.5 h-3.5 shrink-0 text-indigo-400" />;
  return <Globe className="w-3.5 h-3.5 shrink-0" />;
}

interface HeaderDropdownOption<T extends string> {
  value: T;
  label: string;
  badge?: string;
  meta?: string;
  icon?: React.ReactNode;
}

interface HeaderDropdownProps<T extends string> {
  value: T | undefined;
  options: readonly HeaderDropdownOption<T>[];
  onChange: (value: T) => void;
  tone?: "dark" | "indigo";
  triggerMaxWidthClass?: string;
  menuWidthClass?: string;
  ariaLabel: string;
}

function HeaderDropdown<T extends string>({
  value,
  options,
  onChange,
  tone = "dark",
  triggerMaxWidthClass = "max-w-[300px]",
  menuWidthClass = "min-w-[260px] max-w-[420px]",
  ariaLabel,
}: HeaderDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const active = options.find((o) => o.value === value) ?? options[0];
  if (!active) return null;

  const isIndigo = tone === "indigo";
  const triggerCls = isIndigo
    ? "bg-indigo-50/80 text-indigo-950 border-indigo-200 hover:bg-indigo-100/80"
    : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800";
  const badgeCls = isIndigo
    ? "bg-indigo-600 text-white"
    : "bg-slate-700 text-slate-100";
  const metaCls = isIndigo ? "text-indigo-600" : "text-slate-300";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition cursor-pointer shadow-2xs ${triggerMaxWidthClass} ${triggerCls}`}
        title={active.label}
      >
        {active.icon}
        {active.badge ? (
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${badgeCls}`}>
            {active.badge}
          </span>
        ) : null}
        <span className="truncate">{active.label}</span>
        {active.meta ? (
          <span className={`text-[10px] font-medium shrink-0 ${metaCls}`}>{active.meta}</span>
        ) : null}
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute left-0 top-full mt-1.5 z-50 rounded-xl border border-slate-200 bg-white shadow-xl p-1 max-h-[340px] overflow-y-auto ${menuWidthClass}`}
        >
          {options.map((opt) => {
            const selected = opt.value === active.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setOpen(false);
                  if (opt.value !== value) {
                    onChange(opt.value);
                  }
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition cursor-pointer ${selected
                  ? isIndigo
                    ? "bg-indigo-50 text-indigo-900 font-semibold"
                    : "bg-slate-100 text-slate-900 font-semibold"
                  : "text-slate-700 hover:bg-slate-50"
                  }`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  {opt.icon}
                  {opt.badge ? (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${selected
                        ? isIndigo
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-900 text-white"
                        : "bg-slate-200 text-slate-700"
                        }`}
                    >
                      {opt.badge}
                    </span>
                  ) : null}
                  <span className="truncate" title={opt.label}>
                    {opt.label}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {opt.meta ? (
                    <span className="text-[10px] text-slate-400">{opt.meta}</span>
                  ) : null}
                  <Check
                    className={`w-3.5 h-3.5 ${selected
                      ? isIndigo
                        ? "text-indigo-600 opacity-100"
                        : "text-slate-900 opacity-100"
                      : "opacity-0"
                      }`}
                  />
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export const PlaygroundPage: React.FC = () => {
  const [hubOpen, setHubOpen] = useState(true);
  const [rightPanelMode, setRightPanelMode] = useState<"hub" | "agui-lab">("hub");
  const [surfacePlacement, setSurfacePlacement] = useState<AguiSurfacePlacement>("drawer");
  const [toneFilter, setToneFilter] = useState<AguiToneFilter>("all");
  const [activeCandidateGroupId, setActiveCandidateGroupId] = useState<string>("cand-hwp-title");
  const [selectedCandidateByGroup, setSelectedCandidateByGroup] = useState<Record<string, string>>({
    "cand-hwp-title": "hwp-title-underline",
    "cand-hwp-table": "hwp-tbl-grouped",
    "cand-blog-kpi": "blog-kpi-cards",
    "cand-blog-hero": "blog-hdr-hero",
    "cand-webform-theme": "wf-theme-google",
    "cand-rfp-spec": "rfp-view-spec",
  });
  const [suggestions, setSuggestions] = useState<WysiwygSuggestion[]>(() => buildInitialSuggestions());
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<"running" | "interrupted" | "success">("interrupted");
  const [subagents, setSubagents] = useState<SubagentRunState[]>(() => buildInitialSubagents());
  const [wireEvents, setWireEvents] = useState<AguiWireEvent[]>(() =>
    buildSeedWireEvents("agui-doc-hwp")
  );
  const scanTimersRef = useRef<number[]>([]);

  const presetId = usePlaygroundStore((s) => s.presetId);
  const spec = usePlaygroundStore((s) => s.spec);
  const mode = usePlaygroundStore((s) => s.mode);
  const slotOverrides = usePlaygroundStore((s) => s.slotOverrides);
  const outlinerRoots = usePlaygroundStore((s) => s.outlinerRoots);
  const linkExtraction = usePlaygroundStore((s) => s.linkExtraction);
  const activeLinkedDocId = usePlaygroundStore((s) => s.activeLinkedDocId);
  const activeLinkedPageId = usePlaygroundStore((s) => s.activeLinkedPageId);
  const activeAssetId = usePlaygroundStore((s) => s.activeAssetId);
  const blockVariants = usePlaygroundStore((s) => s.blockVariants);
  const viewCache = usePlaygroundStore((s) => s.viewCache);
  const dirtyViewBlocks = usePlaygroundStore((s) => s.dirtyViewBlocks);
  const aiCompileStatus = usePlaygroundStore((s) => s.aiCompileStatus);
  const webFormTheme = usePlaygroundStore((s) => s.webFormTheme);
  const selectedBlockId = usePlaygroundStore((s) => s.selectedBlockId);
  const compiled = usePlaygroundStore((s) => s.compiled);
  const selectedSlotId = usePlaygroundStore((s) => s.selectedSlotId);
  const focusRequest = usePlaygroundStore((s) => s.focusRequest);

  const selectPreset = usePlaygroundStore((s) => s.selectPreset);
  const reset = usePlaygroundStore((s) => s.reset);
  const setMode = usePlaygroundStore((s) => s.setMode);
  const selectBlock = usePlaygroundStore((s) => s.selectBlock);
  const setBlockVariant = usePlaygroundStore((s) => s.setBlockVariant);
  const changeNodeLayout = usePlaygroundStore((s) => s.changeNodeLayout);
  const applyTableViewToCache = usePlaygroundStore((s) => s.applyTableViewToCache);
  const revertTableViewToCache = usePlaygroundStore((s) => s.revertTableViewToCache);
  const runTableAiCompile = usePlaygroundStore((s) => s.runTableAiCompile);
  const cancelAiCompile = usePlaygroundStore((s) => s.cancelAiCompile);
  const setWebFormTheme = usePlaygroundStore((s) => s.setWebFormTheme);
  const setSelectedSlotId = usePlaygroundStore((s) => s.setSelectedSlotId);
  const focusNodeInSheet = usePlaygroundStore((s) => s.focusNodeInSheet);
  const selectLinkedDocument = usePlaygroundStore((s) => s.selectLinkedDocument);
  const selectLinkedPage = usePlaygroundStore((s) => s.selectLinkedPage);
  const selectAsset = usePlaygroundStore((s) => s.selectAsset);
  const setTitle = usePlaygroundStore((s) => s.setTitle);
  const updateSlotContent = usePlaygroundStore((s) => s.updateSlotContent);
  const runTableCommand = usePlaygroundStore((s) => s.runTableCommand);

  const editorStore = useMemo(
    () =>
      createOutlineEditorStore({
        getRoots: () => usePlaygroundStore.getState().outlinerRoots,
        commitRoots: (nextRoots) => usePlaygroundStore.getState().commitOutlinerRoots(nextRoots),
        setDefaultView: () => { },
      }),
    []
  );

  const outlineHost = useMemo<OutlineHost>(
    () => ({
      confirm: async (msg) => window.confirm(msg),
      copyNodeLink: async () => { },
      exportText: () => { },
      getPortalRoot: () => document.body,
      renderMarkdown: (safeText, containerEl) => {
        renderLinkTagHtml(safeText, containerEl);
      },
      openLink: (link) => {
        if (!link.startsWith("doclink:")) return;
        const rest = link.slice("doclink:".length);
        const sepIdx = rest.indexOf(":");
        if (sepIdx <= 0) return;
        const kind = rest.slice(0, sepIdx) as "document" | "page" | "block";
        const cleanedTarget = decodeURIComponent(rest.slice(sepIdx + 1));
        const store = usePlaygroundStore.getState();
        const nodeId = findNodeIdByLinkText(store.spec.nodes, kind, cleanedTarget);
        if (!nodeId) return;
        if (kind === "block") {
          store.focusNodeInSheet(nodeId);
          setHubOpen(true);
        } else {
          store.focusLinkedTagNode(nodeId, kind);
        }
      },
      nodeMenuItems: (nodeId) => {
        const node = findPlaygroundNode(usePlaygroundStore.getState().spec.nodes, nodeId);
        if (!node) return [];
        const hasDoc = hasDocumentTag(node.text);
        const hasPg = hasPageTag(node.text);
        return [
          {
            label: hasDoc ? "<<document>> 해제" : "<<document:hwp>> 연계",
            run: () => {
              editorStore.getState().updateText(nodeId, toggleNodeLinkTag(node.text, "document", "hwp"));
            },
          },
          {
            label: hasPg ? "<<page>> 해제" : "<<page>> 페이지 구분",
            run: () => {
              editorStore.getState().updateText(nodeId, toggleNodeLinkTag(node.text, "page"));
            },
          },
          {
            label: "<<section>> 컨테이너 토글",
            run: () => {
              editorStore.getState().updateText(nodeId, toggleNodeLinkTag(node.text, "section"));
            },
          },
          {
            label: "<<title>> 컨테이너 토글",
            run: () => {
              editorStore.getState().updateText(nodeId, toggleNodeLinkTag(node.text, "title"));
            },
          },
          {
            label: "<<list>> 컨테이너 토글",
            run: () => {
              editorStore.getState().updateText(nodeId, toggleNodeLinkTag(node.text, "list"));
            },
          },
          {
            label: "<<table>> 컨테이너 토글",
            run: () => {
              editorStore.getState().updateText(nodeId, toggleNodeLinkTag(node.text, "table"));
            },
          },
        ];
      },
    }),
    [editorStore]
  );

  const handleSelectPreset = (nextId: PlaygroundPresetId) => {
    selectPreset(nextId);
    editorStore.getState().resetView();
    if (nextId === "agui-protocol-demo") {
      setHubOpen(true);
      setRightPanelMode("agui-lab");
      setSuggestions(buildInitialSuggestions());
      setActiveSuggestionId(null);
      setRunStatus("interrupted");
      setSubagents(buildInitialSubagents());
      setWireEvents(buildSeedWireEvents("agui-doc-hwp"));
    } else {
      setRightPanelMode("hub");
    }
  };

  const handleReset = () => {
    reset();
    editorStore.getState().resetView();
    if (presetId === "agui-protocol-demo") {
      setSuggestions(buildInitialSuggestions());
      setActiveSuggestionId(null);
      setRunStatus("interrupted");
      setSubagents(buildInitialSubagents());
      setWireEvents(buildSeedWireEvents(activeLinkedDoc?.nodeId ?? "agui-doc-hwp"));
    }
  };

  const editedCustomCount = useMemo(
    () =>
      Object.values(spec.customForms).reduce(
        (acc, form) => acc + Object.values(form.slots).filter((s) => s.isEdited).length,
        0
      ),
    [spec.customForms]
  );

  const editedCount = Object.keys(slotOverrides).length + editedCustomCount;
  const isEditing = mode === "wysiwyg";

  const activeLinkedDoc = useMemo(
    () =>
      linkExtraction.documents.find((d) => d.id === activeLinkedDocId) ??
      linkExtraction.documents[0],
    [linkExtraction.documents, activeLinkedDocId]
  );

  const scopedNavNodes = useMemo(
    () => resolveNodesForLinkedDoc(spec, activeLinkedDoc),
    [spec, activeLinkedDoc]
  );

  const isAguiDemoActive = presetId === "agui-protocol-demo" && rightPanelMode === "agui-lab";
  const activeDocNodeId = activeLinkedDoc?.nodeId ?? "agui-doc-hwp";

  const docCandidateGroups = useMemo(
    () => AGUI_A2UI_CANDIDATE_GROUPS.filter((g) => g.docNodeId === activeDocNodeId),
    [activeDocNodeId]
  );

  const activeCandidateGroup = useMemo(
    () =>
      docCandidateGroups.find((g) => g.id === activeCandidateGroupId) ??
      docCandidateGroups[0] ??
      null,
    [docCandidateGroups, activeCandidateGroupId]
  );

  const docSuggestions = useMemo(
    () => suggestions.filter((s) => s.docNodeId === activeDocNodeId),
    [suggestions, activeDocNodeId]
  );

  useEffect(() => {
    return () => {
      for (const timer of scanTimersRef.current) window.clearTimeout(timer);
    };
  }, []);

  const appendWireEvent = (
    event: Omit<AguiWireEvent, "seq" | "timestamp">
  ) => {
    setWireEvents((prev) => [
      ...prev.slice(-39),
      {
        ...event,
        seq: (prev[prev.length - 1]?.seq ?? 0) + 1,
        timestamp: createTimestamp(),
      },
    ]);
  };

  const applyCandidateAction = (action: CandidateApplyAction) => {
    if (action.kind === "block-variant") {
      setBlockVariant(action.blockId, action.variantId);
      return;
    }
    if (action.kind === "node-layout") {
      changeNodeLayout(action.nodeId, action.layoutChoice);
      return;
    }
    setWebFormTheme(action.theme);
  };

  const handleSelectLinkedDocWithWire = (docId: string) => {
    selectLinkedDocument(docId);
    const nextDoc = linkExtraction.documents.find((d) => d.id === docId);
    if (presetId === "agui-protocol-demo" && nextDoc) {
      setActiveSuggestionId(null);
      const nextGroups = AGUI_A2UI_CANDIDATE_GROUPS.filter((g) => g.docNodeId === nextDoc.nodeId);
      if (nextGroups[0]) setActiveCandidateGroupId(nextGroups[0].id);
      appendWireEvent({
        protocol: "A2UI 1.0",
        type: "createSurface",
        subagentRunId: "sub_asset_recommender",
        summary: `포맷 전환(${nextDoc.docFormat ?? "DOC"}) → ${nextGroups[0]?.surfaceId ?? "surface"}`,
        payload: {
          docNodeId: nextDoc.nodeId,
          docFormat: nextDoc.docFormat,
          surfaceId: nextGroups[0]?.surfaceId ?? null,
          placement: surfacePlacement,
        },
      });
    }
  };

  const handleChangeSurfacePlacement = (placement: AguiSurfacePlacement) => {
    setSurfacePlacement(placement);
    appendWireEvent({
      protocol: "A2UI 1.0",
      type: "updateComponents",
      summary: `Surface 위치 전환 → ${placement}`,
      payload: {
        surfaceId: activeCandidateGroup?.surfaceId ?? "surface://asset-picker",
        placement,
        note: "동일한 A2UI 데이터 모델의 렌더링 표면(Surface)만 교체",
      },
    });
  };

  const handleChangeToneFilter = (tone: AguiToneFilter) => {
    setToneFilter(tone);
    appendWireEvent({
      protocol: "A2UI 1.0",
      type: "updateDataModel",
      summary: `후보 필터 갱신 (@path: "/filter" → "${tone}")`,
      payload: {
        surfaceId: activeCandidateGroup?.surfaceId ?? "surface://asset-picker",
        "@path": "/filter",
        value: tone,
      },
    });
  };

  const handleSelectCandidate = (group: A2uiCandidateGroup, card: A2uiCandidateCard) => {
    setActiveCandidateGroupId(group.id);
    setSelectedCandidateByGroup((prev) => ({ ...prev, [group.id]: card.id }));
    applyCandidateAction(card.action);
    appendWireEvent({
      protocol: "A2UI 1.0",
      type: "callAgentFunction",
      summary: `에셋 라이브 미리보기: ${card.title}`,
      payload: {
        surfaceId: group.surfaceId,
        "@call": "previewAssetCandidate",
        candidateId: card.id,
        action: card.action,
      },
    });
  };

  const handleSelectVariant = (suggestionId: string, variantId: "A" | "B") => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === suggestionId ? { ...s, selectedVariantId: variantId } : s))
    );
    appendWireEvent({
      protocol: "AG-UI 1.0",
      type: "STATE_DELTA",
      summary: `제안(${suggestionId}) 비교안 전환 → ${variantId}안`,
      payload: {
        delta: [{ op: "replace", path: `/suggestions/${suggestionId}/selectedVariantId`, value: variantId }],
      },
    });
  };

  const resolveLiveSlotId = (sug: WysiwygSuggestion): string => {
    const cur = usePlaygroundStore.getState().compiled;
    if (cur.doc.slots[sug.targetSlotId]) return sug.targetSlotId;
    return cur.nodeSlotIds[sug.targetNodeId]?.[0] ?? sug.targetSlotId;
  };

  const handleAcceptSuggestion = (suggestionId: string) => {
    const sug = suggestions.find((s) => s.id === suggestionId);
    if (!sug) return;
    const activeVariant =
      sug.variants.find((v) => v.id === sug.selectedVariantId) ?? sug.variants[0];
    const resolvedSlotId = resolveLiveSlotId(sug);
    const curSlotHtml =
      sug.originalHtmlSnapshot ??
      usePlaygroundStore.getState().compiled.doc.slots[resolvedSlotId]?.content ??
      `<p>${sug.beforeText}</p>`;

    if (activeVariant.layoutAction) {
      applyCandidateAction(activeVariant.layoutAction);
    }
    const postLayoutSlotId = resolveLiveSlotId(sug);
    updateSlotContent(postLayoutSlotId, activeVariant.afterHtml);

    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId
          ? { ...s, status: "accepted", originalHtmlSnapshot: curSlotHtml }
          : s
      )
    );
    appendWireEvent({
      protocol: "AG-UI 1.0",
      type: "STATE_DELTA",
      summary: `위지윅 수정 적용 (${sug.targetLabel} · ${activeVariant.id}안)`,
      payload: {
        delta: [
          { op: "replace", path: `/suggestions/${suggestionId}/status`, value: "accepted" },
          { op: "replace", path: `/slots/${postLayoutSlotId}`, value: activeVariant.afterText },
        ],
      },
    });
  };

  const handleRejectSuggestion = (suggestionId: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === suggestionId ? { ...s, status: "rejected" } : s))
    );
    appendWireEvent({
      protocol: "AG-UI 1.0",
      type: "STATE_DELTA",
      summary: `위지윅 수정 거절 (${suggestionId})`,
      payload: {
        delta: [{ op: "replace", path: `/suggestions/${suggestionId}/status`, value: "rejected" }],
      },
    });
  };

  const handleRevertSuggestion = (suggestionId: string) => {
    const sug = suggestions.find((s) => s.id === suggestionId);
    if (!sug) return;
    if (sug.status === "accepted" && sug.originalHtmlSnapshot) {
      const resolvedSlotId = resolveLiveSlotId(sug);
      updateSlotContent(resolvedSlotId, sug.originalHtmlSnapshot);
    }
    setSuggestions((prev) =>
      prev.map((s) => (s.id === suggestionId ? { ...s, status: "pending" } : s))
    );
    appendWireEvent({
      protocol: "AG-UI 1.0",
      type: "STATE_DELTA",
      summary: `제안 상태 복원 (${suggestionId} → pending)`,
      payload: {
        delta: [{ op: "replace", path: `/suggestions/${suggestionId}/status`, value: "pending" }],
      },
    });
  };

  const handleAcceptAllSuggestions = () => {
    const pending = docSuggestions.filter((s) => s.status === "pending");
    for (const sug of pending) {
      handleAcceptSuggestion(sug.id);
    }
    handleResumeDecision(`위지윅 수정 제안 ${pending.length}건 일괄 승인`);
  };

  const handleResumeDecision = (reason: string) => {
    setRunStatus("success");
    appendWireEvent({
      protocol: "AG-UI 1.0",
      type: "RUN_RESUME",
      summary: `사용자 결정 전달 → ${reason}`,
      payload: {
        runId: "run_agui_demo_01",
        resumeInput: { decision: reason, docNodeId: activeDocNodeId },
      },
    });
    appendWireEvent({
      protocol: "AG-UI 1.0",
      type: "RUN_FINISHED",
      summary: "에이전트 턴 정상 종료 (outcome: success)",
      payload: {
        runId: "run_agui_demo_01",
        outcome: "success",
      },
    });
  };

  const handleRunParallelScan = () => {
    for (const timer of scanTimersRef.current) window.clearTimeout(timer);
    scanTimersRef.current = [];
    setRunStatus("running");
    setSubagents([
      {
        subagentRunId: "sub_asset_recommender",
        name: "asset-recommender",
        role: "A2UI 에셋 후보 생성",
        status: "running",
        progress: 20,
        activityText: "포맷 스키마 분석 중...",
      },
      {
        subagentRunId: "sub_wysiwyg_reviewer",
        name: "wysiwyg-reviewer",
        role: "AG-UI 위지윅 수정 제안",
        status: "running",
        progress: 15,
        activityText: "슬롯 문구·수치 스캔 중...",
      },
    ]);

    appendWireEvent({
      protocol: "AG-UI 1.0",
      type: "RUN_STARTED",
      summary: `병렬 스캔 시작 (${activeDocNodeId})`,
      payload: { runId: `run_${Date.now()}`, docNodeId: activeDocNodeId, parallelWorkers: 2 },
    });
    appendWireEvent({
      protocol: "AG-UI 1.0",
      type: "SUBAGENT_STARTED",
      subagentRunId: "sub_asset_recommender",
      summary: "병렬 워커 #1 실행 (A2UI 에셋 추천)",
      payload: { subagentRunId: "sub_asset_recommender", parallel: true },
    });
    appendWireEvent({
      protocol: "AG-UI 1.0",
      type: "SUBAGENT_STARTED",
      subagentRunId: "sub_wysiwyg_reviewer",
      summary: "병렬 워커 #2 실행 (AG-UI 위지윅 검토)",
      payload: { subagentRunId: "sub_wysiwyg_reviewer", parallel: true },
    });

    const t1 = window.setTimeout(() => {
      setSubagents((prev) =>
        prev.map((s) =>
          s.subagentRunId === "sub_asset_recommender"
            ? { ...s, progress: 70, activityText: "카탈로그 후보 랭킹 산출 중..." }
            : { ...s, progress: 60, activityText: "A/B안 Unified Diff 생성 중..." }
        )
      );
      appendWireEvent({
        protocol: "AG-UI 1.0",
        type: "ACTIVITY_DELTA",
        subagentRunId: "sub_asset_recommender",
        summary: "병렬 진행률 업데이트 (70% / 60%)",
        payload: { delta: [{ op: "replace", path: "/progress", value: 70 }] },
      });
    }, 360);

    const t2 = window.setTimeout(() => {
      setSubagents([
        {
          subagentRunId: "sub_asset_recommender",
          name: "asset-recommender",
          role: "A2UI 에셋 후보 생성",
          status: "finished",
          progress: 100,
          activityText: "후보 생성 완료",
        },
        {
          subagentRunId: "sub_wysiwyg_reviewer",
          name: "wysiwyg-reviewer",
          role: "AG-UI 위지윅 수정 제안",
          status: "finished",
          progress: 100,
          activityText: "수정 제안 준비 완료",
        },
      ]);
      setRunStatus("interrupted");
      appendWireEvent({
        protocol: "AG-UI 1.0",
        type: "SUBAGENT_FINISHED",
        subagentRunId: "sub_asset_recommender",
        summary: "워커 #1 완료 → A2UI Surface 갱신",
        payload: { subagentRunId: "sub_asset_recommender", candidates: activeCandidateGroup?.candidates.length ?? 0 },
      });
      appendWireEvent({
        protocol: "AG-UI 1.0",
        type: "SUBAGENT_FINISHED",
        subagentRunId: "sub_wysiwyg_reviewer",
        summary: "워커 #2 완료 → AG-UI STATE_DELTA 반영",
        payload: { subagentRunId: "sub_wysiwyg_reviewer", suggestions: docSuggestions.length },
      });
      appendWireEvent({
        protocol: "AG-UI 1.0",
        type: "RUN_FINISHED",
        summary: "웨이크업: 사용자 선택 대기 (outcome: interrupted)",
        payload: { outcome: "interrupted", wakeup: true },
      });
    }, 850);

    scanTimersRef.current = [t1, t2];
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white text-slate-900">
      {/* 상단 워크스페이스 헤더 + Mode 스위치 */}
      <header className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <a
            href="http://localhost:5180/"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>스튜디오</span>
          </a>

          <div className="h-4 w-px bg-slate-300" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">프리셋</span>
            <HeaderDropdown<PlaygroundPresetId>
              ariaLabel="워크스페이스 프리셋 선택"
              value={presetId}
              tone="dark"
              triggerMaxWidthClass="max-w-[260px]"
              menuWidthClass="w-[260px]"
              options={PLAYGROUND_PRESET_LIST.map((item) => ({
                value: item.id,
                label: item.label,
                icon: renderPresetIcon(item.id),
              }))}
              onChange={handleSelectPreset}
            />
          </div>
        </div>

        {/* 한 화면 내 편집 Mode 스위치 */}
        <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-200/80 border border-slate-300/60 text-xs">
          <button
            type="button"
            onClick={() => setMode("wysiwym")}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${mode === "wysiwym"
              ? "bg-white text-indigo-700 font-bold shadow-2xs"
              : "text-slate-600 hover:text-slate-900"
              }`}
          >
            <ListTree className="w-3.5 h-3.5" />
            <span>구조·에셋 모드 (Phase 1↔2)</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("wysiwyg")}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${mode === "wysiwyg"
              ? "bg-white text-emerald-700 font-bold shadow-2xs"
              : "text-slate-600 hover:text-slate-900"
              }`}
          >
            <MousePointerClick className="w-3.5 h-3.5" />
            <span>본문·표 마감 모드 (Phase 3)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (presetId !== "agui-protocol-demo") {
                handleSelectPreset("agui-protocol-demo");
                return;
              }
              if (hubOpen && rightPanelMode === "agui-lab") {
                setRightPanelMode("hub");
              } else {
                setHubOpen(true);
                setRightPanelMode("agui-lab");
              }
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer transition ${isAguiDemoActive && hubOpen
              ? "border-indigo-500 bg-indigo-600 text-white shadow-2xs"
              : "border-indigo-200 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100"
              }`}
            title="AG-UI 1.0 + A2UI 1.0 인터랙션 목업 문서 & 랩 열기"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AG-UI · A2UI 목업</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (hubOpen && rightPanelMode === "hub") {
                setHubOpen(false);
              } else {
                setHubOpen(true);
                setRightPanelMode("hub");
              }
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition ${hubOpen && rightPanelMode === "hub"
              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
          >
            {hubOpen && rightPanelMode === "hub" ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
            <span>에셋 허브</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs text-slate-600 cursor-pointer transition"
            title="현재 샘플을 초기 상태로 되돌리기"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>초기화</span>
          </button>
        </div>
      </header>

      {/* 단일 3단 워크스페이스: 좌(아웃라이너) | 중(한글 서식 A4 시트) | 우(에셋 허브) */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        <section
          className={`${isEditing ? "w-[280px] shrink-0" : "flex-1 min-w-[330px]"
            } border-r border-slate-200 flex flex-col min-h-0 vdoc-outliner-theme bg-white transition-[width] duration-150`}
        >
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2 text-xs shrink-0">
            {isEditing ? (
              <>
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 truncate">
                  <Compass className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  연계 문서 내비게이터
                </span>
                <button
                  type="button"
                  onClick={() => setMode("wysiwym")}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline shrink-0 cursor-pointer"
                >
                  트리 편집
                </button>
              </>
            ) : (
              <>
                <span className="font-semibold text-slate-700 truncate">
                  아웃라이너 (Enter 새 줄 · Tab 들여쓰기)
                </span>
                <span
                  className="inline-flex items-center gap-1 text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full shrink-0"
                  title="항목 끝이나 ••• 메뉴에서 <<document:유형>> / <<page:유형>> 선언 시 해당 항목만 Phase 2로 연계됩니다."
                >
                  <Tag className="w-3 h-3" />
                  &lt;&lt;document&gt;&gt; / &lt;&lt;page&gt;&gt; 만 연계
                </span>
              </>
            )}
          </div>

          {isEditing ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              <div className="px-2 py-1 text-[11px] text-slate-400">
                클릭하면 시트 해당 위치로 이동합니다.
              </div>
              <OutlineNavigatorList nodes={scopedNavNodes} onFocusNode={focusNodeInSheet} />
            </div>
          ) : (
            <OutlineEditorProvider
              store={editorStore}
              host={outlineHost}
              rootNodes={outlinerRoots}
              defaultView="bullets"
            >
              <div className="px-6 pt-3 pb-1 border-b border-slate-100">
                <OutlineHeader
                  rootTitle={spec.title}
                  onUpdateRootTitle={setTitle}
                  rootPlaceholder="문서 제목"
                  showBreadcrumb
                />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                <OutlineTree />
              </div>
            </OutlineEditorProvider>
          )}
        </section>

        {/* 중앙: #document 연계 바 + 회사 한글 양식(A4 시트) 뷰포트 */}
        <section className="flex-[1.25] min-w-[420px] flex flex-col min-h-0 bg-[#eef1f6]">
          <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-bold text-slate-500 shrink-0">
                연계 문서 ({linkExtraction.documents.length})
              </span>
              {linkExtraction.documents.length === 0 ? (
                <span className="text-[11px] text-slate-400">선언된 `&lt;&lt;document&gt;&gt;` 없음</span>
              ) : (
                <HeaderDropdown<string>
                  ariaLabel="연계 문서 선택"
                  value={activeLinkedDoc?.id}
                  tone="indigo"
                  triggerMaxWidthClass="max-w-[380px]"
                  menuWidthClass="w-[400px] max-w-[90vw]"
                  options={linkExtraction.documents.map((doc) => ({
                    value: doc.id,
                    label: doc.title,
                    badge: doc.docFormat,
                    meta: doc.docFormat?.toLowerCase().includes("web") || doc.docFormat?.toLowerCase().includes("blog")
                      ? "(스크롤)"
                      : `(${doc.pages.length}P)`,
                  }))}
                  onChange={handleSelectLinkedDocWithWire}
                />
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {!activeLinkedDoc ? (
              <div className="h-full flex items-center justify-center p-6">
                <div className="max-w-md rounded-2xl bg-white border border-slate-200 p-6 text-center space-y-3 shadow-xs">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                    <FolderKanban className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Phase 2로 연계된 `&lt;&lt;document&gt;&gt;` · `&lt;&lt;page&gt;&gt;` 선언이 없습니다
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    태그가 없는 메모·할 일은{" "}
                    <strong>Phase 1 아웃라이너에만 안전하게 보관</strong>됩니다.
                    우측 에셋 허브 양식에 부어넣을 항목 끝에만{" "}
                    <code className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                      &lt;&lt;document:hwp&gt;&gt;
                    </code>{" "}
                    또는{" "}
                    <code className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                      &lt;&lt;page:수요조사표&gt;&gt;
                    </code>{" "}
                    지시어를 선언해 주세요.
                  </p>
                </div>
              </div>
            ) : (
              <UnifiedSheetViewport
                mode={mode}
                compiledDoc={compiled.doc}
                docFormat={activeLinkedDoc.docFormat}
                activeLinkedPageId={activeLinkedPageId}
                selectedBlockId={selectedBlockId}
                selectedBlockLabel={
                  selectedBlockId ? compiled.blockMetaMap[selectedBlockId]?.label ?? null : null
                }
                selectedSlotId={selectedSlotId}
                editedCount={editedCount}
                focusRequest={focusRequest}
                onSelectBlock={(bid) => {
                  selectBlock(bid);
                  if (bid) setHubOpen(true);
                }}
                onSelectSlot={setSelectedSlotId}
                onUpdateSlotContent={updateSlotContent}
                onTableCommand={runTableCommand}
                onSwitchMode={setMode}
                renderPageOverlay={
                  isAguiDemoActive
                    ? ({ pageId, hostEl, renderWidth, scale }) => (
                      <WysiwygSuggestionOverlay
                        pageId={pageId}
                        hostEl={hostEl}
                        renderWidth={renderWidth}
                        scale={scale}
                        surfacePlacement={surfacePlacement}
                        suggestions={docSuggestions}
                        activeSuggestionId={activeSuggestionId}
                        activeCandidateGroup={activeCandidateGroup}
                        selectedCandidateId={
                          activeCandidateGroup
                            ? selectedCandidateByGroup[activeCandidateGroup.id] ?? null
                            : null
                        }
                        toneFilter={toneFilter}
                        onSelectSuggestion={setActiveSuggestionId}
                        onSelectVariant={handleSelectVariant}
                        onAcceptSuggestion={handleAcceptSuggestion}
                        onRejectSuggestion={handleRejectSuggestion}
                        onRevertSuggestion={handleRevertSuggestion}
                        onSelectCandidate={handleSelectCandidate}
                        onResumeDecision={handleResumeDecision}
                        onChangeToneFilter={handleChangeToneFilter}
                      />
                    )
                    : undefined
                }
              />
            )}
          </div>
        </section>

        {hubOpen ? (
          isAguiDemoActive ? (
            <AguiA2uiDemoPanel
              linkedDocs={linkExtraction.documents}
              activeLinkedDocId={activeLinkedDoc?.id ?? null}
              candidateGroups={docCandidateGroups}
              activeGroupId={activeCandidateGroup?.id ?? ""}
              selectedCandidateByGroup={selectedCandidateByGroup}
              suggestions={docSuggestions}
              activeSuggestionId={activeSuggestionId}
              surfacePlacement={surfacePlacement}
              toneFilter={toneFilter}
              runStatus={runStatus}
              subagents={subagents}
              wireEvents={wireEvents}
              onSelectLinkedDoc={handleSelectLinkedDocWithWire}
              onSelectGroup={(gid) => {
                setActiveCandidateGroupId(gid);
                const g = docCandidateGroups.find((item) => item.id === gid);
                if (g) {
                  appendWireEvent({
                    protocol: "A2UI 1.0",
                    type: "createSurface",
                    summary: `대상 블록 변경 → ${g.targetLabel}`,
                    payload: { surfaceId: g.surfaceId, targetBlockId: g.targetBlockId },
                  });
                }
              }}
              onChangeSurfacePlacement={handleChangeSurfacePlacement}
              onChangeToneFilter={handleChangeToneFilter}
              onSelectCandidate={handleSelectCandidate}
              onFocusBlock={(nodeId, switchToWysiwyg) => {
                if (switchToWysiwyg) setMode("wysiwyg");
                focusNodeInSheet(nodeId);
              }}
              onSelectSuggestion={setActiveSuggestionId}
              onSelectVariant={handleSelectVariant}
              onAcceptSuggestion={handleAcceptSuggestion}
              onRejectSuggestion={handleRejectSuggestion}
              onRevertSuggestion={handleRevertSuggestion}
              onAcceptAllSuggestions={handleAcceptAllSuggestions}
              onRunParallelScan={handleRunParallelScan}
              onResumeDecision={handleResumeDecision}
            />
          ) : (
            <FormAssetHubSidebar
              linkedDocs={linkExtraction.documents}
              activeLinkedDocId={activeLinkedDoc?.id ?? null}
              activeLinkedPageId={activeLinkedPageId}
              activeAssetId={activeAssetId}
              sheetElements={Object.values(compiled.blockMetaMap)}
              selectedBlockMeta={
                selectedBlockId ? compiled.blockMetaMap[selectedBlockId] ?? null : null
              }
              blockVariants={blockVariants}
              viewCache={viewCache}
              dirtyViewBlocks={dirtyViewBlocks}
              aiCompileStatus={aiCompileStatus}
              webFormTheme={webFormTheme}
              locked={isEditing}
              onSelectAsset={selectAsset}
              onSelectElementBlock={(bid) => selectBlock(bid)}
              onSelectBlockVariant={setBlockVariant}
              onApplyTableView={applyTableViewToCache}
              onRevertTableView={revertTableViewToCache}
              onRegenerateTableAi={(bid, vid, feedback) => {
                void runTableAiCompile(bid, vid, feedback);
              }}
              onCancelAiCompile={cancelAiCompile}
              onSelectWebFormTheme={setWebFormTheme}
              onClearBlockSelection={() => selectBlock(null)}
              onSelectLinkedDoc={handleSelectLinkedDocWithWire}
              onSelectLinkedPage={selectLinkedPage}
              onUnlockToWysiwym={() => setMode("wysiwym")}
              onEnterPhase3Edit={() => setMode("wysiwyg")}
            />
          )
        ) : null}
      </div>
    </div>
  );
};
