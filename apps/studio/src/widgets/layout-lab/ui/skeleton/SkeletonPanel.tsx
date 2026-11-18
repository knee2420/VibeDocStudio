import React from "react";
import {
  AlignLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderClosed,
  GripVertical,
  Heading,
  Image as ImageIcon,
  Info,
  ListTodo,
  MoreHorizontal,
  PenLine,
  Plus,
  Repeat,
  RotateCcw,
  ScrollText,
  Sparkles,
  Stamp,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";

import { itemById } from "../../model/dummy";
import type { FilledBy, SlotType } from "../../model/schema";
import { fillOf, findSk, flattenSk, PART_LIBRARY, partLabel, type PartKind, type SkNode, type SkRow } from "../../model/skeleton";
import { useLabStore } from "../../model/useLabStore";
import { useSkeletonStore, type DropPos, type Phase } from "../../model/useSkeletonStore";
import { FillBar } from "../outline/OutlineParts";

export const PART_ICON: Record<PartKind, LucideIcon> = {
  title: Heading,
  text: AlignLeft,
  meta: Info,
  repeat: Repeat,
  list: ListTodo,
  sign: PenLine,
  approval: Stamp,
  image: ImageIcon,
  notice: ScrollText,
};

const KEY_FONT: React.CSSProperties = { fontFamily: 'ui-monospace, "SF Mono", Consolas, "Pretendard", "Malgun Gothic", monospace' };

/** 캔버스의 그 블록으로 */
export function revealOnCanvas(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-sk="${id}"]`);
  el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

const InlineInput: React.FC<{ value: string; placeholder: string; onDone: (v: string) => void; onCancel: () => void; small?: boolean }> = ({
  value,
  placeholder,
  onDone,
  onCancel,
  small,
}) => {
  const [v, setV] = React.useState(value);
  return (
    <input
      autoFocus
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone(v);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onDone(v)}
      className={`flex-1 min-w-0 px-1 rounded border border-[var(--fig-brand)] outline-none bg-white ${small ? "h-5 text-[11px]" : "h-6 text-[12px]"}`}
      data-testid="sk-input"
    />
  );
};

/** ⋯ 메뉴 */
const RowMenu: React.FC<{ node: SkNode; phase: Phase; onClose: () => void }> = ({ node, phase, onClose }) => {
  const st = useSkeletonStore.getState();
  const selected = useSkeletonStore((s) => s.selected);
  const [parts, setParts] = React.useState(false);
  const ids = selected.includes(node.id) ? selected : [node.id];
  const item = (icon: LucideIcon, label: string, fn: () => void, danger?: boolean) => {
    const I = icon;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          fn();
          onClose();
        }}
        className={`w-full h-7 px-2 rounded flex items-center gap-2 text-left text-[12px] ${danger ? "hover:bg-[#ffe5e5] hover:text-[#d92d20]" : "hover:bg-[var(--fig-hover)]"}`}
      >
        <I className="w-3.5 h-3.5" />
        {label}
      </button>
    );
  };
  return (
    <div className="fig-panel absolute right-1 top-7 z-50 w-[200px] rounded-lg bg-white border border-[var(--fig-border)] shadow-xl p-1" onClick={(e) => e.stopPropagation()} data-testid="sk-menu">
      {item(PenLine, "이름 바꾸기 (F2)", () => st.setEditing({ id: node.id, field: "name" }))}
      {node.kind === "section" && item(AlignLeft, "의도 쓰기", () => st.setEditing({ id: node.id, field: "intent" }))}
      {node.kind === "section" && item(Plus, "하위 섹션 추가", () => st.addSection(node.id, true))}
      {phase >= 2 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setParts((p) => !p);
            }}
            className="w-full h-7 px-2 rounded flex items-center gap-2 text-left text-[12px] hover:bg-[var(--fig-hover)]"
            data-testid="sk-menu-parts"
          >
            <Repeat className="w-3.5 h-3.5" />
            {node.kind === "section" ? "서식 꽂기" : "서식 바꾸기"}
            <ChevronRight className={`w-3 h-3 ml-auto ${parts ? "rotate-90" : ""}`} />
          </button>
          {parts && (
            <div className="pl-3 pb-1">
              {PART_LIBRARY.map((p) => {
                const I = PART_ICON[p.kind];
                return (
                  <button
                    key={p.kind}
                    type="button"
                    data-testid={`sk-part-${p.kind}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      st.assignPart(node.id, p.kind);
                      onClose();
                    }}
                    className="w-full h-6 px-2 rounded flex items-center gap-1.5 text-[11.5px] hover:bg-[var(--fig-hover)]"
                    title={p.desc}
                  >
                    <I className="w-3 h-3" />
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      {phase === 3 && node.kind === "block" && item(Sparkles, "AI 로 채우기", () => st.aiFill(node.id))}
      {item(Copy, "복제 (Ctrl+D)", () => st.duplicate(ids))}
      {ids.length > 1 && item(FolderClosed, `${ids.length}개 묶기 (Ctrl+G)`, () => st.group(ids))}
      <div className="my-1 border-t border-[var(--fig-border)]" />
      {item(Trash2, `삭제${ids.length > 1 ? ` (${ids.length})` : ""}`, () => st.remove(ids), true)}
    </div>
  );
};

