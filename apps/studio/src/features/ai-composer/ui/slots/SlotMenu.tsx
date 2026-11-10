import React, { useState } from "react";
import { Check, ChevronDown, ChevronRight, FileText, Folder, Minus } from "lucide-react";
import type {
  ContextSlot,
  SlotSection,
  SlotState,
  TriNode,
} from "./types";

interface SlotMenuProps {
  slot: ContextSlot;
  state: SlotState;
  align?: "left" | "right";
  onClose: () => void;
}

const MenuDivider: React.FC = () => <div className="my-1 border-t border-slate-100" />;

const SectionHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({
  title,
  action,
}) => (
  <div className="flex items-center justify-between px-3 pt-2 pb-0.5 text-[10.5px] font-bold text-slate-400">
    <span>{title}</span>
    {action}
  </div>
);

/** 왼쪽 3상태 체크박스 부품 */
const TriCheckbox: React.FC<{
  state: "checked" | "unchecked" | "indeterminate";
  disabled?: boolean;
}> = ({ state, disabled }) => {
  if (state === "checked") {
    return (
      <div className="w-3.5 h-3.5 rounded bg-violet-600 flex items-center justify-center shrink-0">
        <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
      </div>
    );
  }
  if (state === "indeterminate") {
    return (
      <div className="w-3.5 h-3.5 rounded bg-violet-600 flex items-center justify-center shrink-0">
        <Minus className="w-2.5 h-2.5 text-white stroke-[3]" />
      </div>
    );
  }
  return (
    <div
      className={`w-3.5 h-3.5 rounded border border-slate-300 bg-white shrink-0 ${
        disabled ? "opacity-40" : ""
      }`}
    />
  );
};

/** 왼쪽 2상태 체크박스 부품 */
const LeftCheckbox: React.FC<{ checked?: boolean; disabled?: boolean }> = ({
  checked,
  disabled,
}) => (
  <TriCheckbox state={checked ? "checked" : "unchecked"} disabled={disabled} />
);

