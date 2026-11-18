import React from "react";
import { AlertTriangle, BookOpen, CheckCircle2, Plus, Quote, Search } from "lucide-react";

import { CITATIONS, itemById, LAB_ITEMS } from "../model/dummy";
import { useLabStore } from "../model/useLabStore";
import { KindBadge, PanelHead } from "./shell";

/**
 * 리소스(근거) 칸 — NotebookLM 의 자료 칸처럼. 리소스 매니저 + 지식 덱을 하나로.
 * 근거로 고르는 곳은 여기 한 곳뿐이고, AI 입력창의 칩은 이 선택을 비춘다.
 */
export const ResourcePanel: React.FC<{ showHead?: boolean }> = ({ showHead = false }) => {
  const roles = useLabStore((s) => s.roles);
  const attached = useLabStore((s) => s.attachedRes);
  const toggle = useLabStore((s) => s.toggleRes);
  const activeCite = useLabStore((s) => s.activeCite);
  const setLibrary = useLabStore((s) => s.setLibrary);
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const hit = activeCite ? CITATIONS[activeCite] : null;
  const items = LAB_ITEMS.filter((i) => roles[i.id]?.res && (!q || i.title.includes(q)));
  const listRef = React.useRef<HTMLDivElement>(null);

  // 출처 번호를 누르면 그 자료를 펴고 그 대목으로.
  React.useEffect(() => {
    if (!hit) return;
    setOpen(hit.itemId);
    requestAnimationFrame(() =>
      listRef.current?.querySelector(`[data-res="${hit.itemId}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  }, [hit]);

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="lab-resources">
      {showHead && (
        <PanelHead
          title={<span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-[#0f9d58]" />리소스 · 근거</span>}
          meta={`${attached.length}/${items.length} 물림`}
        />
      )}
      <div className="px-2 pt-2 pb-1 flex items-center gap-1">
        <label className="fig-input flex-1">
          <Search className="fig-input-prefix w-3 h-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="근거 자료 찾기" />
        </label>
        <button type="button" className="fig-icon-btn" title="자료실에서 근거 추가" onClick={() => setLibrary(true)}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-3 pb-1 flex items-center gap-2 text-[11px] text-[var(--fig-text-secondary)]">
        <span>AI 는 체크한 자료만 근거로 씁니다</span>
        <span className="ml-auto tabular-nums">{attached.length}개 물림</span>
      </div>
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-1">
        {items.map((item) => {
          const on = attached.includes(item.id);
          const expanded = open === item.id;
          return (
            <div
              key={item.id}
              data-res={item.id}
              className={`rounded-lg border ${hit?.itemId === item.id ? "border-[#0f9d58] bg-[#0f9d58]/[0.04]" : "border-transparent"} ${expanded ? "bg-[var(--fig-hover)]" : "hover:bg-[var(--fig-hover)]"}`}
            >
              <div className="flex items-start gap-2 p-1.5" onClick={() => setOpen(expanded ? null : item.id)}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 accent-[#0f9d58]"
                  title="근거로 물리기"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] leading-4 line-clamp-2">{item.title}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <KindBadge kind={item.kind} />
                    <span className="text-[10.5px] text-[var(--fig-text-tertiary)] truncate">{item.source}</span>
                  </div>
                </div>
              </div>
              {expanded && (
                <div className="px-2 pb-2 space-y-1.5">
                  {(item.quotes ?? ["(인용할 대목이 아직 없습니다)"]).map((qt, i) => (
                    <p
                      key={i}
                      className={`text-[11.5px] leading-[17px] rounded-md px-2 py-1.5 ${
                        hit?.itemId === item.id && hit.quote === i ? "bg-[#fff3c4] ring-1 ring-[#f2c94c]" : "bg-white border border-[var(--fig-border)]"
                      }`}
                    >
                      <Quote className="inline w-3 h-3 mr-1 text-[var(--fig-text-tertiary)] -mt-0.5" />
                      {qt}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const CLAIMS = [
  { text: "확장 가능한 코어 + 플러그인 구조에 합의", cite: 1, ok: true },
  { text: "슬롯 단위 분리로 편집 충돌 82% 감소", cite: 2, ok: true },
  { text: "4분기 집행률 64%", cite: 3, ok: true },
  { text: "LibreOffice 빌드 3시간 이상", cite: 4, ok: true },
  { text: "도입 후 운영비 30% 절감 예상", cite: null, ok: false },
];

/** 검토용 근거 확인 칸 — 문서 속 주장 ↔ 출처 대목을 나란히. */
export const VerifyPanel: React.FC = () => {
  const cite = useLabStore((s) => s.cite);
  const activeCite = useLabStore((s) => s.activeCite);
  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="lab-verify">
      <PanelHead title="근거 확인" meta={`주장 ${CLAIMS.length}개 · 출처 없음 ${CLAIMS.filter((c) => !c.ok).length}`} />
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {CLAIMS.map((c, i) => {
          const src = c.cite ? CITATIONS[c.cite] : null;
          const item = src ? itemById(src.itemId) : null;
          return (
            <button
              key={i}
              type="button"
              onClick={() => c.cite && cite(c.cite)}
              className={`w-full text-left rounded-lg border p-2 ${activeCite === c.cite && c.cite ? "border-[#0f9d58]" : "border-[var(--fig-border)] hover:bg-[var(--fig-hover)]"}`}
            >
              <div className="flex items-center gap-1.5 text-[12px] font-medium">
                {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-[#0f9d58]" /> : <AlertTriangle className="w-3.5 h-3.5 text-[#e8a33d]" />}
                {c.text}
              </div>
              {item && src ? (
                <p className="mt-1 text-[11.5px] leading-[17px] text-[var(--fig-text-secondary)]">
                  <span className="text-[#0f9d58] font-medium">[{c.cite}] {item.title}</span> — {item.quotes?.[src.quote]}
                </p>
              ) : (
                <p className="mt-1 text-[11.5px] text-[#b26b00]">출처가 없습니다. 근거를 달거나 문장을 고치세요.</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
