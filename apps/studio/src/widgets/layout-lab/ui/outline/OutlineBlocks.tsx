import React from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Sparkles } from "lucide-react";

import { CURRENT_TREE, OUTLINE_DOC, type NameFrom, type ONode } from "../../model/outline";
import { findNode, useOutlineStore } from "../../model/useOutlineStore";
import { useLabStore } from "../../model/useLabStore";
import { DocHead, FillBar, FORM_ICON, FormChip, focusCanvas, RoleTags } from "./OutlineParts";

const FROM_LABEL: Record<NameFrom, string> = { plan: "기획", template: "서식 정의", label: "칸 머리글", kind: "종류", ai: "AI 제안 받음", human: "사람이 지음" };
const nameFromOf = (n: ONode): NameFrom | null => (n.name ? (n.nameFrom ?? "plan") : null);

/** 상태 점: 이름 필요(주황) · 빈칸(파랑) · 다 채움(초록) · 고정(회색) */
const StatusDot: React.FC<{ node: ONode }> = ({ node }) => {
  const color = !node.name ? "#e8a33d" : node.fixed ? "#cbd5e1" : node.blanks > 0 ? "#0d99ff" : "#0f9d58";
  const title = !node.name ? "이름 필요" : node.fixed ? "고정 글" : node.blanks > 0 ? `빈칸 ${node.blanks}` : "다 채움";
  return <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} title={title} />;
};

/** 블록 한 줄 — 아이콘 + 이름 (+ 꼬리표 · 상태 점). 칸은 트리에 없다. */
const BlockRow: React.FC<{ node: ONode; depth: number; pageId: string }> = ({ node, depth, pageId }) => {
  const selected = useOutlineStore((s) => s.selected === node.id);
  const select = useOutlineStore((s) => s.select);
  const setPage = useLabStore((s) => s.setPage);
  const Icon = node.form ? FORM_ICON[node.form.kind] : FORM_ICON.text;
  const from = nameFromOf(node);
  return (
    <div
      data-testid="o5-row"
      data-node={node.id}
      onClick={() => {
        select(node.id);
        setPage(pageId);
        focusCanvas(node.anchor);
      }}
      title={[from ? `이름 출처: ${FROM_LABEL[from]}` : "이름 필요", node.was ? `지금 트리: ${node.was}` : ""].filter(Boolean).join("\n")}
      className={`fig-row !h-7 gap-1.5 ${node.fixed ? "opacity-60" : ""}`}
      data-sel={selected ? "on" : undefined}
      style={{ paddingLeft: 10 + depth * 18 }}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--fig-text-secondary)]" />
      {node.name ? (
        <span className="fig-row-label">{node.name}</span>
      ) : (
        <span className="fig-row-label flex items-center gap-1">
          <span className="px-1 rounded text-[10px] bg-[#fff1d6] text-[#b26b00]">이름 필요</span>
          <span className="text-[var(--fig-text-tertiary)] truncate">{node.form?.label}</span>
        </span>
      )}
      <RoleTags node={node} />
      <StatusDot node={node} />
    </div>
  );
};

