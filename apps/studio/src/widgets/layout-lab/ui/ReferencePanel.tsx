import React from "react";
import { Check, Copy, LayoutTemplate, Pin, Plus, Search, Type } from "lucide-react";

import { itemById, LAB_ITEMS, type LabItem, type SkeletonPart } from "../model/dummy";
import { useLabStore } from "../model/useLabStore";
import { KindBadge, PanelHead } from "./shell";

const GENERIC: SkeletonPart[] = [
  { t: "title", text: "제목" },
  { t: "text", label: "본문", lines: 3, sample: "" },
  { t: "image", label: "그림" },
];

const skeletonOf = (item: LabItem) => item.skeleton ?? GENERIC;

/** 뼈대 썸네일 — 레퍼런스는 "생김새"를 먼저 보는 것이라 목록에서도 뼈대를 보여 준다. */
export const SkeletonThumb: React.FC<{ item: LabItem; className?: string }> = ({ item, className = "" }) => (
  <div className={`rounded-md border border-[var(--fig-border)] bg-white p-1.5 flex flex-col gap-1 overflow-hidden ${className}`}>
    {skeletonOf(item).slice(0, 7).map((p, i) => {
      if (p.t === "title") return <span key={i} className="h-1.5 w-4/5 rounded-sm bg-black/50" />;
      if (p.t === "meta") return <span key={i} className="h-1 w-2/5 rounded-sm bg-black/15" />;
      if (p.t === "text")
        return (
          <span key={i} className="flex flex-col gap-[3px]">
            {Array.from({ length: Math.min(3, p.lines) }, (_, k) => (
              <span key={k} className="h-[3px] rounded-sm bg-black/15" style={{ width: `${k === Math.min(3, p.lines) - 1 ? 60 : 100}%` }} />
            ))}
          </span>
        );
      if (p.t === "image") return <span key={i} className="h-5 rounded-sm bg-[#9747ff]/15" />;
      if (p.t === "images")
        return (
          <span key={i} className="flex gap-1">
            {Array.from({ length: p.count }, (_, k) => (
              <span key={k} className="flex-1 h-4 rounded-sm bg-[#9747ff]/15" />
            ))}
          </span>
        );
      return <span key={i} className="h-3 rounded-sm border border-black/15 bg-black/[0.03]" />;
    })}
  </div>
);

