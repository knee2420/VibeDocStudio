import React from "react";
import { ChevronDown, ChevronRight, GripVertical, RotateCcw } from "lucide-react";

import { OUTLINE_DOC, type ONode } from "../../model/outline";
import { findNode, flatten, useOutlineStore, type Lens } from "../../model/useOutlineStore";
import { useLabStore } from "../../model/useLabStore";
import { DocHead, FillBar, FormChip, focusCanvas, NodeName, OtherDocs, OutlineRow } from "./OutlineParts";

/** 모든 노드 (제안 제외) */
const allNodes = (tree: ONode[]): ONode[] => tree.flatMap((n) => (n.ghost ? [] : [n, ...allNodes(n.children ?? [])]));

const ResetBtn: React.FC = () => {
  const reset = useOutlineStore((s) => s.reset);
  return (
    <button type="button" className="fig-icon-btn" title="더미 뼈대 처음으로" onClick={reset}>
      <RotateCcw className="w-3 h-3" />
    </button>
  );
};

/* ───────── O1 · 개요 ───────── */

export const OutlineO1: React.FC = () => {
  const tree = useOutlineStore((s) => s.tree);
  const collapsed = useOutlineStore((s) => s.collapsed);
  const selected = useOutlineStore((s) => s.selected);
  const editing = useOutlineStore((s) => s.editing);
  const { select, addAfter, indent, outdent, setEditing } = useOutlineStore.getState();
  const rows = flatten(tree, collapsed, { ghosts: false });

  const onKey = (e: React.KeyboardEvent) => {
    if (editing || !selected) return;
    const i = rows.findIndex((r) => r.node.id === selected);
    if (e.key === "Enter") {
      e.preventDefault();
      addAfter(selected);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) outdent(selected);
      else indent(selected);
    } else if (e.key === "ArrowDown" && i < rows.length - 1) {
      e.preventDefault();
      select(rows[i + 1].node.id);
    } else if (e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      select(rows[i - 1].node.id);
    } else if (e.key === "F2") {
      e.preventDefault();
      setEditing(selected);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="outline-o1">
      <div className="flex items-start">
        <div className="flex-1 min-w-0"><DocHead title={OUTLINE_DOC.title} purpose={OUTLINE_DOC.purpose} /></div>
        <div className="pt-2 pr-1.5"><ResetBtn /></div>
      </div>
      <div tabIndex={0} onKeyDown={onKey} className="flex-1 min-h-0 overflow-y-auto outline-none pb-2" data-testid="outline-o1-list">
        {rows.map((r) => (
          <OutlineRow key={r.node.id} row={r} mode="outline" />
        ))}
        <p className="mx-3 mt-2 text-[10.5px] text-[var(--fig-text-tertiary)]">노드를 고르고 Enter 새 절 · Tab 들여쓰기 · Shift+Tab 내어쓰기 · F2/두 번 눌러 이름</p>
        <OtherDocs names={OUTLINE_DOC.others} />
      </div>
    </div>
  );
};

/* ───────── O2 · 단계 렌즈 ───────── */

const LENSES: { id: Lens; label: string }[] = [
  { id: "skeleton", label: "1 뼈대" },
  { id: "form", label: "2 서식" },
  { id: "content", label: "3 내용" },
];

const LensSummary: React.FC<{ lens: Lens; tree: ONode[] }> = ({ lens, tree }) => {
  const nodes = allNodes(tree).filter((n) => !n.page);
  const noIntent = nodes.filter((n) => !n.intent).length;
  const noName = nodes.filter((n) => !n.name).length;
  const formed = nodes.filter((n) => n.form).length;
  const fill = nodes.reduce((a, n) => a + n.fill, 0) / Math.max(1, nodes.length);
  const blanks = nodes.reduce((a, n) => a + n.blanks, 0);
  const noCite = nodes.reduce((a, n) => a + (n.noCite ?? 0), 0);
  return (
    <div className="px-3 pb-1.5 text-[11px] text-[var(--fig-text-secondary)] flex items-center gap-2 flex-wrap">
      {lens === "skeleton" && (
        <>
          <span>절 {nodes.length}개</span>
          {noName > 0 && <span className="text-[#b26b00]">이름 필요 {noName}</span>}
          {noIntent > 0 && <span className="text-[#b26b00]">의도 없음 {noIntent}</span>}
        </>
      )}
      {lens === "form" && <span>형식 정해짐 {formed}/{nodes.length}</span>}
      {lens === "content" && (
        <>
          <FillBar fill={fill} w="w-16" />
          <span className="tabular-nums">채움 {Math.round(fill * 100)}%</span>
          <span className="text-[var(--fig-brand)]">빈칸 {blanks}</span>
          {noCite > 0 && <span className="text-[#b26b00]">출처 없음 {noCite}</span>}
        </>
      )}
    </div>
  );
};

