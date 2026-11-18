import React from "react";
import {
  AlignLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  FileText,
  Heading,
  LayoutPanelTop,
  PenLine,
  Workflow,
  Info,
  ListTodo,
  Sparkles,
  Table2,
  X,
  type LucideIcon,
} from "lucide-react";

import type { FormKind, ONode } from "../../model/outline";
import type { FlatRow, Lens } from "../../model/useOutlineStore";
import { useOutlineStore } from "../../model/useOutlineStore";

export const FORM_ICON: Record<FormKind, LucideIcon> = {
  form: FileText,
  meta: Info,
  text: AlignLeft,
  table: Table2,
  list: ListTodo,
  twocol: Columns2,
  nested: LayoutPanelTop,
  sign: PenLine,
  flow: Workflow,
  title: Heading,
};

/** 고정 글 · 기관 작성 꼬리표 */
export const RoleTags: React.FC<{ node: ONode }> = ({ node }) => (
  <>
    {node.fixed && <span className="shrink-0 px-1 rounded text-[9.5px] leading-4 bg-black/[0.05] text-[var(--fig-text-tertiary)]">고정</span>}
    {node.office && <span className="shrink-0 px-1 rounded text-[9.5px] leading-4 bg-[#e8eefc] text-[#3b5bdb]">기관 작성</span>}
  </>
);

/** 캔버스의 그 자리로 옮기고 잠깐 강조. */
export function focusCanvas(anchor?: string) {
  if (!anchor) return;
  const el = document.querySelector<HTMLElement>(`[data-anchor="${anchor}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.animate?.(
    [{ boxShadow: "0 0 0 3px rgba(13,153,255,.7)", backgroundColor: "rgba(13,153,255,.08)" }, { boxShadow: "0 0 0 0 rgba(13,153,255,0)", backgroundColor: "transparent" }],
    { duration: 1600, easing: "ease-out" },
  );
}

export const FormChip: React.FC<{ node: ONode; small?: boolean }> = ({ node, small }) => {
  if (!node.form) return <span className="text-[10.5px] text-[#b26b00]">형식 미정</span>;
  const Icon = FORM_ICON[node.form.kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1 ${small ? "text-[10px]" : "text-[10.5px]"} bg-[#9747ff]/10 text-[#7a3bd6] shrink-0`}>
      <Icon className="w-3 h-3" />
      {node.form.label}
    </span>
  );
};

export const Fields: React.FC<{ node: ONode }> = ({ node }) =>
  node.fields?.length ? (
    <span className="text-[10.5px] text-[var(--fig-text-tertiary)] truncate">( {node.fields.join(", ")} )</span>
  ) : null;

export const FillBar: React.FC<{ fill: number; w?: string }> = ({ fill, w = "w-10" }) => (
  <span className={`relative inline-block h-1.5 ${w} rounded-full bg-black/[0.08] overflow-hidden shrink-0`} title={`채움 ${Math.round(fill * 100)}%`}>
    <span className={`absolute inset-y-0 left-0 rounded-full ${fill >= 1 ? "bg-[#0f9d58]" : fill > 0 ? "bg-[var(--fig-brand)]" : ""}`} style={{ width: `${Math.round(fill * 100)}%` }} />
  </span>
);

/** 내용 렌즈 한 줄: 채움 · 빈칸 · 출처 */
export const ContentLine: React.FC<{ node: ONode }> = ({ node }) => (
  <span className="flex items-center gap-1.5 text-[10.5px] text-[var(--fig-text-secondary)] min-w-0">
    <FillBar fill={node.fill} />
    <span className="tabular-nums">{Math.round(node.fill * 100)}%</span>
    {node.blanks > 0 && <span className="text-[var(--fig-brand)]">빈칸 {node.blanks}</span>}
    {node.cites > 0 && <span className="text-[#0f9d58]">출처 {node.cites}</span>}
    {node.noCite ? <span className="text-[#b26b00]">출처 없음 {node.noCite}</span> : null}
  </span>
);

/** 노드 이름 — 없으면 "이름 필요" (안내문 · 틀 이름을 이름으로 쓰지 않는다). */
export const NodeName: React.FC<{ node: ONode; className?: string }> = ({ node, className = "" }) =>
  node.name ? (
    <span className={`truncate ${className}`} title={node.was ? `지금 앱에서는: ${node.was}` : undefined}>
      {node.name}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 min-w-0" title={node.was ? `지금 앱에서는: ${node.was}` : undefined}>
      <span className="shrink-0 px-1 rounded text-[10px] bg-[#fff1d6] text-[#b26b00]">이름 필요</span>
      {node.form && <span className="truncate text-[var(--fig-text-tertiary)]">{node.form.label}</span>}
    </span>
  );

/** 이름 고치기 입력 */
const NameInput: React.FC<{ node: ONode }> = ({ node }) => {
  const rename = useOutlineStore((s) => s.rename);
  const setEditing = useOutlineStore((s) => s.setEditing);
  const [v, setV] = React.useState(node.name ?? node.suggestName ?? "");
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") rename(node.id, v);
        if (e.key === "Escape") setEditing(null);
      }}
      onBlur={() => rename(node.id, v)}
      placeholder="이 부분이 무엇인지 — 이름"
      className="flex-1 min-w-0 h-5 px-1 rounded border border-[var(--fig-brand)] outline-none bg-white text-[12px]"
      data-testid="outline-rename"
    />
  );
};

export type RowMode = "outline" | Lens;

