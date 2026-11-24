/**
 * 인스펙터 — 캔버스에서 여러 개를 골랐을 때.
 * 공통 속성은 블록 종류 레지스트리(`editableProps`)에서 뽑고, 값이 다르면 "혼합"으로 보인다.
 * 일괄 동작: 잠금 · 숨기기 · 지우기 (잠긴 블록은 바꾸지 않는다) · AI 에 보내기.
 */
import React, { useMemo } from "react";
import { EyeOff, Lock, Sparkles, Trash2, X } from "lucide-react";
import type { CanvasSelection, VDocUiBridgeStore } from "@vibe/canvas-state";
import {
  MIXED_VALUE,
  commonEditableProps,
  findBlock,
  getBlockKind,
  patchBlocksProps,
  removeBlocks,
  toggleBlocksLock,
  type LayoutBlock,
  type VDocDocument,
} from "@vibe/vdoc-schema";

export interface MultiSelectionInspectorProps {
  readonly path: string;
  readonly doc: VDocDocument;
  readonly selection: CanvasSelection;
  readonly bridge: VDocUiBridgeStore;
  readonly mutateDoc: (updater: (prev: VDocDocument) => VDocDocument) => void;
  /** 고른 것을 AI Composer 첨부로 보낸다 (없으면 버튼 숨김). */
  readonly onSendToAi?: () => void;
}

const chip =
  "flex items-center gap-1 rounded border border-[var(--obs-border,#363636)] px-2 py-1 text-[11px] text-[var(--obs-text-muted,#b3b3b3)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#ececec)] disabled:opacity-40";

export const MultiSelectionInspector: React.FC<MultiSelectionInspectorProps> = ({
  path,
  doc,
  selection,
  bridge,
  mutateDoc,
  onSendToAi,
}) => {
  const rows = useMemo(
    () =>
      selection.items.map((it) => {
        if (it.kind === "slot") {
          const slot = doc.slots[it.id];
          return { key: `${it.kind}:${it.id}`, label: slot?.label || it.id, kind: "칸", locked: Boolean(slot?.constraints?.locked) };
        }
        const bid = it.kind === "block" ? it.id : (it.blockId ?? it.id);
        const loc = findBlock(doc, bid);
        return {
          key: `${it.kind}:${it.id}`,
          label: loc?.block.title || loc?.block.kind || it.id,
          kind: loc ? (getBlockKind(loc.block.kind).label ?? loc.block.kind) : it.kind,
          locked: Boolean(loc?.block.locked),
        };
      }),
    [doc, selection]
  );
  const blockIds = useMemo(() => selection.items.filter((i) => i.kind === "block").map((i) => i.id), [selection]);
  const blocks = useMemo(
    () => blockIds.map((id) => findBlock(doc, id)?.block).filter((b): b is LayoutBlock => Boolean(b)),
    [doc, blockIds]
  );
  const common = useMemo(() => commonEditableProps(blocks), [blocks]);
  const sameKind = blocks.length > 0 && blocks.every((b) => b.kind === blocks[0].kind);

  return (
    <div className="space-y-3" data-testid="v2-multi-inspector">
      <section className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-sky-200">{selection.items.length}개 선택</span>
          <button type="button" className={chip} onClick={() => bridge.getState().clearSelection(path)} title="선택 해제 (Esc)">
            <X className="h-3 w-3" /> 해제
          </button>
        </div>
        <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[11px]">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-1.5 truncate text-[var(--obs-text-muted,#b3b3b3)]">
              <span className="shrink-0 rounded bg-white/5 px-1 text-[10px]">{r.kind}</span>
              <span className="truncate text-[var(--obs-text-normal,#dadada)]">{r.label}</span>
              {r.locked && <Lock className="h-3 w-3 shrink-0 opacity-60" />}
            </li>
          ))}
        </ul>
      </section>

      {(blockIds.length > 0 || onSendToAi) && (
        <section className="flex flex-wrap gap-1.5">
          {blockIds.length > 0 && (
            <>
              <button type="button" className={chip} onClick={() => mutateDoc((prev) => toggleBlocksLock(prev, blockIds))}>
                <Lock className="h-3 w-3" /> 잠금 전환
              </button>
              <button
                type="button"
                className={chip}
                onClick={() => blockIds.forEach((id) => bridge.getState().toggleHiddenBlock(path, id))}
              >
                <EyeOff className="h-3 w-3" /> 숨기기 전환
              </button>
              <button
                type="button"
                className={`${chip} hover:!text-rose-300`}
                onClick={() => {
                  mutateDoc((prev) => removeBlocks(prev, blockIds).doc);
                  bridge.getState().clearSelection(path);
                }}
              >
                <Trash2 className="h-3 w-3" /> 지우기
              </button>
            </>
          )}
          {/* 칸만 골라도 AI 첨부는 보인다 (칸 채우기가 가장 흔한 요청) */}
          {onSendToAi && (
            <button type="button" className={`${chip} !border-[var(--obs-accent,#8a5cf5)]/50 !text-[#c4b5fd]`} onClick={onSendToAi}>
              <Sparkles className="h-3 w-3" /> AI 에 첨부
            </button>
          )}
        </section>
      )}

      {common.length > 0 && (
        <section className="rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5">
          <div className="mb-2 text-[11px] font-semibold text-[var(--obs-text-normal,#dadada)]">
            공통 속성 {sameKind ? `· ${getBlockKind(blocks[0].kind).label ?? blocks[0].kind} ${blocks.length}개` : `· 블록 ${blocks.length}개`}
          </div>
          <div className="space-y-2">
            {common.map((p) => (
              <label key={p.key} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[var(--obs-text-muted,#b3b3b3)]" title={p.spec.description}>
                  {p.spec.description}
                </span>
                {p.spec.type === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={p.value === true}
                    ref={(el) => {
                      if (el) el.indeterminate = p.value === MIXED_VALUE;
                    }}
                    onChange={(e) => mutateDoc((prev) => patchBlocksProps(prev, blockIds, { [p.key]: e.target.checked }))}
                  />
                ) : p.spec.enum ? (
                  <select
                    className="max-w-[150px] rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-1 py-0.5"
                    value={p.value === MIXED_VALUE || p.value === undefined ? "" : String(p.value)}
                    onChange={(e) => e.target.value && mutateDoc((prev) => patchBlocksProps(prev, blockIds, { [p.key]: e.target.value }))}
                  >
                    <option value="">{p.value === MIXED_VALUE ? "(혼합)" : "—"}</option>
                    {p.spec.enum.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-[150px] rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-1 py-0.5"
                    type={p.spec.type === "number" ? "number" : "text"}
                    placeholder={p.value === MIXED_VALUE ? "(혼합)" : ""}
                    defaultValue={p.value === MIXED_VALUE || p.value === undefined ? "" : String(p.value)}
                    onBlur={(e) => {
                      const raw = e.target.value;
                      if (!raw) return;
                      const v = p.spec.type === "number" ? Number(raw) : raw;
                      mutateDoc((prev) => patchBlocksProps(prev, blockIds, { [p.key]: v }));
                    }}
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