/** 레퍼런스 칸 — 이 문서에서 "레퍼런스" 역할을 맡은 자료만. variant: 목록 · 격자 · 띠. */
export const ReferencePanel: React.FC<{ variant?: "list" | "grid"; showHead?: boolean }> = ({ variant = "list", showHead = false }) => {
  const roles = useLabStore((s) => s.roles);
  const pinned = useLabStore((s) => s.pinnedRefs);
  const openRefId = useLabStore((s) => s.openRefId);
  const openRef = useLabStore((s) => s.openRef);
  const togglePinned = useLabStore((s) => s.togglePinnedRef);
  const setLibrary = useLabStore((s) => s.setLibrary);
  const [q, setQ] = React.useState("");
  const items = LAB_ITEMS.filter((i) => roles[i.id]?.ref && (!q || i.title.includes(q)));

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="lab-references">
      {showHead && (
        <PanelHead
          title={<span className="flex items-center gap-1.5"><LayoutTemplate className="w-3.5 h-3.5 text-[#9747ff]" />레퍼런스</span>}
          meta={`${pinned.length}/${items.length} 물림`}
        />
      )}
      <div className="px-2 pt-2 pb-1 flex items-center gap-1">
        <label className="fig-input flex-1">
          <Search className="fig-input-prefix w-3 h-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="레퍼런스 찾기" />
        </label>
        <button type="button" className="fig-icon-btn" title="자료실에서 레퍼런스 추가" onClick={() => setLibrary(true)}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="px-3 pb-1 text-[11px] text-[var(--fig-text-tertiary)]">글 흐름 · 레이아웃 뼈대를 따라 할 자료. 누르면 캔버스 옆에 열립니다.</p>
      <div className={`flex-1 min-h-0 overflow-y-auto px-2 pb-2 ${variant === "grid" ? "grid grid-cols-2 gap-2 content-start" : "space-y-1"}`}>
        {items.map((item) => {
          const isPinned = pinned.includes(item.id);
          const isOpen = openRefId === item.id;
          return variant === "grid" ? (
            <button
              key={item.id}
              type="button"
              onClick={() => openRef(isOpen ? null : item.id)}
              className={`text-left rounded-lg p-1.5 border ${isOpen ? "border-[var(--fig-brand)] bg-[var(--fig-selected)]" : "border-transparent hover:bg-[var(--fig-hover)]"}`}
            >
              <SkeletonThumb item={item} className="h-28" />
              <span className="mt-1 flex items-center gap-1">
                <KindBadge kind={item.kind} />
                {isPinned && <Pin className="w-3 h-3 text-[#9747ff]" />}
              </span>
              <span className="block text-[11.5px] leading-4 line-clamp-2 mt-0.5">{item.title}</span>
            </button>
          ) : (
            <div
              key={item.id}
              onClick={() => openRef(isOpen ? null : item.id)}
              data-testid="lab-ref-item"
              className={`group flex gap-2 p-1.5 rounded-lg cursor-default ${isOpen ? "bg-[var(--fig-selected)]" : "hover:bg-[var(--fig-hover)]"}`}
            >
              <SkeletonThumb item={item} className="w-12 h-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <KindBadge kind={item.kind} />
                  <span className="text-[10.5px] text-[var(--fig-text-tertiary)] truncate">{item.source}</span>
                </div>
                <div className="text-[12px] leading-4 line-clamp-2 mt-0.5">{item.title}</div>
              </div>
              <button
                type="button"
                title={isPinned ? "이 문서에서 물림 해제" : "이 문서에 물리기"}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePinned(item.id);
                }}
                className={`fig-icon-btn self-start ${isPinned ? "!text-[#9747ff]" : "opacity-0 group-hover:opacity-100"}`}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** 참고 칸 — 레퍼런스를 캔버스 바로 옆에서 비교. 레이아웃(뼈대) / 텍스트(흐름 · 말투) 참조를 고른다. */
export const ReferenceViewer: React.FC<{ onClose?: () => void; compact?: boolean }> = ({ onClose, compact }) => {
  const openRefId = useLabStore((s) => s.openRefId);
  const refMode = useLabStore((s) => s.refMode);
  const setRefMode = useLabStore((s) => s.setRefMode);
  const openRef = useLabStore((s) => s.openRef);
  const say = useLabStore((s) => s.say);
  const item = openRefId ? itemById(openRefId) : undefined;
  if (!item) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-[12px] text-[var(--fig-text-secondary)]">
        레퍼런스를 고르면 여기에서 뼈대와 흐름을 봅니다.
      </div>
    );
  }
  const parts = skeletonOf(item);
  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="lab-ref-viewer">
      <PanelHead
        title={<span className="truncate max-w-[220px]" title={item.title}>{item.title}</span>}
        onClose={onClose ?? (() => openRef(null))}
      />
      <div className="px-3 py-2 flex items-center gap-2 border-b border-[var(--fig-border)]">
        <div className="fig-seg w-[170px]" role="group" aria-label="무엇을 참조할까">
          <button type="button" aria-pressed={refMode === "layout"} onClick={() => setRefMode("layout")} data-testid="lab-refmode-layout">
            <LayoutTemplate className="w-3 h-3" />레이아웃
          </button>
          <button type="button" aria-pressed={refMode === "text"} onClick={() => setRefMode("text")} data-testid="lab-refmode-text">
            <Type className="w-3 h-3" />텍스트 흐름
          </button>
        </div>
        <button type="button" className="fig-btn ml-auto" onClick={() => say(refMode === "layout" ? "뼈대를 지금 쪽에 적용했다고 가정합니다 (더미)" : "흐름 · 말투를 AI 에게 참고로 넘겼다고 가정합니다 (더미)")}>
          {refMode === "layout" ? <><Copy className="w-3 h-3" />뼈대 적용</> : <><Check className="w-3 h-3" />흐름 참고</>}
        </button>
      </div>
      <div className={`flex-1 min-h-0 overflow-y-auto bg-[#f4f5f7] ${compact ? "p-2" : "p-4"}`}>
        <div className="mx-auto max-w-[420px] bg-white rounded-md border border-[var(--fig-border)] p-4 space-y-3">
          {parts.map((p, i) => {
            if (p.t === "title")
              return refMode === "layout" ? <div key={i} className="h-5 w-4/5 rounded bg-black/70" /> : <h3 key={i} className="text-[15px] font-semibold leading-snug">{p.text}</h3>;
            if (p.t === "meta")
              return refMode === "layout" ? <div key={i} className="h-2 w-1/3 rounded bg-black/15" /> : <p key={i} className="text-[11px] text-black/45">{p.text}</p>;
            if (p.t === "text")
              return refMode === "layout" ? (
                <div key={i} className="space-y-1.5">
                  {Array.from({ length: p.lines }, (_, k) => (
                    <div key={k} className="h-2 rounded bg-black/12" style={{ width: k === p.lines - 1 ? "55%" : "100%", background: "rgba(0,0,0,.12)" }} />
                  ))}
                  <div className="text-[10.5px] text-[#9747ff]">{p.label} · {p.lines}줄</div>
                </div>
              ) : (
                <div key={i}>
                  <div className="text-[10.5px] font-semibold text-[#9747ff] mb-0.5">{p.label}</div>
                  <p className="text-[12.5px] leading-[19px] text-black/75">{p.sample || "…"}</p>
                </div>
              );
            if (p.t === "image")
              return (
                <div key={i} className="h-28 rounded bg-[#9747ff]/10 border border-dashed border-[#9747ff]/40 flex items-center justify-center text-[11px] text-[#9747ff]">
                  {p.label}
                </div>
              );
            if (p.t === "images")
              return (
                <div key={i}>
                  <div className="flex gap-2">
                    {Array.from({ length: p.count }, (_, k) => (
                      <div key={k} className="flex-1 h-20 rounded bg-[#9747ff]/10 border border-dashed border-[#9747ff]/40" />
                    ))}
                  </div>
                  <div className="text-[10.5px] text-[#9747ff] mt-1">{p.label}</div>
                </div>
              );
            return (
              <div key={i} className="rounded border border-black/15">
                {[0, 1, 2].map((r) => (
                  <div key={r} className="flex border-b last:border-b-0 border-black/10">
                    {[0, 1, 2].map((c) => (
                      <div key={c} className={`flex-1 h-5 border-r last:border-r-0 border-black/10 ${r === 0 ? "bg-black/[0.06]" : ""}`} />
                    ))}
                  </div>
                ))}
                <div className="text-[10.5px] text-[#9747ff] px-1.5 py-0.5">{p.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
