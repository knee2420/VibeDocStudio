import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Plus,
  PlusCircle,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  SCHEMA_IR_PRIMITIVES,
  type ElementRegistrySnapshot,
  type ElementSyntaxDefinition,
  type ElementSyntaxRule,
  type SchemaIrPrimitive,
  type SyntaxRulePosition,
} from "@vibe/vdoc-schema";
import type { VaultPort } from "@vibe/vault-core";

import {
  detectSyntaxRuleConflicts,
  getDefaultRuleSymbol,
  isSyntaxRuleModified,
  parseSyntaxSnapshot,
  serializeSyntaxSnapshot,
} from "@vibe/vault-formats";
import { CodeTabEditor } from "../CodeTabEditor";
import { CodeAsDocHeader } from "./ObsidianSettingsPrimitives";

type SyntaxFilterTab = "conflict" | "all" | "assigned" | "modified" | "unassigned";

const PRIMITIVE_LABELS: Record<SchemaIrPrimitive, string> = {
  stack: "세로 스택",
  split: "가로 분할",
  span: "셀 병합",
  frame: "프레임 박스",
  accent: "강조 바",
  kv: "키-값 메타",
  slot: "슬롯",
  embed: "임베드",
};

const RULE_NAME_KO: Record<string, string> = {
  "tree-rowspan": "트리 들여쓰기 세로 병합 (rowspan)",
  "col-split": "열 구분",
  "empty-slot": "빈 칸 입력 슬롯",
  "merge-left": "왼쪽 기준 병합 (colspan)",
  "merge-up": "위쪽 칸과 병합 (rowspan)",
  "tree-group": "트리 들여쓰기 컨테이너 묶음",
  "horizontal-split": "가로 병렬 분할 · 사진 스트립",
  "frame-box": "인용구 · 정보 프레임 박스",
  "accent-bar": "팁 · 형광펜 강조 바",
  "kv-meta": "경량 Key-Value 메타 행",
  "divider-line": "시각적 구분선",
  "image-slot": "이미지 슬롯",
  "cta-slot": "할인 · 액션 CTA 슬롯",
  "embed-slot": "확장형 외부 임베드 슬롯",
  "inline-highlight": "본문 인라인 형광펜 강조",
};

export interface SyntaxSettingsViewProps {
  readonly vault: VaultPort;
  readonly path: string;
  /** Optional element ID filter when opened from a specific Element item in the Settings sidebar. */
  readonly scopeElementId?: string | null;
  readonly onOpenInTab?: () => void;
}

/**
 * Obsidian 1.15 `단축키(Hotkeys)` 화면을 80%+ 패리티로 재현한 `.vsyntax` 비주얼 설정 뷰.
 * 파일 탭(`.vsyntax`)과 전역 설정 모달(`⚙️`) 양쪽에서 동일 컴포넌트로 재사용된다.
 */
