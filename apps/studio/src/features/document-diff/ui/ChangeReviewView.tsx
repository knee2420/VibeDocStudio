import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Crosshair, RotateCcw, Sparkles, User } from "lucide-react";

import { useSlotSelectionStore } from "@/entities/slot";
import {
  buildChanges,
  groupChangesByPage,
  pageTitle,
  selectActiveDocument,
  slotLocations,
  summarizeChanges,
  formatPageNos,
  useStudioDocumentStore,
  type ChangeItem,
} from "@/entities/vdoc-document";
import { revealCanvasElement, sumStats, type ParaDiff } from "@/shared/lib";
import { ADD_CLASS, CharStatText, DEL_CLASS, RedlineSegments } from "@/shared/ui";

import { useActiveDiffStore, type ActiveDiffTarget } from "../model/useActiveDiffStore";
import { ChangeOverviewRuler, flashElement, scrollToElement, type RulerKind } from "./ChangeOverviewRuler";

export type ReviewShow = "both" | "before" | "after";

/** 칸 내용을 그 이전 글로 되돌린다 — 새 변경으로 남아 실행 취소할 수 있다. */
type RevertFn = (docId: string, slots: { slotId: string; before: string }[], label: string) => boolean;

function ago(at: string): string {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
  return new Date(t).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

/** 바뀐 문단 앞뒤 한 문단만 남기고 나머지 같은 문단은 "같은 문단 N개"로 접는다. */
function withContext(paras: ParaDiff[]): (ParaDiff | { kind: "fold"; count: number })[] {
  const changed = (i: number) => i >= 0 && i < paras.length && paras[i].kind !== "same";
  const keep = paras.map((_, i) => changed(i) || changed(i - 1) || changed(i + 1));
  const out: (ParaDiff | { kind: "fold"; count: number })[] = [];
  let folded = 0;
  paras.forEach((p, i) => {
    if (keep[i]) {
      if (folded) out.push({ kind: "fold", count: folded });
      folded = 0;
      out.push(p);
    } else folded++;
  });
  if (folded) out.push({ kind: "fold", count: folded });
  return out;
}

const Paragraph: React.FC<{ para: ParaDiff; show: ReviewShow }> = ({ para, show }) => {
  if (para.kind === "same") return <p className="text-black/45">{para.text}</p>;
  if (para.kind === "changed")
    return (
      <p>
        <RedlineSegments segs={para.segs} show={show} />
      </p>
    );
  if (para.kind === "added")
    return show === "before" ? null : (
      <p>
        <ins className={show === "both" ? ADD_CLASS : "bg-[#dafbe1] no-underline"}>{para.text}</ins>
      </p>
    );
  return show === "after" ? null : (
    <p>
      <del className={show === "both" ? DEL_CLASS : "bg-[#ffebe9] no-underline"}>{para.text}</del>
    </p>
  );
};

const ChangeCard: React.FC<{
  item: ChangeItem;
  index: number;
  focused: boolean;
  show: ReviewShow;
  canRevert: boolean;
  onFocus: () => void;
  onRevert: () => void;
  onReveal: () => void;
}> = ({ item, index, focused, show, canRevert, onFocus, onRevert, onReveal }) => {
  const kind = item.stat.added && item.stat.removed ? "mod" : item.stat.removed ? "del" : "add";
  return (
    <article
      data-change-card={kind}
      data-change-label={`${item.location ? `${pageTitle(item.location)} · ` : ""}${item.label}  +${item.stat.added} −${item.stat.removed}`}
      data-change-index={index}
      data-testid="review-change-card"
      onClick={onFocus}
      className={`group relative rounded-[8px] bg-white border transition scroll-mt-16 ${
        focused ? "border-[#0d99ff] shadow-[0_0_0_1px_#0d99ff]" : "border-black/10 hover:border-black/20"
      }`}
    >
      <header className="h-9 pl-4 pr-2 flex items-center gap-2 text-[12px] text-black/50">
        <span className="min-w-0 truncate">
          {item.location?.heading && <span>{item.location.heading} › </span>}
          <span className="text-black/70">{item.label}</span>
        </span>
        <CharStatText stat={item.stat} className="ml-auto" />
        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
          {item.location && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReveal();
              }}
              className="fig-icon-btn"
              title="문서에서 이 자리 보기"
              data-testid="review-reveal-btn"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          )}
          {canRevert && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRevert();
              }}
              className="h-6 px-2 inline-flex items-center gap-1 rounded-[5px] text-[12px] text-black/70 hover:bg-black/5"
              title="이 곳을 고치기 전 글로 되돌립니다 (실행 취소 가능)"
              data-testid="review-revert-btn"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 되돌리기
            </button>
          )}
        </span>
      </header>
      <div className="px-4 pb-4 space-y-2 text-[14px] leading-7 text-black/85 break-words">
        {item.formatOnly ? (
          <p className="text-[12.5px] text-black/45">글은 그대로이고 글꼴 · 서식만 바뀌었습니다.</p>
        ) : (
          withContext(item.paras).map((p, i) =>
            p.kind === "fold" ? (
              <p key={i} className="text-[12px] text-black/35 select-none">
                ⋯ 바뀌지 않은 문단 {p.count}개
              </p>
            ) : (
              <Paragraph key={i} para={p} show={show} />
            ),
          )
        )}
      </div>
    </article>
  );
};

