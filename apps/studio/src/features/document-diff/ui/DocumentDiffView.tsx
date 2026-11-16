import React, { useState } from "react";
import { Columns2 } from "lucide-react";

import { readStoredNumber, writeStoredValue } from "@/shared/lib";

import { type ActiveDiffTarget } from "../model/useActiveDiffStore";
import { ChangeReviewView, type ReviewShow } from "./ChangeReviewView";
import { SideBySideDiffCanvas } from "./SideBySideDiffCanvas";

const SHOW_KEY = "vdoc-review-show";
const PAGES_KEY = "vdoc-review-pages";
const SHOWS: ReviewShow[] = ["both", "before", "after"];
const SHOW_LABEL: Record<ReviewShow, string> = { both: "변경 표시", before: "수정 전", after: "수정 후" };

/**
 * 변경 검토 화면. 기본은 바뀐 곳만 모아 읽는 "변경 표시"(워드 변경 내용 추적처럼 빨강 취소선 · 초록 밑줄),
 * "수정 전 · 수정 후"로 한쪽 글만 읽을 수 있고, "실제 페이지"는 예전처럼 쪽을 좌우로 놓고 본다 (고른 것은 기억).
 */
export const DocumentDiffView: React.FC<{
  activeDiff: ActiveDiffTarget;
  revert?: (docId: string, slots: { slotId: string; before: string }[], label: string) => boolean;
}> = ({ activeDiff, revert }) => {
  const [show, setShow] = useState<ReviewShow>(() => SHOWS[readStoredNumber(SHOW_KEY, 0)] ?? "both");
  const [pages, setPages] = useState(() => readStoredNumber(PAGES_KEY, 0) === 1);
  const chooseShow = (v: ReviewShow) => {
    setShow(v);
    writeStoredValue(SHOW_KEY, SHOWS.indexOf(v));
  };
  const togglePages = () => {
    setPages(!pages);
    writeStoredValue(PAGES_KEY, pages ? 0 : 1);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="fig-panel h-10 px-3 flex items-center gap-2 border-b border-[var(--fig-border)] bg-white shrink-0">
        {!pages && (
          <div className="fig-seg w-[240px]" role="group" aria-label="보기">
            {SHOWS.map((v) => (
              <button key={v} type="button" aria-pressed={show === v} onClick={() => chooseShow(v)} data-testid={`review-show-${v}`}>
                {SHOW_LABEL[v]}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={togglePages}
          aria-pressed={pages}
          className={`ml-auto h-7 px-2.5 inline-flex items-center gap-1.5 rounded-[6px] text-[12px] ${
            pages ? "bg-[var(--fig-selected)] text-[var(--fig-brand)]" : "text-black/65 hover:bg-black/5"
          }`}
          title="실제 쪽 모양을 좌우로 놓고 비교"
          data-testid="review-pages-toggle"
        >
          <Columns2 className="w-4 h-4" />
          실제 페이지로 비교
        </button>
      </div>
      {pages ? <SideBySideDiffCanvas activeDiff={activeDiff} /> : <ChangeReviewView activeDiff={activeDiff} show={show} revert={revert} />}
    </div>
  );
};