/** 왼쪽 원형 라디오 인디케이터 부품 */
const LeftRadio: React.FC<{ selected?: boolean }> = ({ selected }) => (
  <div
    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
      selected ? "border-violet-600 bg-violet-600" : "border-slate-300 bg-white"
    }`}
  >
    {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
  </div>
);

/** check-list 섹션 렌더러 */
const CheckListSection: React.FC<{
  section: Extract<SlotSection, { kind: "check-list" }>;
}> = ({ section }) => {
  return (
    <div>
      {section.title && (
        <SectionHeader title={section.title} action={section.headerAction} />
      )}
      {section.items.length === 0 ? (
        <div className="px-3 py-2 text-center text-slate-400">
          {section.emptyText || "항목이 없습니다."}
        </div>
      ) : (
        section.items.map((it) => (
          <div
            key={it.id}
            role="menuitemcheckbox"
            aria-checked={it.checked}
            data-testid={it.testId}
            data-checked={it.checked ? "1" : "0"}
            onClick={it.onClick}
            title={it.hint ?? it.title}
            className={`group flex items-center gap-2 px-3 py-1 cursor-pointer select-none hover:bg-slate-50 transition ${
              it.indent ? "pl-8" : ""
            } ${it.disabled ? "pointer-events-none opacity-50" : ""}`}
          >
            <span
              onClick={(e) => {
                if (it.onCheck) {
                  e.stopPropagation();
                  it.onCheck();
                }
              }}
              className="shrink-0 flex items-center"
            >
              <LeftCheckbox checked={it.checked} disabled={it.disabled} />
            </span>
            {it.icon}
            <span
              className={`min-w-0 flex-1 truncate ${
                it.checked ? "text-slate-900 font-medium" : "text-slate-400"
              }`}
            >
              {it.title}
            </span>
            {it.detail && (
              <span className="shrink-0 text-[10.5px] text-slate-400 font-medium">
                {it.detail}
              </span>
            )}
            {it.extraAction && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="shrink-0 ml-1"
              >
                {it.extraAction}
              </span>
            )}
            {it.expand && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  it.expand?.onToggle();
                }}
                className="p-0.5 rounded hover:bg-slate-200 text-slate-400 ml-1"
                title={it.expand.open ? "접기" : "펼치기"}
              >
                {it.expand.open ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
};

/** tri-tree 섹션 렌더러 — 폴더 접기/펼치기 및 문서 단위 선별 지원 */
const TriTreeSection: React.FC<{
  section: Extract<SlotSection, { kind: "tri-tree" }>;
}> = ({ section }) => {
  // 최상위 루트 폴더(depth 0)는 기본적으로 펼쳐서 바로 아래의 주요 폴더들을 보여줌
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () =>
      new Set(
        section.nodes.filter((n) => n.depth === 0 && n.isFolder).map((n) => n.id)
      )
  );
  const [expandedOverflow, setExpandedOverflow] = useState(false);
  const MAX_VISIBLE_FOLDERS = 12;

  const toggleExpand = (nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const renderNode = (node: TriNode): React.ReactNode => {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = expandedIds.has(node.id);

    // 깊이 1 폴더들의 오버플로우 처리
    let childrenToRender = node.children ?? [];
    let showMoreButton = false;
    let overflowCount = 0;

    if (node.depth === 0 && hasChildren && !expandedOverflow) {
      if (childrenToRender.length > MAX_VISIBLE_FOLDERS) {
        overflowCount = childrenToRender.length - MAX_VISIBLE_FOLDERS;
        childrenToRender = childrenToRender.slice(0, MAX_VISIBLE_FOLDERS);
        showMoreButton = true;
      }
    }

    return (
      <React.Fragment key={node.id}>
        <div
          role="menuitemcheckbox"
          aria-checked={node.state === "checked"}
          data-testid={node.testId || "settings-source-item"}
          data-checked={node.state === "checked" ? "1" : "0"}
          onClick={node.onClick}
          title={node.hint ?? node.title}
          style={{ paddingLeft: `${node.depth * 14 + 10}px` }}
          className="group flex items-center gap-1.5 pr-2 py-1 cursor-pointer select-none hover:bg-slate-50 transition"
        >
          <TriCheckbox state={node.state} />
          {node.isFolder ? (
            <Folder className="w-3.5 h-3.5 text-violet-500 shrink-0" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <span
            className={`min-w-0 flex-1 truncate ${
              node.state !== "unchecked"
                ? "text-slate-900 font-medium"
                : "text-slate-400"
            }`}
          >
            {node.title}
          </span>
          {node.meta && (
            <span className="shrink-0 text-[10.5px] text-slate-400 font-medium">
              {node.meta}
            </span>
          )}
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="p-0.5 rounded hover:bg-slate-200 text-slate-400 shrink-0 cursor-pointer ml-0.5"
              title={isExpanded ? "접기" : "펼치기 (하위 문서 보기)"}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* 펼쳐졌을 때 자식 노드들(하위 폴더 및 문서들) 렌더링 */}
        {hasChildren && isExpanded && (
          <div>
            {childrenToRender.map((child) => renderNode(child))}
            {showMoreButton && (
              <button
                type="button"
                onClick={() => setExpandedOverflow(true)}
                style={{ paddingLeft: `${(node.depth + 1) * 14 + 10}px` }}
                className="w-full text-left pr-3 py-1 text-[11px] text-violet-600 hover:bg-violet-50 font-medium cursor-pointer"
              >
                … {overflowCount}개 더 보기
              </button>
            )}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div>
      {section.title && (
        <SectionHeader title={section.title} action={section.headerAction} />
      )}
      {section.nodes.length === 0 ? (
        <div className="px-3 py-2 text-center text-slate-400">
          {section.emptyText || "RM 에서 원본을 체크하세요."}
        </div>
      ) : (
        section.nodes.map((rootNode) => renderNode(rootNode))
      )}
    </div>
  );
};

/** radio 섹션 렌더러 */
const RadioSection: React.FC<{
  section: Extract<SlotSection, { kind: "radio" }>;
}> = ({ section }) => {
  return (
    <div>
      {section.title && (
        <SectionHeader title={section.title} action={section.headerAction} />
      )}
      {section.options.map((opt) => {
        const selected = section.value === opt.id;
        return (
          <div
            key={opt.id}
            role="menuitemradio"
            aria-checked={selected}
            data-testid={opt.testId}
            onClick={() => section.onChange(opt.id)}
            title={opt.hint ?? opt.label}
            className="group flex items-center gap-2 px-3 py-1 cursor-pointer select-none hover:bg-slate-50 transition"
          >
            <LeftRadio selected={selected} />
            <span
              className={`min-w-0 flex-1 truncate ${
                selected ? "text-slate-900 font-semibold" : "text-slate-600 font-normal"
              }`}
            >
              {opt.label}
            </span>
            {opt.detail && (
              <span className="shrink-0 text-[10.5px] text-slate-400 font-medium">
                {opt.detail}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** note 섹션 렌더러 */
const NoteSection: React.FC<{
  section: Extract<SlotSection, { kind: "note" }>;
}> = ({ section }) => (
  <div
    className="px-3 py-1 text-[11px] text-slate-600 truncate"
    data-testid={section.testId}
  >
    {section.text}
  </div>
);

/** action 섹션 렌더러 */
const ActionSection: React.FC<{
  section: Extract<SlotSection, { kind: "action" }>;
}> = ({ section }) => {
  const { item } = section;
  return (
    <div
      role="menuitem"
      data-testid={item.testId}
      onClick={item.onClick}
      className="group flex items-center gap-2 px-3 py-1 cursor-pointer select-none hover:bg-slate-50 transition"
    >
      {item.icon}
      <span className="min-w-0 flex-1 truncate text-slate-700 font-medium">
        {item.title}
      </span>
      {item.detail && (
        <span className="shrink-0 text-[10.5px] text-slate-400 font-medium">
          {item.detail}
        </span>
      )}
      {item.checked && <Check className="w-3.5 h-3.5 text-violet-600 shrink-0" />}
    </div>
  );
};

export const SlotMenu: React.FC<SlotMenuProps> = ({
  slot,
  state,
  align = "left",
  onClose,
}) => {
  const { header, sections, footer, banner } = state;

  return (
    <div
      data-testid={slot.testIds.menu}
      role="menu"
      className={`absolute bottom-full mb-1 ${
        align === "right" ? "right-0" : "left-0"
      } z-50 w-[300px] max-w-[calc(100vw-32px)] max-h-[60vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl text-[12px] overflow-hidden select-none`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 배너 영역 (범위의 새 초점 제안 등) */}
      {banner && <div className="shrink-0">{banner}</div>}

      {/* 헤더 영역: 슬롯 라벨 + [모두 켜기 · 모두 끄기] */}
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 shrink-0">
        <span className="font-semibold text-slate-800 flex items-center gap-1.5 text-[11.5px]">
          {slot.icon}
          {slot.label}
        </span>
        <div className="flex items-center gap-1 text-[10px]">
          {header?.allOn && (
            <button
              type="button"
              onClick={header.allOn}
              className="px-1.5 py-0.5 rounded text-violet-600 hover:bg-violet-50 cursor-pointer font-semibold transition"
            >
              모두 켜기
            </button>
          )}
          {header?.allOn && header?.allOff && (
            <span className="text-slate-300">|</span>
          )}
          {header?.allOff && (
            <button
              type="button"
              onClick={header.allOff}
              className="px-1.5 py-0.5 rounded text-slate-500 hover:bg-slate-100 cursor-pointer transition"
            >
              모두 끄기
            </button>
          )}
          {header?.extra}
        </div>
      </div>

      {/* 본문 섹션들 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto py-1 space-y-0.5">
        {sections.map((section, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <MenuDivider />}
            {section.kind === "check-list" && (
              <CheckListSection section={section} />
            )}
            {section.kind === "tri-tree" && <TriTreeSection section={section} />}
            {section.kind === "radio" && <RadioSection section={section} />}
            {section.kind === "note" && <NoteSection section={section} />}
            {section.kind === "action" && <ActionSection section={section} />}
            {section.kind === "custom" && section.content}
          </React.Fragment>
        ))}
      </div>

      {/* 푸터 영역: 안내 문구 + 관리 열기 링크 */}
      {footer && (
        <div className="p-2 border-t border-slate-100 bg-slate-50/60 flex justify-between items-center text-[10px] shrink-0">
          <span className="text-slate-400 truncate mr-2">
            {footer.hint || ""}
          </span>
          {footer.manage && (
            <button
              type="button"
              onClick={() => {
                onClose();
                footer.manage?.onClick();
              }}
              className="shrink-0 px-2 py-1 rounded bg-slate-200/80 hover:bg-slate-300/80 text-slate-700 cursor-pointer font-medium transition"
            >
              {footer.manage.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

