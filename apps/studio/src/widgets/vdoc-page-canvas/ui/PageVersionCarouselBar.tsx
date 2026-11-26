import React, { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Columns2, FlaskConical, RotateCcw } from "lucide-react";

import type { VDocDocument, VDocPage } from "@vibe/vdoc-schema";

import { playgroundActions, type PlaygroundVariant } from "@/features/playground";

export interface PageVariantOption {
  /** null = 원본 (v1) */
  variant: PlaygroundVariant | null;
  /** 표시 라벨 ("원본", "v2", "v3" ...) */
  label: string;
  /** 실험실 문서 제목 (호버 설명) */
  title: string;
  /** 이 버전에서 가져올 페이지 객체 */
  page: VDocPage;
  /** 이 버전의 슬롯 맵 */
  slots: VDocDocument["slots"];
}

/**
 * 원본 문서의 개별 페이지 상단에 뜨는 생성형 AI 스타일 버전 캐러셀 (`‹ 원본 · v2 · v3 ›`).
 * - ‹ › 화살표로 해당 페이지만 그 자리에서 즉시 다른 실험실 버전으로 미리보기 전환
 * - 마음에 드는 버전에서 [이 페이지만 적용]을 누르면 나머지 페이지는 그대로 두고 이 페이지만 반영
 */
export const PageVersionCarouselBar: React.FC<{
  sourcePage: VDocPage;
  options: readonly PageVariantOption[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
}> = ({ sourcePage, options, selectedIndex, onSelectIndex }) => {
  const [adopting, setAdopting] = useState(false);

  if (options.length <= 1) return null;

  const safeIdx = Math.max(0, Math.min(options.length - 1, selectedIndex));
  const current = options[safeIdx]!;
  const isPreviewing = current.variant !== null;

  const step = (delta: number) => {
    const next = (safeIdx + delta + options.length) % options.length;
    onSelectIndex(next);
  };

  const handleAdoptPage = async () => {
    if (!current.variant) return;
    const pageTitle = sourcePage.pageLabel || `${sourcePage.pageNumber}쪽`;
    if (
      !window.confirm(
        `'${pageTitle}' 페이지만 ${current.label}(${current.title}) 내용으로 교체할까요?\n다른 페이지는 그대로 유지되며, 바꾸기 전 원본은 자동 보관됩니다.`,
      )
    ) {
      return;
    }
    setAdopting(true);
    try {
      await playgroundActions.adoptPageFromVariant(
        current.variant.doc.docId,
        sourcePage.pageId,
        `${pageTitle} (${current.label})`,
      );
      onSelectIndex(0);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "이 페이지를 적용하지 못했어요.");
    } finally {
      setAdopting(false);
    }
  };

  return (
    <div
      data-testid={`page-version-carousel-${sourcePage.pageId}`}
      className={`w-[794px] max-w-[794px] mx-auto mb-1.5 flex items-center justify-between gap-2 select-none transition-opacity ${
        isPreviewing ? "opacity-100" : "opacity-75 hover:opacity-100"
      }`}
    >
      {/* 좌측: 생성형 AI 스타일 ‹ 원본 · v2 · v3 › 캐러셀 */}
      <div
        className={`inline-flex items-center gap-1 h-7 px-1.5 rounded-full border text-[11px] transition ${
          isPreviewing
            ? "bg-white border-[var(--vds-accent-border)] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            : "bg-white/85 border-[var(--vds-border)] hover:bg-white"
        }`}
      >
        <FlaskConical
          className={`w-3 h-3 ml-1 shrink-0 ${isPreviewing ? "text-[var(--vds-accent)]" : "text-[var(--vds-ink-tertiary)]"}`}
        />
        <button
          type="button"
          onClick={() => step(-1)}
          title="이전 버전 미리보기"
          className="w-5 h-5 rounded-full flex items-center justify-center text-[var(--vds-ink-secondary)] hover:bg-[var(--vds-hover)] hover:text-[var(--vds-ink)] cursor-pointer transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <div className="inline-flex items-center gap-0.5">
          {options.map((opt, idx) => {
            const active = idx === safeIdx;
            return (
              <button
                key={opt.variant ? opt.variant.doc.docId : "orig"}
                type="button"
                onClick={() => onSelectIndex(idx)}
                title={opt.variant ? `${opt.label} · ${opt.title}` : "현재 원본 페이지"}
                className={`h-5 px-2 rounded-full text-[10.5px] font-medium cursor-pointer transition ${
                  active
                    ? opt.variant
                      ? "bg-[var(--vds-accent)] text-white"
                      : "bg-[#18181b] text-white"
                    : "text-[var(--vds-ink-secondary)] hover:bg-[var(--vds-hover)] hover:text-[var(--vds-ink)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => step(1)}
          title="다음 버전 미리보기"
          className="w-5 h-5 rounded-full flex items-center justify-center text-[var(--vds-ink-secondary)] hover:bg-[var(--vds-hover)] hover:text-[var(--vds-ink)] cursor-pointer transition"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {isPreviewing && (
          <span className="pl-1 pr-1.5 text-[10.5px] text-[var(--vds-ink-secondary)] max-w-[180px] truncate border-l border-[var(--vds-border)]">
            {current.title}
          </span>
        )}
      </div>

      {/* 우측: 미리보기 중일 때만 [원본으로] [비교] [이 페이지만 적용] 표시 */}
      {isPreviewing && current.variant && (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelectIndex(0)}
            className="h-7 px-2.5 rounded-full border border-[var(--vds-border)] bg-white hover:bg-[var(--vds-hover)] text-[var(--vds-ink-secondary)] hover:text-[var(--vds-ink)] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition"
            title="원본 보기로 돌아가기"
          >
            <RotateCcw className="w-3 h-3" />
            원본으로
          </button>
          <button
            type="button"
            onClick={() =>
              playgroundActions.compareWithSource(current.variant!.doc.docId, {
                label: current.label,
                targetName: sourcePage.pageLabel || current.title,
                initialView: "side-by-side",
              })
            }
            className="h-7 px-2.5 rounded-full border border-[var(--vds-border)] bg-white hover:bg-[var(--vds-hover)] text-[var(--vds-ink)] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition"
            title="원본과 이 버전을 좌우·겹쳐 비교"
          >
            <Columns2 className="w-3 h-3" />
            비교
          </button>
          <button
            type="button"
            data-testid={`adopt-page-variant-${sourcePage.pageId}`}
            disabled={adopting}
            onClick={() => void handleAdoptPage()}
            className="h-7 px-3 rounded-full bg-[var(--vds-accent)] hover:bg-[var(--vds-accent-hover)] text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shadow-2xs disabled:opacity-50 transition"
            title="다른 페이지는 건드리지 않고 이 페이지만 선택한 버전으로 교체"
          >
            <Check className="w-3 h-3 stroke-[2.5]" />
            {adopting ? "적용 중…" : "이 페이지만 적용"}
          </button>
        </div>
      )}
    </div>
  );
};