/** 트리 한 줄 — 끌기 · 놓기 (사이 / 안으로) · 고르기 · 이름 · 의도 */
const Row: React.FC<{
  row: SkRow;
  phase: Phase;
  drag: React.MutableRefObject<string[]>;
  drop: { id: string; pos: DropPos } | null;
  setDrop: (d: { id: string; pos: DropPos } | null) => void;
}> = ({ row, phase, drag, drop, setDrop }) => {
  const { node, depth, num, hasChildren } = row;
  const selected = useSkeletonStore((s) => s.selected.includes(node.id));
  const editing = useSkeletonStore((s) => (s.editing?.id === node.id ? s.editing.field : null));
  const collapsed = useSkeletonStore((s) => !!s.collapsed[node.id]);
  const st = useSkeletonStore.getState();
  const [menu, setMenu] = React.useState(false);
  const isSection = node.kind === "section";
  const Icon = isSection ? FolderClosed : PART_ICON[node.part ?? "text"];
  const blocks = node.children.filter((c) => c.kind === "block").length;
  const fill = fillOf(node);
  const dropHere = drop?.id === node.id ? drop.pos : null;

  return (
    <div
      data-testid="sk-row"
      data-node={node.id}
      draggable={!editing}
      onDragStart={(e) => {
        const sel = useSkeletonStore.getState().selected;
        drag.current = sel.includes(node.id) ? sel : [node.id];
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", node.id);
      }}
      onDragOver={(e) => {
        if (!drag.current.length) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const y = (e.clientY - r.top) / r.height;
        const pos: DropPos = isSection && y > 0.28 && y < 0.72 ? "inside" : y < 0.5 ? "before" : "after";
        if (dropHere !== pos) setDrop({ id: node.id, pos });
      }}
      onDragLeave={() => dropHere && setDrop(null)}
      onDrop={(e) => {
        e.preventDefault();
        if (drop) st.moveTo(drag.current, node.id, drop.pos);
        drag.current = [];
        setDrop(null);
      }}
      onDragEnd={() => {
        drag.current = [];
        setDrop(null);
      }}
      onClick={(e) => {
        st.select(node.id, e.shiftKey ? "range" : e.metaKey || e.ctrlKey ? "toggle" : "only");
        revealOnCanvas(node.id);
      }}
      className={`group relative mx-1.5 rounded-md pr-1 flex items-start gap-1 cursor-default ${
        node.ghost ? "border border-dashed border-[#9747ff]/50 bg-[#9747ff]/[0.04]" : selected ? "bg-[var(--fig-selected)]" : "hover:bg-[var(--fig-hover)]"
      } ${dropHere === "inside" ? "ring-2 ring-[var(--fig-brand)]" : ""}`}
      style={{ paddingLeft: 2 + depth * 16 }}
    >
      {dropHere === "before" && <span className="absolute left-2 right-2 -top-[1px] h-[2px] bg-[var(--fig-brand)] rounded" />}
      {dropHere === "after" && <span className="absolute left-2 right-2 -bottom-[1px] h-[2px] bg-[var(--fig-brand)] rounded" />}
      <GripVertical className="w-3 h-3 mt-[7px] shrink-0 text-[var(--fig-text-tertiary)] opacity-0 group-hover:opacity-100 cursor-grab" />
      <button
        type="button"
        className={`w-4 h-6 shrink-0 flex items-center justify-center text-[var(--fig-text-tertiary)] ${hasChildren ? "" : "invisible"}`}
        onClick={(e) => {
          e.stopPropagation();
          st.toggle(node.id);
        }}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      <div className="min-w-0 flex-1 py-1">
        <div className="flex items-center gap-1.5 min-w-0 h-5">
          {node.ghost ? <Sparkles className="w-3.5 h-3.5 shrink-0 text-[#9747ff]" /> : <Icon className={`w-3.5 h-3.5 shrink-0 ${isSection ? "text-[var(--fig-text-secondary)]" : "text-[#7a3bd6]"}`} />}
          {num && <span className="text-[11px] tabular-nums text-[var(--fig-text-tertiary)] shrink-0">{num}</span>}
          {editing === "name" ? (
            <InlineInput
              value={node.name}
              placeholder={isSection ? "섹션 이름 — 이 부분이 무엇인지" : "블록 이름"}
              onDone={(v) => (v.trim() ? st.rename(node.id, v) : node.name ? st.setEditing(null) : st.remove([node.id]))}
              onCancel={() => (node.name ? st.setEditing(null) : st.remove([node.id]))}
            />
          ) : (
            <span
              className={`truncate ${isSection ? "font-medium" : ""} ${node.name ? "" : "text-[var(--fig-text-tertiary)] italic"}`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                st.setEditing({ id: node.id, field: "name" });
              }}
            >
              {node.name || "이름 없음"}
            </span>
          )}
          {phase === 1 && isSection && blocks > 0 && <span className="shrink-0 text-[10px] text-[var(--fig-text-tertiary)]">블록 {blocks}</span>}
          {phase === 2 && !isSection && node.name !== partLabel(node.part) && <span className="shrink-0 text-[10px] px-1 rounded bg-[#9747ff]/10 text-[#7a3bd6]">{partLabel(node.part)}</span>}
          {phase === 2 && isSection && blocks === 0 && !node.ghost && <span className="shrink-0 text-[10px] text-[#b26b00]">서식 없음</span>}
          {phase === 3 && <span className="shrink-0 ml-auto pr-12"><FillBar fill={fill} /></span>}
        </div>
        {isSection && (phase === 1 || editing === "intent") && (
          <div className="pl-5 pr-14">
            {editing === "intent" ? (
              <InlineInput small value={node.intent} placeholder="여기서 말할 것 (의도)" onDone={(v) => st.setIntent(node.id, v)} onCancel={() => st.setEditing(null)} />
            ) : (
              <span
                className={`block truncate text-[11px] ${node.intent ? "text-[var(--fig-text-secondary)]" : "text-[var(--fig-text-tertiary)] italic"}`}
                onClick={(e) => {
                  if (!selected) return;
                  e.stopPropagation();
                  st.setEditing({ id: node.id, field: "intent" });
                }}
              >
                {node.intent || "의도 쓰기 — 눌러서"}
              </span>
            )}
          </div>
        )}
      </div>
      {node.ghost ? (
        <span className="flex items-center gap-0.5 shrink-0 mt-0.5">
          <button type="button" className="fig-icon-btn" title="받기" data-testid="sk-accept" onClick={(e) => { e.stopPropagation(); st.accept(node.id); }}>
            <Check className="w-3.5 h-3.5 text-[#0f9d58]" />
          </button>
          <button type="button" className="fig-icon-btn" title="버리기" onClick={(e) => { e.stopPropagation(); st.dismiss(node.id); }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ) : (
        <span className={`absolute right-1 top-0.5 flex items-center gap-0.5 ${menu ? "" : "opacity-0 group-hover:opacity-100"}`}>
          {isSection && (
            <button type="button" className="fig-icon-btn bg-white" title="아래에 섹션 추가 (Enter)" data-testid="sk-add-after" onClick={(e) => { e.stopPropagation(); st.addSection(node.id); }}>
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            className="fig-icon-btn bg-white"
            title="더보기"
            data-testid="sk-more"
            onClick={(e) => {
              e.stopPropagation();
              if (!selected) st.select(node.id);
              setMenu((m) => !m);
            }}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </span>
      )}
      {menu && <RowMenu node={node} phase={phase} onClose={() => setMenu(false)} />}
    </div>
  );
};

const TYPES: SlotType[] = ["text", "longtext", "date", "period", "number", "phone", "idno", "choice", "check", "sign", "image"];
const BYS: { v: FilledBy; l: string }[] = [
  { v: "author", l: "작성자" },
  { v: "applicant", l: "신청인" },
  { v: "agency", l: "기관" },
  { v: "approver", l: "결재자" },
];

/** 아래 상세 — 섹션: 이름 · 의도 · 서식 꽂기 / 블록: 서식 · 칸 스키마(2) · 값(3) */
const Detail: React.FC<{ phase: Phase }> = ({ phase }) => {
  const nodes = useSkeletonStore((s) => s.docs[s.docId].nodes);
  const selected = useSkeletonStore((s) => s.selected);
  const st = useSkeletonStore.getState();
  const node = selected.length === 1 ? findSk(nodes, selected[0]) : null;
  if (selected.length > 1)
    return (
      <div className="p-3 text-[11.5px] space-y-2">
        <div>{selected.length}개 선택됨</div>
        <div className="flex gap-1">
          <button type="button" className="fig-btn" onClick={() => st.group(selected)}><FolderClosed className="w-3 h-3" />묶기</button>
          <button type="button" className="fig-btn" onClick={() => st.duplicate(selected)}><Copy className="w-3 h-3" />복제</button>
          <button type="button" className="fig-btn" onClick={() => st.remove(selected)}><Trash2 className="w-3 h-3" />삭제</button>
        </div>
      </div>
    );
  if (!node) return <p className="p-3 text-[11.5px] text-[var(--fig-text-tertiary)]">노드를 고르면 여기서 이름 · 의도 · 서식 · 칸을 고칩니다.</p>;

  if (node.kind === "section")
    return (
      <div className="p-3 space-y-2 text-[11.5px]" data-testid="sk-detail-section">
        <label className="block">
          <span className="text-[10.5px] text-[var(--fig-text-tertiary)]">섹션 이름</span>
          <input key={`n-${node.id}`} defaultValue={node.name} onBlur={(e) => st.rename(node.id, e.target.value)} className="fig-input w-full mt-0.5 !px-2" />
        </label>
        <label className="block">
          <span className="text-[10.5px] text-[var(--fig-text-tertiary)]">의도 — 여기서 말할 것 (AI 가 읽는다)</span>
          <textarea key={`i-${node.id}`} defaultValue={node.intent} onBlur={(e) => st.setIntent(node.id, e.target.value)} rows={2} className="fig-textarea w-full mt-0.5" />
        </label>
        {phase >= 2 && (
          <div>
            <div className="text-[10.5px] text-[var(--fig-text-tertiary)] mb-1">서식 꽂기 — 이 섹션에 부품 추가</div>
            <div className="grid grid-cols-3 gap-1">
              {PART_LIBRARY.map((p) => {
                const I = PART_ICON[p.kind];
                return (
                  <button key={p.kind} type="button" className="fig-btn !justify-start" title={p.desc} onClick={() => st.assignPart(node.id, p.kind)} data-testid={`sk-detail-part-${p.kind}`}>
                    <I className="w-3 h-3" />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );

  const slots = node.slots ?? [];
  const repeat = node.part === "repeat" || node.part === "list";
  return (
    <div className="p-3 space-y-2 text-[11.5px]" data-testid="sk-detail-block">
      <div className="flex items-center gap-1.5">
        <input key={`bn-${node.id}`} defaultValue={node.name} onBlur={(e) => st.rename(node.id, e.target.value)} className="fig-input flex-1 !px-2" />
        <select value={node.part} onChange={(e) => st.assignPart(node.id, e.target.value as PartKind)} className="h-6 rounded border border-[var(--fig-border)] text-[11px] px-1 bg-white">
          {PART_LIBRARY.map((p) => (
            <option key={p.kind} value={p.kind}>{p.label}</option>
          ))}
        </select>
      </div>
      {repeat && (
        <label className="flex items-center gap-2 text-[11px]">
          <span className="text-[var(--fig-text-secondary)]">행 수</span>
          <input type="number" min={1} max={30} value={node.rows ?? 1} onChange={(e) => st.setRows(node.id, Number(e.target.value))} className="w-14 h-6 rounded border border-[var(--fig-border)] px-1" />
          <span className="text-[var(--fig-text-tertiary)]">표는 열 정의 + 행 — 칸 {(node.rows ?? 1) * slots.length}개</span>
        </label>
      )}
      {node.part === "notice" ? (
        <p className="text-[var(--fig-text-tertiary)]">고정 글 — 칸이 없고 AI 에게 규칙으로 갑니다.</p>
      ) : phase === 3 ? (
        <div className="space-y-1">
          <div className="flex items-center">
            <span className="text-[10.5px] text-[var(--fig-text-tertiary)]">칸 값</span>
            <button type="button" className="fig-btn ml-auto !h-6" onClick={() => st.aiFill(node.id)} data-testid="sk-ai-fill">
              <Sparkles className="w-3 h-3 text-[#9747ff]" />AI 로 채우기
            </button>
          </div>
          {slots.map((s) => (
            <label key={s.key} className="grid grid-cols-[96px_1fr] items-center gap-2">
              <span className="truncate text-[var(--fig-text-secondary)]" title={s.key}>{s.label}</span>
              <input
                key={`${s.key}-${s.value ?? ""}`}
                defaultValue={s.value ?? ""}
                disabled={!(s.filledBy === "author" || s.filledBy === "applicant")}
                placeholder={s.filledBy === "agency" ? "기관이 씀" : s.filledBy === "approver" ? "결재자가 씀" : s.sensitive ? "사람이 직접 (민감정보)" : "빈칸"}
                onBlur={(e) => e.target.value !== (s.value ?? "") && st.updateSlot(node.id, s.key, { value: e.target.value || undefined })}
                className="h-6 rounded border border-[var(--fig-border)] px-1.5 disabled:bg-[#f6f7f9]"
              />
            </label>
          ))}
        </div>
      ) : (
        <div>
          <div className="text-[10.5px] text-[var(--fig-text-tertiary)] mb-1">칸 스키마 — 데이터 키 · 타입 · 누가 · AI</div>
          <div className="space-y-1">
            {slots.map((s) => (
              <div key={s.key} className="rounded-md border border-[var(--fig-border)] p-1.5 space-y-1" data-testid="sk-slot">
                <div className="flex items-center gap-1">
                  <code style={KEY_FONT} className="text-[10.5px] truncate flex-1">{s.key}</code>
                  <button type="button" className="fig-icon-btn !w-5 !h-5" title="칸 삭제" onClick={() => st.removeSlot(node.id, s.key)}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <input key={`l-${s.key}`} defaultValue={s.label} onBlur={(e) => e.target.value !== s.label && st.updateSlot(node.id, s.key, { label: e.target.value })} className="flex-1 min-w-0 h-6 rounded border border-[var(--fig-border)] px-1.5" />
                  <select value={s.type} onChange={(e) => st.updateSlot(node.id, s.key, { type: e.target.value as SlotType })} className="h-6 rounded border border-[var(--fig-border)] text-[10.5px] bg-white">
                    {TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <select value={s.filledBy} onChange={(e) => st.updateSlot(node.id, s.key, { filledBy: e.target.value as FilledBy })} className="h-6 rounded border border-[var(--fig-border)] text-[10.5px] bg-white">
                    {BYS.map((b) => (
                      <option key={b.v} value={b.v}>{b.l}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-0.5 text-[10.5px] shrink-0" title="AI 가 채워도 되나">
                    <input type="checkbox" checked={s.aiFillable} onChange={(e) => st.updateSlot(node.id, s.key, { aiFillable: e.target.checked })} className="accent-[#9747ff]" />
                    AI
                  </label>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="fig-btn mt-1.5" onClick={() => st.addSlot(node.id)} data-testid="sk-add-slot">
            <Plus className="w-3 h-3" />칸 추가
          </button>
        </div>
      )}
    </div>
  );
};

const PHASES: { id: Phase; label: string }[] = [
  { id: 1, label: "1 뼈대" },
  { id: 2, label: "2 서식" },
  { id: 3, label: "3 내용" },
];

/** O7 — 뼈대 편집 */
export const SkeletonPanel: React.FC = () => {
  const docs = useSkeletonStore((s) => s.docs);
  const docId = useSkeletonStore((s) => s.docId);
  const phase = useSkeletonStore((s) => s.phase);
  const collapsed = useSkeletonStore((s) => s.collapsed);
  const log = useSkeletonStore((s) => s.log);
  const canUndo = useSkeletonStore((s) => s.undoStack.length > 0);
  const st = useSkeletonStore.getState();
  const openRefId = useLabStore((s) => s.openRefId);
  const doc = docs[docId];
  const rows = flattenSk(doc.nodes, collapsed, phase);
  const drag = React.useRef<string[]>([]);
  const [drop, setDrop] = React.useState<{ id: string; pos: DropPos } | null>(null);
  const [logOpen, setLogOpen] = React.useState(true);
  const ref = openRefId ? itemById(openRefId) : undefined;
  const refSkeleton = ref?.skeleton?.filter((p) => p.t === "text").map((p) => ({ label: (p as { label: string }).label }));

  // 키보드 — 입력 중이 아닐 때만
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const s = useSkeletonStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        s.undo();
        return;
      }
      const sel = s.selected;
      const cur = sel[0];
      const list = flattenSk(s.docs[s.docId].nodes, s.collapsed, s.phase);
      const i = list.findIndex((r) => r.node.id === cur);
      if (e.key === "Enter") {
        e.preventDefault();
        const node = cur ? findSk(s.docs[s.docId].nodes, cur) : null;
        s.addSection(node?.kind === "section" ? cur : null);
      } else if (!cur) return;
      else if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) s.outdent(cur);
        else s.indent(cur);
      } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        s.nudge(cur, e.key === "ArrowUp" ? -1 : 1);
      } else if (e.key === "ArrowDown" && i < list.length - 1) {
        e.preventDefault();
        s.select(list[i + 1].node.id);
        revealOnCanvas(list[i + 1].node.id);
      } else if (e.key === "ArrowUp" && i > 0) {
        e.preventDefault();
        s.select(list[i - 1].node.id);
        revealOnCanvas(list[i - 1].node.id);
      } else if (e.key === "F2") {
        e.preventDefault();
        s.setEditing({ id: cur, field: "name" });
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicate(sel);
      } else if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        s.group(sel);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.remove(sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="outline-o7">
      <div className="px-2 pt-2 space-y-1.5 shrink-0">
        <div className="fig-seg" role="group" aria-label="문서">
          <button type="button" aria-pressed={docId === "doc-new"} onClick={() => st.setDoc("doc-new")} data-testid="sk-doc-new">새 문서 (뼈대부터)</button>
          <button type="button" aria-pressed={docId === "doc-absence"} onClick={() => st.setDoc("doc-absence")} data-testid="sk-doc-import">가져온 서식 · 시험 불참원</button>
        </div>
        <div className="flex items-center gap-1">
          <div className="fig-seg flex-1" role="group" aria-label="단계">
            {PHASES.map((p) => (
              <button key={p.id} type="button" aria-pressed={phase === p.id} onClick={() => st.setPhase(p.id)} data-testid={`sk-phase-${p.id}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" className="fig-icon-btn" title="되돌리기 (Ctrl+Z)" disabled={!canUndo} onClick={() => st.undo()} data-testid="sk-undo">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" className="fig-icon-btn" title="더미 처음으로" onClick={() => st.reset()}>
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
        <input
          value={doc.purpose}
          onChange={(e) => st.setPurpose(e.target.value)}
          placeholder="문서 목적 — 예: 신제품 출시 보도자료, 분기 사업 보고서"
          className="fig-input w-full !px-2"
          data-testid="sk-purpose"
        />
        <div className="flex items-center gap-1 flex-wrap">
          {phase === 1 && (
            <button type="button" className="fig-btn" onClick={() => st.suggestOutline(refSkeleton)} data-testid="sk-suggest-outline">
              <Sparkles className="w-3 h-3 text-[#9747ff]" />
              {refSkeleton?.length ? "레퍼런스 뼈대로 목차 제안" : "AI 목차 제안"}
            </button>
          )}
          {phase === 2 && (
            <button type="button" className="fig-btn" onClick={() => st.suggestParts()} data-testid="sk-suggest-parts">
              <Sparkles className="w-3 h-3 text-[#9747ff]" />AI 서식 추천
            </button>
          )}
          <button type="button" className="fig-btn" onClick={() => st.addSection(null)} data-testid="sk-add-root">
            <Plus className="w-3 h-3" />섹션
          </button>
          <span className="text-[10.5px] text-[var(--fig-text-tertiary)] ml-auto">{phase === 1 ? "섹션만 · 블록은 개수로" : phase === 2 ? "섹션 + 서식 블록" : "칸 채움"}</span>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto mt-1.5 border-t border-[var(--fig-border)] py-1"
        onClick={(e) => e.target === e.currentTarget && st.clearSelect()}
        data-testid="sk-tree"
      >
        {rows.length === 0 && (
          <div className="m-3 p-3 rounded-lg border border-dashed border-[var(--fig-border)] text-[11.5px] text-[var(--fig-text-secondary)] leading-5">
            빈 뼈대입니다. 목적을 쓰고 <b>AI 목차 제안</b> 을 누르거나, <b>Enter</b> · <b>+ 섹션</b> 으로 섹션을 추가하세요.
            {refSkeleton?.length ? <div className="text-[#7a3bd6]">레퍼런스 '{ref?.title}' 가 열려 있어 그 흐름으로 제안할 수 있습니다.</div> : null}
          </div>
        )}
        {rows.map((r) => (
          <Row key={r.node.id} row={r} phase={phase} drag={drag} drop={drop} setDrop={setDrop} />
        ))}
        {rows.length > 0 && (
          <p className="mx-3 mt-2 text-[10.5px] leading-4 text-[var(--fig-text-tertiary)]">
            끌어서 옮기기 (가운데 = 안으로) · Enter 새 섹션 · Tab/Shift+Tab · Alt+↑↓ · F2 · Ctrl+D · Ctrl+G 묶기 · Delete · Ctrl+Z
          </p>
        )}
      </div>

      <div className="h-[36%] min-h-[190px] shrink-0 border-t border-[var(--fig-border)] flex flex-col bg-[#fcfcfd]">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Detail phase={phase} />
        </div>
        <div className="border-t border-[var(--fig-border)] shrink-0">
          <button type="button" onClick={() => setLogOpen((o) => !o)} className="w-full h-7 px-3 flex items-center gap-1.5 text-[11px] font-medium hover:bg-[var(--fig-hover)]">
            {logOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}명령 기록 <span className="font-normal text-[var(--fig-text-tertiary)]">{log.length}</span>
          </button>
          {logOpen && (
            <div className="max-h-[96px] overflow-y-auto px-3 pb-1.5 space-y-0.5" data-testid="sk-log">
              {log.length === 0 && <p className="text-[10.5px] text-[var(--fig-text-tertiary)]">편집하면 사람 · AI 모두 같은 명령으로 남습니다.</p>}
              {[...log].reverse().slice(0, 12).map((c, i) => (
                <div key={`${c.at}-${i}`} className="flex items-center gap-1.5 text-[10.5px] min-w-0">
                  <code style={KEY_FONT} className={`shrink-0 px-1 rounded ${c.by === "ai" ? "bg-[#9747ff]/10 text-[#7a3bd6]" : "bg-black/[0.05] text-[var(--fig-text-secondary)]"}`}>{c.op}</code>
                  <span className="truncate">{c.text}</span>
                  {c.by === "ai" && <span className="shrink-0 text-[#7a3bd6]">AI</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
