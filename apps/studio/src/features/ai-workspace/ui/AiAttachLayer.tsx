import React from "react";
import { createPortal } from "react-dom";
import { BookOpenCheck, Crosshair, PencilLine, Sparkles, Target, Wand2 } from "lucide-react";

import type { ContextRef } from "@vibe/ai-kernel";

import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { aiRuntime } from "@/shared/ai";

import { attachToComposer, currentAttachables, useAttachMenuStore, type AttachOptions } from "../model/attach";
import { slotRangeRef } from "../model/contextBuilders";

/**
 * 워크스페이스 전역 AI 첨부 레이어 (페이지에 한 번 둔다).
 * - Ctrl+L: 지금 고른 것(텍스트 선택 · 고른 묶음 · PDF 영역 · 선택 슬롯/블록)을 Composer 에 첨부
 * - 캔버스 블록 · 슬롯 우클릭: 첨부 메뉴 (편집 중인 글자 위 · 표 셀은 기존 메뉴를 그대로 둔다)
 * - `attachable()` 을 붙인 요소의 우클릭 메뉴
 * - AI 칩 호버 강조 (`highlightedEntityId`)
 */
export const AiAttachLayer: React.FC = () => {
  useAttachShortcut();
  useCanvasContextMenu();
  return (
    <>
      <EntityHighlightStyle />
      <AttachContextMenu />
    </>
  );
};

function focusComposerInput(): void {
  window.setTimeout(() => document.querySelector<HTMLTextAreaElement>("[data-testid='composer-input']")?.focus(), 80);
}

function useAttachShortcut(): void {
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "l") return;
      e.preventDefault(); // 브라우저 주소창으로 가지 않게
      const refs = currentAttachables();
      if (refs.length) attachToComposer(refs);
      else {
        attachToComposer([]);
        focusComposerInput();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}

function useCanvasContextMenu(): void {
  React.useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) return; // 표 셀 메뉴 · attachable() 요소가 이미 처리했다
      const target = e.target as HTMLElement | null;
      if (!target || target.closest("input, textarea, [contenteditable='true'], [data-testid='ai-composer-panel']")) return;
      const host = target.closest<HTMLElement>("[data-slot-id], [data-block-id]");
      if (!host || !host.closest("[id^='vdoc-page-']")) return;
      const slotId = host.dataset.slotId;
      const blockId = host.dataset.blockId ?? host.closest<HTMLElement>("[data-block-id]")?.dataset.blockId;
      const refs: ContextRef[] = [];
      const slot = slotId ? aiRuntime.entities.lookup(slotId, "slot")?.toContext?.() : undefined;
      const block = blockId ? aiRuntime.entities.lookup(blockId, "block")?.toContext?.() : undefined;
      if (slot) refs.push(slot);
      else if (block) refs.push(block);
      if (refs.length === 0) return;
      e.preventDefault();
      useAttachMenuStore.getState().open(e.clientX, e.clientY, refs);
    };
    // 여러 슬롯 범위 위의 우클릭은 표 메뉴 · 편집기 기본 메뉴보다 먼저 범위 첨부 메뉴를 띄운다.
    // (한 표 안의 범위는 표 메뉴의 셀 병합 등이 필요하므로 그대로 둔다)
    const onRangeContextMenu = (e: MouseEvent) => {
      const range = useSlotSelectionStore.getState().slotRange;
      const doc = selectActiveDocument(useStudioDocumentStore.getState());
      if (!range || range.withinTable || !doc) return;
      const host = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-vdoc-unit]");
      if (!host || !range.unitIds.includes(host.dataset.vdocUnit!)) return;
      e.preventDefault();
      e.stopPropagation();
      useAttachMenuStore.getState().open(e.clientX, e.clientY, [slotRangeRef(doc, range.slotIds, range.unitIds)]);
    };
    window.addEventListener("contextmenu", onRangeContextMenu, true);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("contextmenu", onRangeContextMenu, true);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);
}