const LensSeg: React.FC = () => {
  const lens = useOutlineStore((s) => s.lens);
  const setLens = useOutlineStore((s) => s.setLens);
  return (
    <div className="fig-seg mx-3 mb-1.5" role="group" aria-label="단계 렌즈">
      {LENSES.map((l) => (
        <button key={l.id} type="button" aria-pressed={lens === l.id} onClick={() => setLens(l.id)} data-testid={`outline-lens-${l.id}`}>
          {l.label}
        </button>
      ))}
    </div>
  );
};

export const OutlineO2: React.FC = () => {
  const tree = useOutlineStore((s) => s.tree);
  const collapsed = useOutlineStore((s) => s.collapsed);
  const lens = useOutlineStore((s) => s.lens);
  const rows = flatten(tree, collapsed, { ghosts: false });
  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="outline-o2">
      <DocHead title={OUTLINE_DOC.title} purpose={OUTLINE_DOC.purpose} />
      <LensSeg />
      <LensSummary lens={lens} tree={tree} />
      <div className="flex-1 min-h-0 overflow-y-auto pb-2 border-t border-[var(--fig-border)] pt-1">
        {rows.map((r) => (
          <OutlineRow key={r.node.id} row={r} mode={lens} />
        ))}
        <OtherDocs names={OUTLINE_DOC.others} />
      </div>
    </div>
  );
};

/* ───────── O3 · 카드 ───────── */

