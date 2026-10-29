import React, { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Paperclip,
  ArrowUp,
  Check,
  RotateCcw,
  X,
  FileText,
  Wand2,
  ListChecks,
  Minimize2,
} from "lucide-react";

import type { VDocSlot, BackdataChunk } from "@vibe/vdoc-schema";

export interface SynthesizeSlotParams {
  slot: VDocSlot;
  chunks: BackdataChunk[];
  prompt: string;
  presetId?: string;
}

export interface ComponentAttachedComposerProps {
  targetSlot: VDocSlot;
  boundChunks: BackdataChunk[];
  onApplySlotContent: (slotId: string, newHtml: string) => void;
  onSynthesizeSlotContent?: (params: SynthesizeSlotParams) => Promise<string>;
  onOpenBackdataDrawer?: (chunkId?: string) => void;
  onClose: () => void;
  /** Prompt to run as soon as the composer opens (from the selection AI bar). */
  initialPrompt?: string;
}

const QUICK_PRESETS = [
  {
    id: "ground-summary",
    label: "백데이터 기반 핵심 요약 채우기",
    icon: FileText,
    prompt: "연결된 백데이터 원문을 근거로 핵심 내용만 명확하게 요약해 채워줘",
  },
  {
    id: "bullet-3",
    label: "3줄 개조식 불릿 변환",
    icon: ListChecks,
    prompt: "이 슬롯의 공간 제약에 맞춰 3줄 이내 개조식 불릿 리스트로 압축해줘",
  },
  {
    id: "executive-tone",
    label: "제안서·공문서 전문 톤 다듬기",
    icon: Wand2,
    prompt: "수치와 핵심 키워드를 굵게 강조하고 의사결정권자용 간결한 문체로 다듬어줘",
  },
  {
    id: "compact-fit",
    label: "슬롯 줄 수 제약에 맞게 축약",
    icon: Minimize2,
    prompt: "레이아웃이 절대 넘치지 않도록 핵심 결론 1~2문장으로 고밀도 축약해줘",
  },
];

/**
 * Pure deterministic grounded fallback synthesis when no external harness callback is injected.
 */