export const SyntaxSettingsView: React.FC<SyntaxSettingsViewProps> = ({
  vault,
  path,
  scopeElementId = null,
  onOpenInTab,
}) => {
  const [snapshot, setSnapshot] = useState<ElementRegistrySnapshot>(() =>
    parseSyntaxSnapshot(vault.exists(path) ? vault.read(path) : "")
  );
  const [sourceMode, setSourceMode] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [symbolOnlySearch, setSymbolOnlySearch] = useState(false);
  const [activeTab, setActiveTab] = useState<SyntaxFilterTab>("all");
  const [editingRuleKey, setEditingRuleKey] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");

  // Inline "+ 새 규칙 추가" form
  const [addingRule, setAddingRule] = useState(false);
  const [newRuleElId, setNewRuleElId] = useState<string>(scopeElementId ?? "section");
  const [newRuleSymbol, setNewRuleSymbol] = useState("");
  const [newRuleDesc, setNewRuleDesc] = useState("");
  const [newRulePrimitive, setNewRulePrimitive] = useState<SchemaIrPrimitive>("slot");
  const [newRulePosition, setNewRulePosition] = useState<SyntaxRulePosition>("prefix");

  // Inline "+ 새 요소 추가" form
  const [addingElement, setAddingElement] = useState(false);
  const [newElId, setNewElId] = useState("");
  const [newElLabel, setNewElLabel] = useState("");
  const [newElDesc, setNewElDesc] = useState("");

  const localWriteRef = useRef(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const customRuleSeqRef = useRef(1);

  const effectiveNewRuleElId =
    scopeElementId ??
    (snapshot.elements.some((e) => e.id === newRuleElId)
      ? newRuleElId
      : (snapshot.elements[0]?.id ?? "section"));

  useEffect(() => {
    if (editingRuleKey) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingRuleKey]);

  useEffect(() => {
    const reload = () => {
      if (!vault.exists(path)) return;
      setSnapshot(parseSyntaxSnapshot(vault.read(path)));
    };
    reload();
    return vault.subscribe((ev) => {
      if (localWriteRef.current) return;
      if ((ev.type === "modify" && ev.path === path) || ev.type === "vault-reset") {
        reload();
      }
    });
  }, [vault, path]);

  const commitSnapshot = (updater: (prev: ElementRegistrySnapshot) => ElementRegistrySnapshot) => {
    const next = updater(snapshot);
    setSnapshot(next);
    localWriteRef.current = true;
    try {
      vault.write(path, serializeSyntaxSnapshot(next));
    } finally {
      localWriteRef.current = false;
    }
  };

  const scopedElements = useMemo(
    () =>
      scopeElementId
        ? snapshot.elements.filter((el) => el.id === scopeElementId)
        : snapshot.elements,
    [snapshot.elements, scopeElementId]
  );

  const conflictReport = useMemo(
    () => detectSyntaxRuleConflicts(snapshot, scopeElementId),
    [snapshot, scopeElementId]
  );

  interface FlatRuleRow {
    readonly key: string;
    readonly element: ElementSyntaxDefinition;
    readonly rule: ElementSyntaxRule;
    readonly title: string;
    readonly isConflicted: boolean;
    readonly isModified: boolean;
    readonly isAssigned: boolean;
  }

  const allRows = useMemo<FlatRuleRow[]>(() => {
    const out: FlatRuleRow[] = [];
    for (const element of scopedElements) {
      for (const rule of element.rules) {
        const key = `${element.id}:${rule.id}`;
        const label = RULE_NAME_KO[rule.id] ?? rule.id;
        out.push({
          key,
          element,
          rule,
          title: scopeElementId ? label : `${element.label.split("(")[0].trim()}: ${label}`,
          isConflicted: conflictReport.conflictedRuleKeys.has(key),
          isModified: isSyntaxRuleModified(element.id, rule),
          isAssigned: rule.symbol.trim().length > 0,
        });
      }
    }
    return out;
  }, [scopedElements, scopeElementId, conflictReport]);

  const filteredRows = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return allRows.filter((row) => {
      if (activeTab === "conflict" && !row.isConflicted) return false;
      if (activeTab === "assigned" && !row.isAssigned) return false;
      if (activeTab === "modified" && !row.isModified) return false;
      if (activeTab === "unassigned" && row.isAssigned) return false;
      if (!q) return true;
      if (symbolOnlySearch) {
        return row.rule.symbol.toLowerCase().includes(q);
      }
      return (
        row.title.toLowerCase().includes(q) ||
        row.rule.description.toLowerCase().includes(q) ||
        row.rule.symbol.toLowerCase().includes(q) ||
        row.rule.primitive.toLowerCase().includes(q) ||
        row.element.viewTag.toLowerCase().includes(q)
      );
    });
  }, [allRows, activeTab, filterQuery, symbolOnlySearch]);

  const updateRuleSymbol = (elementId: string, ruleId: string, nextSymbol: string) => {
    commitSnapshot((prev) => ({
      ...prev,
      elements: prev.elements.map((el) =>
        el.id !== elementId
          ? el
          : {
              ...el,
              rules: el.rules.map((r) =>
                r.id !== ruleId ? r : { ...r, symbol: nextSymbol.trim() }
              ),
            }
      ),
    }));
  };

  const deleteCustomRule = (elementId: string, ruleId: string) => {
    commitSnapshot((prev) => ({
      ...prev,
      elements: prev.elements.map((el) =>
        el.id !== elementId ? el : { ...el, rules: el.rules.filter((r) => r.id !== ruleId) }
      ),
    }));
  };

  const handleAddRule = (ev: React.FormEvent) => {
    ev.preventDefault();
    const sym = newRuleSymbol.trim();
    const desc = newRuleDesc.trim();
    if (!sym || !desc) return;
    const existingIds = new Set(
      snapshot.elements.flatMap((el) => el.rules.map((r) => r.id))
    );
    let seq = customRuleSeqRef.current;
    while (existingIds.has(`custom-${seq}`)) seq += 1;
    customRuleSeqRef.current = seq + 1;
    const ruleId = `custom-${seq}`;
    commitSnapshot((prev) => ({
      ...prev,
      elements: prev.elements.map((el) =>
        el.id !== effectiveNewRuleElId
          ? el
          : {
              ...el,
              rules: [
                ...el.rules,
                {
                  id: ruleId,
                  symbol: sym,
                  primitive: newRulePrimitive,
                  position: newRulePosition,
                  description: desc,
                },
              ],
            }
      ),
    }));
    setNewRuleSymbol("");
    setNewRuleDesc("");
    setAddingRule(false);
  };

  const handleAddElement = (ev: React.FormEvent) => {
    ev.preventDefault();
    const cleanId = newElId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
    const label = newElLabel.trim();
    if (!cleanId || !label) return;
    if (snapshot.elements.some((e) => e.id === cleanId)) return;
    commitSnapshot((prev) => ({
      ...prev,
      elements: [
        ...prev.elements,
        {
          id: cleanId,
          viewTag: cleanId,
          version: "1.0.0",
          label,
          description: newElDesc.trim() || `${label} 커스텀 요소 규격`,
          allowedInViews: ["blog", "web", "a4"],
          defaultSkin: "default",
          fallbackPolicy: "plain-text",
          rules: [],
        },
      ],
    }));
    setNewElId("");
    setNewElLabel("");
    setNewElDesc("");
    setAddingElement(false);
  };

  const scopedTitle = scopeElementId
    ? `${scopedElements[0]?.label ?? scopeElementId} (<<view:${scopedElements[0]?.viewTag ?? scopeElementId}>>)`
    : "표현 기호 · 요소 규격";

  if (sourceMode) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)]">
        <div className="shrink-0 border-b border-[var(--obs-border-subtle,#2d2d2d)] px-6 pt-4 pb-1">
          <CodeAsDocHeader
            title={scopedTitle}
            subtitle={path}
            sourceMode={sourceMode}
            onToggleSource={() => setSourceMode(false)}
            onOpenInTab={onOpenInTab}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <CodeTabEditor vault={vault} path={path} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--obs-bg-primary,#1e1e1e)] px-6 py-7 text-[var(--obs-text-normal,#dadada)]">
      <div className="mx-auto max-w-[780px]">
        <CodeAsDocHeader
          title={scopedTitle}
          subtitle={`${path} · v${snapshot.version} · ${allRows.length}개 기호 규칙`}
          sourceMode={sourceMode}
          onToggleSource={() => setSourceMode(true)}
          onOpenInTab={onOpenInTab}
        />

        {/* Obsidian 1.15 Centered Hotkey Card Container */}
        <div className="rounded-xl border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#242424)] p-5 shadow-sm">
          {/* 1. Full-width Obsidian Filter Input + Symbol Filter Icon */}
          <div className="flex h-9 items-center gap-2 rounded-[6px] border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1b1b1b)] px-3 focus-within:border-[var(--obs-accent,#8a5cf5)]">
            <Search className="h-4 w-4 shrink-0 text-[var(--obs-text-faint,#7a7a7a)]" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={
                symbolOnlySearch ? "기호로 필터... (예: ::, |, >, [img])" : "필터..."
              }
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--obs-text-normal,#e2e2e2)] placeholder:text-[var(--obs-text-faint,#737373)] outline-none"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery("")}
                className="text-[var(--obs-text-faint,#7a7a7a)] hover:text-[var(--obs-text-normal,#dadada)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setSymbolOnlySearch((v) => !v)}
              title="기호 문자열만 검색 토글"
              aria-pressed={symbolOnlySearch}
              className={`rounded p-1 transition-colors ${
                symbolOnlySearch
                  ? "bg-[rgba(138,92,245,0.22)] text-[#c4b5fd]"
                  : "text-[var(--obs-text-faint,#7a7a7a)] hover:text-[var(--obs-text-normal,#dadada)]"
              }`}
            >
              <Keyboard className="h-4 w-4" />
            </button>
          </div>

          {/* 2. Obsidian Filter Pill Bar (충돌 N | 전체 | 할당됨 | 내가 수정한 기호 | 미할당됨) */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("conflict")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  activeTab === "conflict"
                    ? "bg-[#b91c1c] text-white"
                    : conflictReport.totalConflicts > 0
                      ? "bg-[#4d2020] text-[#fca5a5] hover:bg-[#5e2727]"
                      : "bg-[#2e2e2e] text-[var(--obs-text-faint,#7a7a7a)] hover:text-[var(--obs-text-muted,#b3b3b3)]"
                }`}
              >
                <span>충돌</span>
                <span className="font-code text-[11px]">{conflictReport.totalConflicts}</span>
              </button>

              {(
                [
                  { id: "all", label: "전체" },
                  { id: "assigned", label: "할당됨" },
                  { id: "modified", label: "내가 수정한 기호" },
                  { id: "unassigned", label: "미할당됨" },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                      active
                        ? "bg-[var(--obs-accent,#8a5cf5)] text-white"
                        : "bg-[#2e2e2e] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[#383838] hover:text-[var(--obs-text-normal,#e6e6e6)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAddingElement(false);
                  setAddingRule((v) => !v);
                }}
                className="inline-flex items-center gap-1 rounded-[5px] border border-[var(--obs-border,#383838)] bg-[#2b2b2b] px-2.5 py-1 text-[11.5px] text-[var(--obs-text-normal,#dadada)] hover:bg-[#363636]"
              >
                <Plus className="h-3.5 w-3.5 text-[#a68af9]" />
                <span>규칙 추가</span>
              </button>
              {!scopeElementId && (
                <button
                  type="button"
                  onClick={() => {
                    setAddingRule(false);
                    setAddingElement((v) => !v);
                  }}
                  className="inline-flex items-center gap-1 rounded-[5px] border border-[var(--obs-border,#383838)] bg-[#2b2b2b] px-2.5 py-1 text-[11.5px] text-[var(--obs-text-normal,#dadada)] hover:bg-[#363636]"
                >
                  <Plus className="h-3.5 w-3.5 text-emerald-400" />
                  <span>새 요소</span>
                </button>
              )}
            </div>
          </div>

          {/* Inline CRUD Form: Add New Rule */}
          {addingRule && (
            <form
              onSubmit={handleAddRule}
              className="mb-3 rounded-lg border border-[var(--obs-accent,#8a5cf5)]/50 bg-[#1c1c1c] p-3 text-[12px]"
            >
              <div className="mb-2 font-semibold text-[#c4b5fd]">새 표현 기호 규칙 추가</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                {!scopeElementId && (
                  <select
                    value={effectiveNewRuleElId}
                    onChange={(e) => setNewRuleElId(e.target.value)}
                    className="rounded border border-[#383838] bg-[#262626] px-2 py-1.5 text-[12px] outline-none"
                  >
                    {snapshot.elements.map((el) => (
                      <option key={el.id} value={el.id}>
                        {el.label}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  value={newRuleSymbol}
                  onChange={(e) => setNewRuleSymbol(e.target.value)}
                  placeholder="기호 (예: =>, [map])"
                  required
                  className="rounded border border-[#383838] bg-[#262626] px-2.5 py-1.5 font-code text-[12px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                />
                <select
                  value={newRulePrimitive}
                  onChange={(e) => setNewRulePrimitive(e.target.value as SchemaIrPrimitive)}
                  className="rounded border border-[#383838] bg-[#262626] px-2 py-1.5 text-[12px] outline-none"
                >
                  {SCHEMA_IR_PRIMITIVES.map((p) => (
                    <option key={p} value={p}>
                      IR: {PRIMITIVE_LABELS[p]} ({p})
                    </option>
                  ))}
                </select>
                <select
                  value={newRulePosition}
                  onChange={(e) => setNewRulePosition(e.target.value as SyntaxRulePosition)}
                  className="rounded border border-[#383838] bg-[#262626] px-2 py-1.5 text-[12px] outline-none"
                >
                  <option value="prefix">앞 접두 (prefix)</option>
                  <option value="infix">중간 구분 (infix)</option>
                  <option value="bracket">대괄호 슬롯 (bracket)</option>
                  <option value="inline">인라인 감싸기 (inline)</option>
                  <option value="line">단독 줄 (line)</option>
                </select>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={newRuleDesc}
                  onChange={(e) => setNewRuleDesc(e.target.value)}
                  placeholder="역할 설명 (예: 지도 임베드 슬롯)"
                  required
                  className="min-w-0 flex-1 rounded border border-[#383838] bg-[#262626] px-2.5 py-1.5 text-[12px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                />
                <button
                  type="submit"
                  className="rounded bg-[var(--obs-accent,#8a5cf5)] px-3 py-1.5 font-medium text-white hover:opacity-90"
                >
                  등록
                </button>
                <button
                  type="button"
                  onClick={() => setAddingRule(false)}
                  className="rounded border border-[#383838] px-2.5 py-1.5 text-[var(--obs-text-muted,#b3b3b3)]"
                >
                  취소
                </button>
              </div>
            </form>
          )}

          {/* Inline CRUD Form: Add New Element */}
          {addingElement && (
            <form
              onSubmit={handleAddElement}
              className="mb-3 rounded-lg border border-emerald-500/40 bg-[#1c1c1c] p-3 text-[12px]"
            >
              <div className="mb-2 font-semibold text-emerald-300">
                새 요소 규격(Element) 추가 (`&lt;&lt;view:id&gt;&gt;`)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newElId}
                  onChange={(e) => setNewElId(e.target.value)}
                  placeholder="영문 ID (예: faq, timeline)"
                  required
                  className="w-40 rounded border border-[#383838] bg-[#262626] px-2.5 py-1.5 font-code text-[12px] outline-none"
                />
                <input
                  type="text"
                  value={newElLabel}
                  onChange={(e) => setNewElLabel(e.target.value)}
                  placeholder="표시 이름 (예: FAQ 아코디언)"
                  required
                  className="w-44 rounded border border-[#383838] bg-[#262626] px-2.5 py-1.5 text-[12px] outline-none"
                />
                <input
                  type="text"
                  value={newElDesc}
                  onChange={(e) => setNewElDesc(e.target.value)}
                  placeholder="설명"
                  className="min-w-[160px] flex-1 rounded border border-[#383838] bg-[#262626] px-2.5 py-1.5 text-[12px] outline-none"
                />
                <button
                  type="submit"
                  className="rounded bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500"
                >
                  생성
                </button>
                <button
                  type="button"
                  onClick={() => setAddingElement(false)}
                  className="rounded border border-[#383838] px-2.5 py-1.5 text-[var(--obs-text-muted,#b3b3b3)]"
                >
                  취소
                </button>
              </div>
            </form>
          )}

          {/* 3. Obsidian Hotkey-Style Row List */}
          <div className="divide-y divide-[#2f2f2f] border-t border-[#2f2f2f]">
            {filteredRows.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[var(--obs-text-faint,#7a7a7a)]">
                조건에 맞는 기호 규칙이 없습니다.
              </div>
            ) : (
              filteredRows.map((row) => {
                const isEditing = editingRuleKey === row.key;
                const defaultSym = getDefaultRuleSymbol(row.element.id, row.rule.id);
                const isCustomRule = defaultSym === undefined;

                return (
                  <div
                    key={row.key}
                    className={`flex min-h-[50px] items-center justify-between gap-4 py-2.5 transition-colors ${
                      row.isConflicted ? "bg-[#3d1c1c]/40 px-2 -mx-2 rounded" : ""
                    }`}
                  >
                    {/* Left: Command / Role Name + Description */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium text-[var(--obs-text-normal,#e4e4e4)]">
                          {row.title}
                        </span>
                        <span className="shrink-0 rounded bg-[#2f2f2f] px-1.5 py-0.5 font-code text-[10px] text-[var(--obs-text-faint,#8c8c8c)]">
                          {PRIMITIVE_LABELS[row.rule.primitive] ?? row.rule.primitive}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-[var(--obs-text-faint,#868686)]">
                        {row.rule.description}
                      </div>
                    </div>

                    {/* Right: Obsidian Keycap Pill + Reset + PlusCircle */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isEditing ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            updateRuleSymbol(row.element.id, row.rule.id, editingDraft);
                            setEditingRuleKey(null);
                          }}
                          className="flex items-center gap-1"
                        >
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editingDraft}
                            onChange={(e) => setEditingDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.stopPropagation();
                                setEditingRuleKey(null);
                              }
                            }}
                            onBlur={() => {
                              updateRuleSymbol(row.element.id, row.rule.id, editingDraft);
                              setEditingRuleKey(null);
                            }}
                            placeholder="기호 입력..."
                            className="h-7 w-28 rounded-[5px] border border-[var(--obs-accent,#8a5cf5)] bg-[#191919] px-2 font-code text-[12px] text-[#e9e2ff] outline-none ring-2 ring-[rgba(138,92,245,0.28)]"
                          />
                        </form>
                      ) : row.isAssigned ? (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-[5px] border px-2 py-0.5 font-code text-[12px] ${
                            row.isConflicted
                              ? "border-[#ef4444]/60 bg-[#592525] text-[#fecaca]"
                              : "border-[#3c3c3c] bg-[#2e2e2e] text-[var(--obs-text-normal,#e2e2e2)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRuleKey(row.key);
                              setEditingDraft(row.rule.symbol);
                            }}
                            title="클릭하여 기호 변경"
                            className="hover:text-white"
                          >
                            {row.rule.symbol}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateRuleSymbol(row.element.id, row.rule.id, "")}
                            title="기호 할당 해제"
                            className="text-[var(--obs-text-faint,#888)] hover:text-white"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ) : (
                        <span className="rounded-[5px] bg-[#2c2c2c] px-2.5 py-0.5 text-[11.5px] text-[var(--obs-text-faint,#7a7a7a)]">
                          미할당됨
                        </span>
                      )}

                      {row.isModified && defaultSym !== undefined && (
                        <button
                          type="button"
                          onClick={() => updateRuleSymbol(row.element.id, row.rule.id, defaultSym)}
                          title={`기본 기호(${defaultSym})로 복원`}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--obs-text-faint,#7a7a7a)] hover:bg-[#333] hover:text-[var(--obs-text-normal,#dadada)]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {isCustomRule && (
                        <button
                          type="button"
                          onClick={() => deleteCustomRule(row.element.id, row.rule.id)}
                          title="커스텀 규칙 삭제"
                          className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--obs-text-faint,#7a7a7a)] hover:bg-[#3d1c1c] hover:text-[#fca5a5]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setEditingRuleKey(row.key);
                          setEditingDraft(row.rule.symbol);
                        }}
                        title="기호 지정 · 수정"
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[#333] hover:text-white"
                      >
                        <PlusCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