/** 아웃라인 한 줄 — 번호 · 이름 + 모드별 둘째 줄 (의도 / 형식 / 채움). */
export const OutlineRow: React.FC<{
  row: FlatRow;
  mode: RowMode;
  ai?: boolean;
  onFill?: (n: ONode) => void;
}> = ({ row, mode, ai, onFill }) => {
  const { node, depth, num, hasChildren } = row;
  const selected = useOutlineStore((s) => s.selected === node.id);
  const editing = useOutlineStore((s) => s.editing === node.id);
  const collapsed = useOutlineStore((s) => !!s.collapsed[node.id]);
  const select = useOutlineStore((s) => s.select);
  const setEditing = useOutlineStore((s) => s.setEditing);
  const toggle = useOutlineStore((s) => s.toggle);
  const accept = useOutlineStore((s) => s.accept);
  const dismiss = useOutlineStore((s) => s.dismiss);
  const isPage = Boolean(node.page);

  let second: React.ReactNode = null;
  if (mode === "outline" || mode === "skeleton")
    second = node.intent ? (
      <span className="truncate text-[11px] text-[var(--fig-text-secondary)]">{node.intent}</span>
    ) : (
      <span className="text-[11px] text-[var(--fig-text-tertiary)] italic">여기서 말할 것이 아직 없습니다</span>
    );
  else if (mode === "form")
    second = (
      <span className="flex items-center gap-1 min-w-0">
        <FormChip node={node} />
        <Fields node={node} />
      </span>
    );
  else second = <ContentLine node={node} />;

  return (
    <div
      data-testid="outline-row"
      data-node={node.id}
      onClick={() => {
        select(node.id);
        focusCanvas(node.anchor);
      }}
      onDoubleClick={() => !node.ghost && setEditing(node.id)}
      className={`group relative mx-1.5 rounded-md pr-1.5 py-1 flex gap-1 cursor-default ${
        node.ghost ? "border border-dashed border-[#9747ff]/50 bg-[#9747ff]/[0.04] opacity-80" : selected ? "bg-[var(--fig-selected)]" : "hover:bg-[var(--fig-hover)]"
      } ${isPage ? "mt-1" : ""}`}
      style={{ paddingLeft: 4 + depth * 16 }}
    >
      <button
        type="button"
        className={`w-4 h-5 shrink-0 flex items-center justify-center text-[var(--fig-text-tertiary)] ${hasChildren ? "" : "invisible"}`}
        onClick={(e) => {
          e.stopPropagation();
          toggle(node.id);
        }}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0 h-5">
          {node.ghost ? (
            <Sparkles className="w-3 h-3 text-[#9747ff] shrink-0" />
          ) : isPage ? (
            <span className="shrink-0 px-1 rounded text-[10px] leading-4 bg-black/[0.06] text-[var(--fig-text-secondary)]">{num}</span>
          ) : (
            <span className="shrink-0 text-[11px] tabular-nums text-[var(--fig-text-tertiary)] min-w-[18px]">{num}</span>
          )}
          {editing ? (
            <NameInput node={node} />
          ) : (
            <NodeName node={node} className={`${isPage ? "font-semibold" : "font-medium"} ${node.fixed ? "!font-normal text-[var(--fig-text-tertiary)]" : ""}`} />
          )}
          <RoleTags node={node} />
        </div>
        <div className="flex items-center min-w-0 mt-0.5 pl-0.5">{second}</div>
        {ai && !node.ghost && !node.name && node.suggestName && (
          <div className="mt-1 flex items-center gap-1 text-[11px]">
            <Sparkles className="w-3 h-3 text-[#9747ff]" />
            <span className="text-[var(--fig-text-secondary)]">AI 제안 이름</span>
            <b className="truncate">{node.suggestName}</b>
            <button type="button" className="fig-btn !h-5 !px-1.5 ml-auto" onClick={(e) => { e.stopPropagation(); accept(node.id); }}>받기</button>
          </div>
        )}
      </div>
      {node.ghost && (
        <span className="flex items-start gap-0.5 shrink-0">
          <button type="button" className="fig-icon-btn" title="받기" data-testid="outline-accept" onClick={(e) => { e.stopPropagation(); accept(node.id); }}>
            <Check className="w-3.5 h-3.5 text-[#0f9d58]" />
          </button>
          <button type="button" className="fig-icon-btn" title="버리기" onClick={(e) => { e.stopPropagation(); dismiss(node.id); }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      )}
      {ai && !node.ghost && onFill && node.blanks > 0 && (
        <button
          type="button"
          title="이 노드의 의도대로 AI 가 빈칸을 채운다"
          onClick={(e) => {
            e.stopPropagation();
            onFill(node);
          }}
          className="absolute right-1.5 top-1 hidden group-hover:inline-flex items-center gap-1 h-5 px-1.5 rounded bg-white border border-[var(--fig-border)] text-[10.5px] text-[#7a3bd6]"
        >
          <Sparkles className="w-3 h-3" />의도대로 채우기
        </button>
      )}
    </div>
  );
};

/** 문서 머리 — 문서 자체의 "목적" 이 뼈대 맨 위의 설명 주석. */
export const DocHead: React.FC<{ title: string; purpose: string }> = ({ title, purpose }) => (
  <div className="px-3 pt-2 pb-1.5">
    <div className="font-semibold text-[12.5px] truncate">{title}</div>
    <div className="text-[11px] text-[var(--fig-text-secondary)] truncate">목적 · {purpose}</div>
  </div>
);

export const OtherDocs: React.FC<{ names: string[] }> = ({ names }) => (
  <div className="border-t border-[var(--fig-border)] mt-2 pt-1 pb-2">
    {names.map((n) => (
      <div key={n} className="mx-1.5 px-2 h-7 flex items-center gap-1.5 rounded-md text-[var(--fig-text-secondary)] hover:bg-[var(--fig-hover)]">
        <ChevronRight className="w-3 h-3" />
        <FileText className="w-3.5 h-3.5" />
        <span className="truncate">{n}</span>
      </div>
    ))}
  </div>
);
