import React from "react";

import { blockIcon, getBlockView, type BlockControlApi } from "@vibe/slot-canvas";
import { findBlock, getBlockKind, mapBlock, type LayoutBlock } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";

import { ToolButton, ToolDivider } from "./toolbar-parts";

/** 파일 고르기 창 하나 (취소 · 창 닫힘이면 null). */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * 위쪽 서식 툴바의 "블록 도구" — 고른 블록의 종류 전용 조작 (블록 뷰 정의의 `controls`).
 * 모든 블록 종류가 같은 자리 · 같은 모양을 쓴다. 블록 안에 따로 툴바를 띄우지 않는다.
 */
export const BlockControlsGroup: React.FC = () => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const mode = useStudioDocumentStore((s) => s.mode);
  const selectedBlockId = useSlotSelectionStore((s) => s.selectedBlockId);
  if (!doc || !selectedBlockId || mode !== "Editing") return null;
  const loc = findBlock(doc, selectedBlockId);
  if (!loc) return null;
  const view = getBlockView(loc.block.kind);
  const model = getBlockKind(loc.block.kind);

  const api: BlockControlApi = {
    updateBlock: (updater: (prev: LayoutBlock) => LayoutBlock) =>
      useStudioDocumentStore
        .getState()
        .updateCurrentDoc((d) => mapBlock(d, loc.pageId, loc.block.blockId, updater), { history: true, label: `${model.label} 블록 수정` }),
    pickFile,
    prompt: (message, initial) => window.prompt(message, initial ?? ""),
  };
  const controls = view.controls?.(loc.block, api) ?? [];
  if (controls.length === 0) return null;
  const locked = Boolean(loc.block.locked);

  return (
    <>
      <span
        data-testid="block-controls-group"
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600"
        title={`${model.label} 블록 도구`}
      >
        {React.createElement(blockIcon(model.icon), { className: "h-3.5 w-3.5 text-slate-500" })}
        {model.label}
      </span>
      {controls.map((control, i) => {
        const Icon = control.icon;
        const newGroup = i > 0 && control.group !== controls[i - 1].group;
        return (
          <React.Fragment key={control.id}>
            {newGroup && <ToolDivider />}
            <ToolButton
              data-testid={`block-control-${control.id}`}
              title={locked ? `${control.label} (잠긴 블록)` : control.label}
              active={control.active}
              disabled={locked || control.disabled}
              onClick={() => void control.run()}
              className={control.showLabel ? "gap-1 px-2 text-[12px]" : ""}
            >
              <Icon className="h-4 w-4" />
              {control.showLabel && <span>{control.label}</span>}
            </ToolButton>
          </React.Fragment>
        );
      })}
      <ToolDivider />
    </>
  );
};