/** AI 칩 호버 시 화면의 그 요소를 보라색으로 강조 (아웃라인 호버의 초록과 구분). */
const EntityHighlightStyle: React.FC = () => {
  const id = useWorkspaceSessionStore((s) => s.highlightedEntityId);
  if (!id) return null;
  const sel = CSS.escape(id);
  return (
    <style>{`
      [data-slot-id="${sel}"], [data-block-id="${sel}"], #vdoc-page-${sel}, [data-ai-entity="${sel}"] {
        outline: 2px solid #7c3aed !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 0 5px rgba(139, 92, 246, 0.28) !important;
        transition: outline-color 0.12s, box-shadow 0.12s !important;
      }
    `}</style>
  );
};

// --- 우클릭 메뉴 ----------------------------------------------------------------------------

interface MenuItem {
  key: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run(): void;
}

function menuItems(refs: ContextRef[], close: () => void): MenuItem[][] {
  const writable = refs.some((r) => r.access === "write");
  const go = (options?: AttachOptions) => () => {
    attachToComposer(refs, options);
    close();
  };
  const attach: MenuItem[] = [
    { key: "attach", label: "Composer 에 첨부", hint: "Ctrl+L", icon: Sparkles, run: go() },
  ];
  if (writable) attach.push({ key: "target", label: "고칠 대상으로 첨부", icon: Target, run: go({ role: "target" }) });
  attach.push({ key: "reference", label: "참고자료로 첨부", icon: BookOpenCheck, run: go({ role: "reference" }) });

  const quick: MenuItem[] = writable
    ? [
        { key: "fill", label: "채워 달라고 하기", icon: PencilLine, run: go({ role: "target", prompt: "{handles} 의 빈 곳을 채워서 변경안으로 올려줘." }) },
        { key: "polish", label: "다듬어 달라고 하기", icon: Wand2, run: go({ role: "target", prompt: "{handles} 를 더 명확하고 간결하게 다듬어서 변경안으로 올려줘." }) },
      ]
    : [
        { key: "use", label: "이걸 참고해서…", icon: BookOpenCheck, run: go({ role: "reference", prompt: "{handles} 를 참고해서 " }) },
        { key: "summary", label: "요약해 달라고 하기", icon: Wand2, run: go({ role: "reference", prompt: "{handles} 의 핵심을 요약해줘." }) },
      ];

  const groups = [attach, quick];
  if (refs.length === 1) {
    const meta = refs[0].meta ?? {};
    const entity = aiRuntime.entities.lookup(
      typeof meta.entityId === "string" ? meta.entityId : refs[0].id,
      typeof meta.entityKind === "string" ? meta.entityKind : undefined
    );
    if (entity) groups.push([{ key: "reveal", label: "위치로 이동", icon: Crosshair, run: () => (entity.reveal(), close()) }]);
  }
  return groups;
}

const AttachContextMenu: React.FC = () => {
  const menu = useAttachMenuStore((s) => s.menu);
  const close = useAttachMenuStore((s) => s.close);
  const ref = React.useRef<HTMLDivElement>(null);

  // 화면 가장자리에서 열리면 안쪽으로 당긴다 (그리기 직후 크기를 재서 위치만 고친다).
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!menu || !el) return;
    el.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - el.offsetHeight - 8))}px`;
    el.style.visibility = "visible";
  }, [menu]);

  React.useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("blur", close);
    };
  }, [menu, close]);

  if (!menu) return null;
  const groups = menuItems(menu.refs, close);
  const title = menu.refs.length === 1 ? menu.refs[0].label : `${menu.refs.length}개 항목`;
  return createPortal(
    <div
      ref={ref}
      data-testid="ai-attach-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y, visibility: "hidden" }}
      className="fixed z-[1000] w-56 rounded-xl border border-slate-200 bg-white shadow-xl py-1 text-[12px] select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 pt-1 pb-1.5 border-b border-slate-100">
        <div className="text-[10px] font-bold uppercase tracking-wide text-violet-500">AI Composer</div>
        <div className="truncate font-semibold text-slate-800" title={menu.refs.map((r) => r.label).join(", ")}>
          {title}
        </div>
      </div>
      {groups.map((group, gi) => (
        <div key={gi} className={gi > 0 ? "border-t border-slate-100 mt-1 pt-1" : "pt-1"}>
          {group.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              data-testid={`ai-attach-menu-${item.key}`}
              onClick={item.run}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-violet-50 hover:text-violet-900 cursor-pointer"
            >
              <item.icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.hint && <span className="text-[10px] font-mono text-slate-400">{item.hint}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>,
    document.body
  );
};