export async function synthesizeGroundedSlotFallback(
  params: SynthesizeSlotParams
): Promise<string> {
  const { slot, chunks, prompt, presetId } = params;
  await new Promise((r) => setTimeout(r, 240));

  const primaryExcerpt =
    chunks.map((c) => c.excerpt).join(" ") ||
    slot.content.replace(/<[^>]+>/g, "").trim();
  const sentences = primaryExcerpt
    .split(/(?<=[.!?다])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (presetId === "bullet-3" || prompt.includes("개조식") || prompt.includes("불릿")) {
    const items = (sentences.length > 0 ? sentences.slice(0, 3) : [primaryExcerpt])
      .map((s) => `<li>${s}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  }

  if (presetId === "compact-fit" || prompt.includes("축약") || prompt.includes("압축")) {
    const first = sentences[0] || primaryExcerpt;
    return `<p><strong>[핵심 요약]</strong> ${first}</p>`;
  }

  if (presetId === "executive-tone") {
    const srcTag = chunks[0] ? ` <em>(근거: ${chunks[0].sourceTitle})</em>` : "";
    return `<p><strong>■ ${slot.label}:</strong> ${sentences.slice(0, 2).join(" ")}${srcTag}</p>`;
  }

  if (chunks.length > 0) {
    const bulletPoints = chunks
      .map(
        (c) =>
          `<li><strong>[${c.sourceTitle}]</strong> ${c.excerpt}</li>`
      )
      .join("");
    return `<p><strong>✨ AI 백데이터 종합 (${prompt}):</strong></p><ul>${bulletPoints}</ul>`;
  }

  return `<p><strong>✨ [${slot.label}]</strong> ${primaryExcerpt} — <em>(${prompt} 반영 완료)</em></p>`;
}

/**
 * Component-Attached Inline Floating AI Composer
 * Combines `Novel` (`AISelector` cmdk bar) + `assistant-ui` (`ComposerPrimitive` context pills & preview).
 * Attaches directly to the selected block/slot on the canvas so the user's eyes never leave the document.
 */
export const ComponentAttachedComposer: React.FC<
  ComponentAttachedComposerProps
> = ({
  targetSlot,
  boundChunks,
  onApplySlotContent,
  onSynthesizeSlotContent,
  onOpenBackdataDrawer,
  onClose,
  initialPrompt,
}) => {
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState("");

  const runCompose = async (promptText: string, presetId?: string) => {
    if (!promptText.trim()) return;
    setIsGenerating(true);
    setLastPrompt(promptText);
    try {
      const synthesize = onSynthesizeSlotContent ?? synthesizeGroundedSlotFallback;
      const html = await synthesize({
        slot: targetSlot,
        chunks: boundChunks,
        prompt: promptText,
        presetId,
      });
      setPreviewHtml(html);
    } finally {
      setIsGenerating(false);
    }
  };

  const ranInitial = useRef<string | null>(null);
  useEffect(() => {
    if (initialPrompt && ranInitial.current !== initialPrompt) {
      ranInitial.current = initialPrompt;
      setPrompt(initialPrompt);
      void runCompose(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-2 rounded-xl bg-slate-900 text-slate-100 shadow-2xl border border-emerald-500/50 overflow-hidden transition-all z-30"
    >
      {/* 1. Context Pills Header (`assistant-ui` Attachment Pills style) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-950/80 border-b border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
            <Sparkles className="w-3 h-3" />
            타겟 슬롯: {targetSlot.label}
          </span>

          {boundChunks.length > 0 ? (
            boundChunks.map((chunk) => (
              <button
                key={chunk.chunkId}
                type="button"
                onClick={() => onOpenBackdataDrawer?.(chunk.chunkId)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30 transition cursor-pointer"
                title={chunk.excerpt}
              >
                <Paperclip className="w-3 h-3 text-indigo-400" />
                {chunk.sourceTitle}
              </button>
            ))
          ) : (
            <button
              type="button"
              onClick={() => onOpenBackdataDrawer?.()}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition cursor-pointer"
            >
              <Paperclip className="w-3 h-3" />+ 백데이터 연결하기
            </button>
          )}

          {targetSlot.constraints?.maxLines && (
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[11px]">
              제약: 최대 {targetSlot.constraints.maxLines}줄
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition"
          title="닫기 (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Streaming / Generated Preview Card (`ToolUI` Accept / Reject bar) */}
      {previewHtml && (
        <div className="p-3 bg-slate-900/95 border-b border-slate-800">
          <div className="text-[11px] font-medium text-emerald-400 mb-1.5 flex items-center justify-between">
            <span>✨ 생성된 슬롯 미리보기 (외곽 레이아웃 유지 100%)</span>
            <span className="text-slate-400 font-normal truncate max-w-xs">
              지시: "{lastPrompt}"
            </span>
          </div>
          <div
            className="p-2.5 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-100 text-xs prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
          <div className="flex items-center gap-2 mt-2.5">
            <button
              type="button"
              onClick={() => {
                onApplySlotContent(targetSlot.slotId, previewHtml);
                setPreviewHtml(null);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> 슬롯에 반영 (Accept)
            </button>
            <button
              type="button"
              onClick={() => runCompose(lastPrompt)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 다시 쓰기
            </button>
            <button
              type="button"
              onClick={() => setPreviewHtml(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 text-xs transition cursor-pointer"
            >
              버리기
            </button>
          </div>
        </div>
      )}

      {/* 3. Prompt Input Bar (`ComposerPrimitive.Input` style) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runCompose(prompt);
        }}
        className="flex items-center gap-2 px-3 py-2 bg-slate-900"
      >
        <Sparkles
          className={`w-4 h-4 shrink-0 ${
            isGenerating
              ? "text-amber-400 animate-spin"
              : "text-emerald-400"
          }`}
        />
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            boundChunks.length > 0
              ? `연결된 백데이터(${boundChunks.length}건)를 바탕으로 이 슬롯을 어떻게 작성·수정할까요?`
              : "이 슬롯에 들어갈 내용을 지시하세요 (예: 3줄 개조식으로 핵심만 요약해줘)..."
          }
          className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none py-1"
          disabled={isGenerating}
          autoFocus
        />
        <button
          type="submit"
          disabled={isGenerating || !prompt.trim()}
          className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition shrink-0 cursor-pointer"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* 4. Quick Command Presets (`Novel` AISelector style) */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-slate-950/60 border-t border-slate-800/80">
        <span className="text-[11px] text-slate-400 mr-1">빠른 지시:</span>
        {QUICK_PRESETS.map((preset) => {
          const Icon = preset.icon;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={isGenerating}
              onClick={() => runCompose(preset.prompt, preset.id)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-[11px] border border-slate-700/80 transition cursor-pointer"
            >
              <Icon className="w-3 h-3 text-emerald-400" />
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
