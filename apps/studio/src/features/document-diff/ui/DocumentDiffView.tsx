import React, { useEffect, useState } from "react";
import { Check, Columns2, FileDiff, Layers, X } from "lucide-react";

import { readStoredNumber, writeStoredValue } from "@/shared/lib";

import { useActiveDiffStore, type ActiveDiffTarget } from "../model/useActiveDiffStore";
import { ChangeReviewView, type ReviewShow } from "./ChangeReviewView";
import { OverlayDiffCanvas } from "./OverlayDiffCanvas";
import { SideBySideDiffCanvas } from "./SideBySideDiffCanvas";

const SHOW_KEY = "vdoc-review-show";
const VIEW_KEY = "vdoc-review-view-mode";
const SHOWS: ReviewShow[] = ["both", "before", "after"];
const SHOW_LABEL: Record<ReviewShow, string> = { both: "변경 표시", before: "수정 전", after: "수정 후" };

type DiffViewMode = "review" | "side-by-side" | "overlay";
const VIEW_MODES: DiffViewMode[] = ["review", "side-by-side", "overlay"];

/**
 * 변경 검토 화면.
 * - 글 변경 표시 (워드 변경 내용 추적처럼 빨강 취소선 · 초록 밑줄)
 * - 좌우 비교 (Figma Side-by-Side: 원본과 현재 A4 페이지를 나란히 동기 스크롤)
 * - 겹쳐 비교 (Figma Overlay: 원본 위에 현재 페이지를 겹치고 투명도 슬라이더로 확인)
 */
export const DocumentDiffView: React.FC<{
  activeDiff: ActiveDiffTarget;
  revert?: (docId: string, slots: { slotId: string; before: string }[], label: string) => boolean;
  /** 버전 비교 중일 때: 문서 전체를 그 버전으로 */
  restoreVersion?: () => Promise<void>;
  /** 버전 비교 중일 때: 쪽 하나를 그 버전 모습으로 */
  restorePage?: (pageId: string) => void;
  /** 실험실 버전 비교 중일 때: 이 버전 내용으로 원본 채택 */
  adoptVariant?: () => Promise<void>;
}> = ({ activeDiff, revert, restoreVersion, restorePage, adoptVariant }) => {
  const closeDiff = useActiveDiffStore((s) => s.closeDiff);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [show, setShow] = useState<ReviewShow>(() => SHOWS[readStoredNumber(SHOW_KEY, 0)] ?? "both");
  const [viewMode, setViewMode] = useState<DiffViewMode>(
    () => activeDiff.initialView ?? VIEW_MODES[readStoredNumber(VIEW_KEY, 0)] ?? "review",
  );

  // 다른 비교 대상으로 열렸고 initialView 가 명시되어 있으면 그 보기로 맞춘다
  useEffect(() => {
    if (activeDiff.initialView) setViewMode(activeDiff.initialView);
  }, [activeDiff.diffId, activeDiff.initialView]);

  const chooseShow = (v: ReviewShow) => {
    setShow(v);
    writeStoredValue(SHOW_KEY, SHOWS.indexOf(v));
  };
  const chooseView = (v: DiffViewMode) => {
    setViewMode(v);
    writeStoredValue(VIEW_KEY, VIEW_MODES.indexOf(v));
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="fig-panel h-10 px-3 flex items-center gap-2 border-b border-[var(--fig-border)] bg-white shrink-0">
        {/* Figma Compare Changes 스타일 보기 전환: 글 변경 · 좌우 비교 · 겹쳐 비교 */}
        <div className="fig-seg w-[270px] shrink-0" role="group" aria-label="비교 방식">
          <button
            type="button"
            aria-pressed={viewMode === "review"}
            onClick={() => chooseView("review")}
            data-testid="diff-mode-review"
            title="바뀐 글만 모아 보기"
          >
            <FileDiff className="w-3.5 h-3.5" />
            변경 목록
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "side-by-side"}
            onClick={() => chooseView("side-by-side")}
            data-testid="review-pages-toggle"
            title="원본과 현재 페이지를 나란히 비교 (Figma Side-by-Side)"
          >
            <Columns2 className="w-3.5 h-3.5" />
            좌우 비교
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "overlay"}
            onClick={() => chooseView("overlay")}
            data-testid="diff-mode-overlay"
            title="원본 위에 현재 페이지를 겹쳐 슬라이더로 비교 (Figma Overlay)"
          >
            <Layers className="w-3.5 h-3.5" />
            겹쳐 비교
          </button>
        </div>

        {viewMode === "review" && (
          <div className="fig-seg w-[210px] shrink-0" role="group" aria-label="보기">
            {SHOWS.map((v) => (
              <button key={v} type="button" aria-pressed={show === v} onClick={() => chooseShow(v)} data-testid={`review-show-${v}`}>
                {SHOW_LABEL[v]}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {activeDiff.variant && adoptVariant && (
            <button
              type="button"
              disabled={adopting}
              data-testid="diff-adopt-variant-btn"
              onClick={async () => {
                if (
                  !window.confirm(
                    `${activeDiff.variant!.label} 내용으로 원본 '${activeDiff.variant!.targetName}'을(를) 바꿀까요?\n바꾸기 전 원본은 자동 보관돼서 되돌릴 수 있어요.`,
                  )
                )
                  return;
                setAdopting(true);
                try {
                  await adoptVariant();
                } finally {
                  setAdopting(false);
                }
              }}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-semibold cursor-pointer disabled:opacity-50"
              title="원본을 이 실험 버전 내용으로 바꾸기"
            >
              <Check className="w-3.5 h-3.5" />
              {adopting ? "채택 중…" : "이 버전 채택"}
            </button>
          )}

          {activeDiff.version && restoreVersion && (
            <>
              {confirmRestore ? (
                <>
                  <span className="text-[12px] text-black/65">문서 전체를 이 버전으로? 지금 상태는 자동 보관됩니다.</span>
                  <button type="button" className="fig-btn" onClick={() => setConfirmRestore(false)}>
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={restoring}
                    className="fig-btn fig-btn-primary"
                    data-testid="diff-restore-version-confirm"
                    onClick={async () => {
                      setRestoring(true);
                      try {
                        await restoreVersion();
                      } finally {
                        setRestoring(false);
                        setConfirmRestore(false);
                      }
                    }}
                  >
                    {restoring ? "되돌리는 중…" : "되돌리기"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="fig-btn fig-btn-primary"
                  onClick={() => setConfirmRestore(true)}
                  data-testid="diff-restore-version"
                  title="문서 전체(쪽 구성 · 글)를 이 버전 상태로 되돌립니다"
                >
                  '{activeDiff.version.name}'(으)로 전체 되돌리기
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={closeDiff}
            data-testid="diff-close-btn"
            className="h-7 px-2 inline-flex items-center gap-1 rounded-[6px] text-[12px] text-black/60 hover:bg-black/5 cursor-pointer"
            title="비교 화면 닫고 편집으로 돌아가기"
          >
            <X className="w-3.5 h-3.5" />
            닫기
          </button>
        </div>
      </div>
      {viewMode === "side-by-side" ? (
        <SideBySideDiffCanvas activeDiff={activeDiff} />
      ) : viewMode === "overlay" ? (
        <OverlayDiffCanvas activeDiff={activeDiff} />
      ) : (
        <ChangeReviewView activeDiff={activeDiff} show={show} revert={revert} restorePage={restorePage} />
      )}
    </div>
  );
};