/** 아래 속성 칸 — 피그마의 컴포넌트 속성처럼, 블록 안 칸들은 여기에 이름 · 값으로. */
const Properties: React.FC<{ node: ONode }> = ({ node }) => {
  const accept = useOutlineStore((s) => s.accept);
  const rename = useOutlineStore((s) => s.rename);
  const [draft, setDraft] = React.useState("");
  const from = nameFromOf(node);
  const rows = node.form?.kind === "table" ? Number(/(\d+)행/.exec(node.form.label)?.[1] ?? 0) : 0;

  return (
    <div className="p-3 space-y-3 text-[11.5px]" data-testid="o5-props">
      <div>
        <div className="text-[10.5px] text-[var(--fig-text-tertiary)] mb-0.5">이름</div>
        {node.name ? (
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-[12.5px] truncate">{node.name}</span>
            {from && <span className="shrink-0 px-1 rounded text-[10px] bg-black/[0.05] text-[var(--fig-text-secondary)]">출처 · {FROM_LABEL[from]}</span>}
          </div>
        ) : (
          <div className="space-y-1.5">
            {node.suggestName && (
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-[#9747ff]" />
                <span className="text-[var(--fig-text-secondary)]">AI 제안</span>
                <b>{node.suggestName}</b>
                <button type="button" className="fig-btn !h-5 !px-1.5 ml-auto" onClick={() => accept(node.id)} data-testid="o5-accept-name">
                  받기
                </button>
              </div>
            )}
            <label className="fig-input">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && draft.trim() && rename(node.id, draft)}
                placeholder="직접 이름 짓기 (Enter)"
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <FormChip node={node} />
        <RoleTags node={node} />
        {!node.fixed && (
          <span className="ml-auto flex items-center gap-1.5 text-[10.5px] text-[var(--fig-text-secondary)]">
            <FillBar fill={node.fill} />
            빈칸 {node.blanks}
          </span>
        )}
      </div>

      {node.fields?.length ? (
        node.form?.kind === "table" ? (
          <div>
            <div className="text-[10.5px] text-[var(--fig-text-tertiary)] mb-1">열 {node.fields.length}개 · 행 {rows}개 — 칸 {node.fields.length * rows}개는 트리에 없습니다</div>
            <div className="overflow-x-auto rounded border border-[var(--fig-border)]">
              <table className="w-full text-[10.5px] border-collapse">
                <thead>
                  <tr className="bg-[#f6f7f9]">
                    {node.fields.map((f) => (
                      <th key={f} className="px-1.5 py-1 text-left font-medium border-r last:border-r-0 border-[var(--fig-border)] whitespace-nowrap">{f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0, 1].map((r) => (
                    <tr key={r} className="border-t border-[var(--fig-border)]">
                      {node.fields!.map((f, c) => (
                        <td key={f} className="px-1.5 py-1 border-r last:border-r-0 border-[var(--fig-border)] text-[var(--fig-text-tertiary)]">{c === 0 && f === "번호" ? r + 1 : "빈칸"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-1.5 py-0.5 text-[10px] text-[var(--fig-text-tertiary)] border-t border-[var(--fig-border)]">… {Math.max(0, rows - 2)}행 더</div>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-[10.5px] text-[var(--fig-text-tertiary)] mb-1">칸 {node.fields.length}개 (속성)</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-center">
              {node.fields.map((f) => {
                const v = node.values?.[f];
                return (
                  <React.Fragment key={f}>
                    <span className="text-[var(--fig-text-secondary)] whitespace-nowrap">{f}</span>
                    <span className={`h-6 px-1.5 rounded border flex items-center truncate ${v ? "border-[var(--fig-border)] bg-white" : "border-dashed border-[var(--fig-border)] text-[var(--fig-text-tertiary)]"}`}>
                      {v ?? (node.office ? "기관이 씀" : "빈칸")}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )
      ) : node.fixed ? (
        <p className="text-[var(--fig-text-tertiary)]">고정 글이라 채울 칸이 없습니다.</p>
      ) : null}

      {node.was && (
        <div className="pt-2 border-t border-[var(--fig-border)] text-[10.5px] text-[var(--fig-text-tertiary)] leading-4">
          <span className="font-medium">지금 트리에서는</span> · {node.was}
        </div>
      )}
    </div>
  );
};

const blocksOf = (tree: ONode[]) => tree.flatMap((p) => (p.children ?? []).filter((c) => !c.ghost));

export const OutlineO5: React.FC = () => {
  const tree = useOutlineStore((s) => s.tree);
  const selected = useOutlineStore((s) => s.selected);
  const collapsed = useOutlineStore((s) => s.collapsed);
  const toggle = useOutlineStore((s) => s.toggle);
  const activePage = useLabStore((s) => s.activePage);
  const setPage = useLabStore((s) => s.setPage);
  const [showFixed, setShowFixed] = React.useState(true);
  const blocks = blocksOf(tree);
  const auto = blocks.filter((b) => b.name);
  const byFrom = (f: NameFrom) => auto.filter((b) => nameFromOf(b) === f).length;
  const need = blocks.length - auto.length;
  const sel = selected ? findNode(tree, selected) : null;
  const pageNode = tree.find((p) => p.id === activePage);
  const pageBlocks = (pageNode?.children ?? []).filter((c) => !c.ghost);
  const curRows = CURRENT_TREE.elements[activePage]?.length ?? 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="outline-o5">
      <DocHead title={OUTLINE_DOC.title} purpose={OUTLINE_DOC.purpose} />
      <div className="px-3 pb-2 text-[11px] text-[var(--fig-text-secondary)] space-y-1" data-testid="o5-stats">
        <div className="flex items-center gap-2 flex-wrap">
          <span>블록 {blocks.length}개</span>
          <span className="text-[#0f9d58]">자동 이름 {auto.length}</span>
          <span className="text-[var(--fig-text-tertiary)]">(기획 {byFrom("plan")}* · 머리글 {byFrom("label")} · 서식 {byFrom("template")} · 종류 {byFrom("kind")}{byFrom("ai") ? ` · AI ${byFrom("ai")}` : ""}{byFrom("human") ? ` · 사람 ${byFrom("human")}` : ""})</span>
          {need > 0 && <span className="text-[#b26b00]">이름 필요 {need}</span>}
        </div>
        {pageNode && curRows > 0 && (
          <div>
            {pageNode.page} · 지금 트리 <b className="text-[#c2410c]">{curRows}줄</b> → 블록 <b className="text-[var(--fig-text)]">{pageBlocks.length}줄</b>
          </div>
        )}
        <div className="text-[10.5px] text-[var(--fig-text-tertiary)]">* 1~5쪽은 Phase 1 에서 기획했다고 가정 · 6~7쪽은 PDF 로 가져온 서식이라 기획 이름 없음</div>
        <button type="button" className="fig-link !text-[11px]" onClick={() => setShowFixed((v) => !v)}>
          {showFixed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showFixed ? "고정 글 숨기기" : "고정 글 보기"}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto border-t border-[var(--fig-border)] py-1">
        {tree.map((p) => {
          const kids = (p.children ?? []).filter((c) => !c.ghost && (showFixed || !c.fixed));
          const open = !collapsed[p.id];
          return (
            <div key={p.id}>
              <div
                className="fig-row !h-7 gap-1.5"
                data-sel={activePage === p.id && !selected ? "on" : undefined}
                onClick={() => {
                  toggle(p.id);
                  setPage(p.id);
                  focusCanvas(p.anchor);
                }}
              >
                {open ? <ChevronDown className="w-3 h-3 ml-1 text-[var(--fig-text-tertiary)]" /> : <ChevronRight className="w-3 h-3 ml-1 text-[var(--fig-text-tertiary)]" />}
                <span className="shrink-0 px-1 rounded text-[10px] leading-4 bg-black/[0.06] text-[var(--fig-text-secondary)]">{p.page}</span>
                <span className="fig-row-label font-semibold">{p.name}</span>
                <span className="text-[10.5px] text-[var(--fig-text-tertiary)] shrink-0">{kids.length}</span>
              </div>
              {open && kids.map((b) => <BlockRow key={b.id} node={b} depth={1} pageId={p.id} />)}
            </div>
          );
        })}
      </div>
      <div className="h-[44%] min-h-[200px] shrink-0 border-t border-[var(--fig-border)] overflow-y-auto bg-[#fcfcfd]">
        <div className="h-8 px-3 flex items-center text-[11px] font-semibold border-b border-[var(--fig-border)] bg-white sticky top-0">
          속성 <span className="font-normal text-[var(--fig-text-tertiary)] ml-1.5">블록 안 칸은 여기에서</span>
        </div>
        {sel && !sel.page ? (
          <Properties key={sel.id} node={sel} />
        ) : (
          <p className="p-3 text-[11.5px] text-[var(--fig-text-tertiary)]">블록을 고르면 그 안의 칸이 이름 · 값으로 보입니다. 표는 열 정의 + 행으로.</p>
        )}
      </div>
    </div>
  );
};