/**
 * 변경 검토 — 문서를 읽듯이 바뀐 곳만 쪽 순서로: 지운 글은 빨강 취소선, 넣은 글은 초록 밑줄 (워드 · 구글 문서 방식).
 * 위에서 이전/다음 변경으로 넘기고, 곳마다 되돌리기 · 문서에서 보기. 바뀌지 않은 문단은 접는다.
 */
export const ChangeReviewView: React.FC<{ activeDiff: ActiveDiffTarget; show: ReviewShow; revert?: RevertFn }> = ({
  activeDiff,
  show,
  revert,
}) => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const pages = doc?.pages;
  const closeDiff = useActiveDiffStore((s) => s.closeDiff);
  const dropSlots = useActiveDiffStore((s) => s.dropSlots);
  const selectSlot = useSlotSelectionStore((s) => s.setSelectedSlotId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [focusRaw, setFocus] = useState(0);
  const [confirmAll, setConfirmAll] = useState(false);

  // 쪽 · 제목 위치는 문서 구조가 바뀔 때만 다시 (글자 입력마다 다시 세지 않게).
  const slotsRef = useRef(doc?.slots);
  slotsRef.current = doc?.slots;
  const where = useMemo(() => slotLocations(pages ?? [], slotsRef.current ?? {}), [pages]);
  const isAdded = activeDiff.diffKind === "added";
  const items = useMemo(
    () =>
      buildChanges(doc ?? null, where, {
        slotIds: activeDiff.changedSlotIds,
        before: isAdded ? {} : activeDiff.beforeSlots,
        after: activeDiff.afterSlots,
        labels: activeDiff.slotLabels,
      }),
    // 문서 글이 바뀌어도 검토 대상(이전 · 이후)은 그대로라 doc 은 이름 찾기에만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [where, activeDiff, isAdded],
  );
  const groups = useMemo(() => groupChangesByPage(items), [items]);
  const summary = useMemo(() => summarizeChanges(items), [items]);
  const canRevert = Boolean(revert && activeDiff.revertible && doc);
  // 되돌려 목록이 줄어도 범위 안에.
  const focus = Math.max(0, Math.min(focusRaw, items.length - 1));

  /** i 번째 변경으로 바로 옮기고 잠깐 빛나게. */
  const showChange = (i: number) => {
    const box = scrollRef.current;
    const el = box?.querySelector(`[data-change-index="${i}"]`);
    if (!box || !el) return;
    scrollToElement(box, el, "start");
    flashElement(el);
  };

  const goTo = (i: number) => {
    if (items.length === 0) return;
    const next = (i + items.length) % items.length;
    setFocus(next);
    showChange(next);
  };
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const focusRef = useRef(focus);
  focusRef.current = focus;

  // 칸을 골라 열었으면 그 칸부터, 아니면 맨 위부터.
  useEffect(() => {
    setConfirmAll(false);
    const idx = activeDiff.slotId ? items.findIndex((it) => it.slotId === activeDiff.slotId) : -1;
    setFocus(Math.max(0, idx));
    // 그려진 다음 프레임에 옮긴다.
    const raf = requestAnimationFrame(() => {
      if (idx >= 0) showChange(idx);
      else if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDiff.slotId, activeDiff.revisionRev, activeDiff.diffId, activeDiff.pageId, activeDiff.label]);

  // 문서 편집기 관례: Alt+↓ 다음 변경, Alt+↑ 이전 변경 (한 번만 걸고 최신 값은 ref 로).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      e.preventDefault();
      goToRef.current(focusRef.current + (e.key === "ArrowDown" ? 1 : -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const revertItems = (list: ChangeItem[], label: string) => {
    if (!revert || !doc) return;
    if (revert(doc.docId, list.map((it) => ({ slotId: it.slotId, before: it.before })), label)) {
      dropSlots(list.map((it) => it.slotId));
    }
  };

  const reveal = (item: ChangeItem) => {
    closeDiff();
    window.setTimeout(() => {
      selectSlot(item.slotId);
      revealCanvasElement({ slotId: item.slotId });
    }, 80);
  };

  const meta = activeDiff.meta;
  let index = -1;

  return (
    <div className="flex-1 min-h-0 flex bg-[#f3f3f3]" data-testid="change-review-view">
      <div className="flex-1 min-w-0 relative">
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto">
        <div className="max-w-[780px] mx-auto px-6 pb-16">
          {/* 요약 */}
          <section className="pt-6 pb-4">
            <h2 className="text-[18px] font-semibold text-black/90 leading-7 break-words">{activeDiff.label}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-black/55">
              {meta?.author && (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white"
                    style={{ background: meta.author === "ai" ? "#9747ff" : "#0d99ff" }}
                  >
                    {meta.author === "ai" ? <Sparkles className="w-3 h-3" /> : <User className="w-3 h-3" />}
                  </span>
                  <span className="text-black/75 font-medium">{meta.authorName}</span>
                </span>
              )}
              {meta?.at && <span title={new Date(meta.at).toLocaleString("ko-KR")}>{ago(meta.at)}</span>}
            </div>
            {meta?.note && <p className="mt-2 text-[13px] text-black/65 border-l-2 border-black/15 pl-3 whitespace-pre-wrap">{meta.note}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-black/70" data-testid="review-summary">
              <span>
                <b>{summary.pageNos.length}</b>개 쪽에서 <b>{summary.places}</b>곳
              </span>
              {summary.pageNos.length > 0 && <span className="text-black/45">{formatPageNos(summary.pageNos)}</span>}
              <CharStatText stat={summary.stat} className="!text-[12.5px]" />
            </div>
          </section>

          {/* 이전 · 다음 변경 */}
          <div className="sticky top-0 z-10 -mx-2 px-2 py-2 bg-[#f3f3f3]/95 backdrop-blur flex items-center gap-2">
            <div className="inline-flex items-center rounded-[6px] bg-white border border-black/10">
              <button type="button" onClick={() => goTo(focus - 1)} className="fig-icon-btn" title="이전 변경 (Alt+↑)" data-testid="review-prev">
                <ChevronUp className="w-4 h-4" />
              </button>
              <span className="px-1 text-[12px] tabular-nums text-black/60 min-w-[52px] text-center" data-testid="review-position">
                {items.length ? `${focus + 1} / ${items.length}` : "0 / 0"}
              </span>
              <button type="button" onClick={() => goTo(focus + 1)} className="fig-icon-btn" title="다음 변경 (Alt+↓)" data-testid="review-next">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            <span className="text-[12px] text-black/40">
              {items[focus]?.location ? `${pageTitle(items[focus].location!)}` : items[focus] ? "지금 문서에 없는 칸" : ""}
            </span>
            {canRevert && items.length > 0 && (
              <span className="ml-auto flex items-center gap-1">
                {confirmAll ? (
                  <>
                    <span className="text-[12px] text-black/60">{items.length}곳을 모두 되돌릴까요?</span>
                    <button
                      type="button"
                      onClick={() => revertItems(items, `${activeDiff.label} 모두 되돌리기`)}
                      className="h-7 px-2.5 rounded-[6px] bg-[#cf222e] text-white text-[12px] font-medium"
                      data-testid="review-revert-all-confirm"
                    >
                      모두 되돌리기
                    </button>
                    <button type="button" onClick={() => setConfirmAll(false)} className="h-7 px-2.5 rounded-[6px] text-[12px] hover:bg-black/5">
                      취소
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmAll(true)}
                    className="h-7 px-2.5 rounded-[6px] bg-white border border-black/10 text-[12px] text-black/70 hover:bg-black/5 inline-flex items-center gap-1"
                    data-testid="review-revert-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> 모두 되돌리기
                  </button>
                )}
              </span>
            )}
          </div>

          {/* 쪽별 변경 */}
          {groups.map((g) => (
            <section key={g.key} className="mt-4">
              <div className="h-8 flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-black/70">{g.location ? pageTitle(g.location) : "지금 문서에 없는 칸"}</span>
                <span className="text-black/35">{g.items.length}곳</span>
                <CharStatText stat={sumStats(g.items.map((i) => i.stat))} className="ml-auto" />
              </div>
              <div className="space-y-2">
                {g.items.map((item) => {
                  index += 1;
                  const i = index;
                  return (
                    <ChangeCard
                      key={item.slotId}
                      item={item}
                      index={i}
                      focused={focus === i}
                      show={show}
                      canRevert={canRevert && Boolean(item.location)}
                      onFocus={() => setFocus(i)}
                      onRevert={() => revertItems([item], `'${item.label}' 되돌리기`)}
                      onReveal={() => reveal(item)}
                    />
                  );
                })}
              </div>
            </section>
          ))}
          {items.length === 0 && (
            <p className="mt-10 text-center text-[13px] text-black/45">검토할 변경이 없습니다. 모두 되돌렸거나 서식만 바뀐 칸뿐입니다.</p>
          )}
        </div>
      </div>
      </div>
      <ChangeOverviewRuler
        scrollRef={scrollRef}
        selector="[data-change-card]"
        kindOf={(el) => (el.dataset.changeCard as RulerKind) ?? null}
        labelOf={(el) => el.dataset.changeLabel ?? ""}
        onJump={(el) => setFocus(Number(el.dataset.changeIndex))}
        deps={[items, show]}
      />
    </div>
  );
};