export const OutlineO3: React.FC = () => {
  const tree = useOutlineStore((s) => s.tree);
  const moveBefore = useOutlineStore((s) => s.moveBefore);
  const select = useOutlineStore((s) => s.select);
  const selected = useOutlineStore((s) => s.selected);
  const pages = tree.filter((n) => n.page);
  const [pageId, setPageId] = React.useState(pages[0]?.id ?? "");
  const page = findNode(tree, pageId);
  const drag = React.useRef<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const cards = (page?.children ?? []).filter((c) => !c.ghost);

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="outline-o3">
      <DocHead title={OUTLINE_DOC.title} purpose={OUTLINE_DOC.purpose} />
      <div className="px-2 pb-2 flex gap-1 overflow-x-auto shrink-0">
        {pages.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPageId(p.id);
              focusCanvas(p.anchor ?? p.children?.[0]?.anchor);
            }}
            className={`shrink-0 h-6 px-2 rounded-md text-[11px] border ${p.id === pageId ? "bg-[var(--fig-selected)] border-[var(--fig-brand)]/40 text-[var(--fig-text)]" : "border-[var(--fig-border)] text-[var(--fig-text-secondary)] hover:bg-[var(--fig-hover)]"}`}
          >
            {p.page} · {p.name}
          </button>
        ))}
      </div>
      {page && (
        <div className="px-3 pb-2 text-[11px] text-[var(--fig-text-secondary)]">
          <span className="font-medium text-[var(--fig-text)]">{page.name}</span> — {page.intent}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 grid gap-2 content-start [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
        {cards.map((c, i) => (
          <div
            key={c.id}
            draggable
            data-testid="outline-card"
            data-node={c.id}
            onDragStart={() => (drag.current = c.id)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(c.id);
            }}
            onDragLeave={() => setOver((o) => (o === c.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (drag.current) moveBefore(drag.current, c.id);
              drag.current = null;
              setOver(null);
            }}
            onClick={() => {
              select(c.id);
              focusCanvas(c.anchor);
            }}
            className={`group rounded-lg border bg-white p-2 flex flex-col gap-1 cursor-default ${
              over === c.id ? "border-[var(--fig-brand)] border-dashed" : selected === c.id ? "border-[var(--fig-brand)]" : "border-[var(--fig-border)] hover:border-black/20"
            }`}
          >
            <div className="flex items-center gap-1 min-w-0">
              <GripVertical className="w-3 h-3 text-[var(--fig-text-tertiary)] shrink-0 cursor-grab" />
              <span className="text-[11px] tabular-nums text-[var(--fig-text-tertiary)]">{i + 1}</span>
              <NodeName node={c} className="font-semibold" />
            </div>
            <p className="text-[11.5px] leading-4 text-[var(--fig-text-secondary)] min-h-[32px]">
              {c.intent || <span className="italic text-[var(--fig-text-tertiary)]">여기서 말할 것이 아직 없습니다</span>}
            </p>
            {c.children?.filter((k) => !k.ghost).length ? (
              <ul className="text-[11px] leading-4 list-disc pl-4 text-[var(--fig-text)]">
                {c.children.filter((k) => !k.ghost).map((k) => (
                  <li key={k.id} className="truncate">{k.name}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-auto pt-1 flex items-center gap-1.5 min-w-0">
              <FormChip node={c} small />
              <span className="ml-auto"><FillBar fill={c.fill} /></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ───────── O4 · AI 협업 ───────── */

/** AI 가 이 문서를 이해하는 뼈대 (실제로는 프롬프트에 들어갈 글) */
function aiSkeleton(tree: ONode[]): string {
  const lines = [`# ${OUTLINE_DOC.title}`, `목적: ${OUTLINE_DOC.purpose}`, ""];
  const walk = (list: ONode[], depth: number, prefix: string) => {
    let k = 0;
    for (const n of list) {
      if (n.ghost) continue;
      const num = n.page ? n.page : prefix ? `${prefix}.${++k}` : `${++k}`;
      const pad = "  ".repeat(depth);
      const form = n.form ? ` [${n.form.label}${n.fields ? `: ${n.fields.join("·")}` : ""}]` : "";
      const state = n.fill >= 1 ? "채움" : n.fill > 0 ? `채움 ${Math.round(n.fill * 100)}%` : "빈칸";
      const cite = n.cites ? ` 출처 ${n.cites}` : "";
      const warn = n.noCite ? ` ⚠출처 없는 주장 ${n.noCite}` : "";
      lines.push(`${pad}${num} ${n.name ?? "(이름 없음)"}${form} — ${n.intent || "(의도 없음)"} · ${state}${cite}${warn}`);
      if (n.children) walk(n.children, depth + 1, n.page ? "" : num);
    }
  };
  walk(tree, 0, "");
  return lines.join("\n");
}

export const OutlineO4: React.FC = () => {
  const tree = useOutlineStore((s) => s.tree);
  const collapsed = useOutlineStore((s) => s.collapsed);
  const lens = useOutlineStore((s) => s.lens);
  const say = useLabStore((s) => s.say);
  const [showAi, setShowAi] = React.useState(false);
  const rows = flatten(tree, collapsed, { ghosts: true });
  const ghosts = rows.filter((r) => r.node.ghost).length;
  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="outline-o4">
      <DocHead title={OUTLINE_DOC.title} purpose={OUTLINE_DOC.purpose} />
      <LensSeg />
      <LensSummary lens={lens} tree={tree} />
      {ghosts > 0 && (
        <div className="mx-3 mb-1.5 text-[11px] text-[#7a3bd6]">AI 제안 {ghosts}개 — 흐린 노드를 받거나 버리세요</div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto pb-2 border-t border-[var(--fig-border)] pt-1">
        {rows.map((r) => (
          <OutlineRow
            key={r.node.id}
            row={r}
            mode={lens}
            ai
            onFill={(n) => say(`AI 가 '${n.name ?? n.suggestName ?? "이 노드"}' 의 의도(${n.intent || "없음"})대로 빈칸 ${n.blanks}개를 채운다고 가정합니다`)}
          />
        ))}
      </div>
      <div className="border-t border-[var(--fig-border)] shrink-0">
        <button type="button" onClick={() => setShowAi((o) => !o)} className="w-full h-8 px-3 flex items-center gap-1.5 text-[11.5px] font-medium hover:bg-[var(--fig-hover)]" data-testid="outline-ai-skeleton-toggle">
          {showAi ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}AI 가 보는 뼈대
        </button>
        {showAi && (
          <pre className="max-h-[38vh] overflow-auto mx-2 mb-2 p-2 rounded-md bg-[#f6f7f9] border border-[var(--fig-border)] text-[10.5px] leading-[16px] whitespace-pre-wrap font-mono text-[var(--fig-text)]" data-testid="outline-ai-skeleton">
            {aiSkeleton(tree)}
          </pre>
        )}
      </div>
    </div>
  );
};

