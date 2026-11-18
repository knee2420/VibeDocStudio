import React from "react";
import { BookOpen, FolderTree, LayoutTemplate, Pin, Sparkles } from "lucide-react";

import { useLayoutLabStore } from "@/features/layout-lab";

import { itemById } from "../model/dummy";
import { useLabStore } from "../model/useLabStore";
import { AiComposerBox, AiPanel, AiThread } from "./AiPanel";
import { LabCanvas } from "./LabCanvas";
import { ReferencePanel, ReferenceViewer, SkeletonThumb } from "./ReferencePanel";
import { ResourcePanel, VerifyPanel } from "./ResourcePanel";
import { PanelHead, PanelShell, PanelTabs, Rail } from "./shell";
import { StructurePanel } from "./StructurePanel";

const useW = (initial: number) => React.useState(initial);

/** 출처를 누르면 근거가 보이도록 — 각 버전이 자기 방식으로 근거 칸을 연다. */
const useOnCite = (fn: () => void) => {
  const activeCite = useLabStore((s) => s.activeCite);
  // 버전을 바꿔 들어올 때 이미 골라 둔 출처로는 움직이지 않고, 새로 누를 때만.
  const prev = React.useRef(activeCite);
  React.useEffect(() => {
    if (activeCite && activeCite !== prev.current) fn();
    prev.current = activeCite;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCite]);
};

/** 참고 칸 (Copyholder) — 레퍼런스를 열면 캔버스 바로 옆에. */
const Copyholder: React.FC<{ side?: "left" | "right" }> = ({ side = "left" }) => {
  const openRefId = useLabStore((s) => s.openRefId);
  const [w, setW] = useW(380);
  if (!openRefId) return null;
  return (
    <PanelShell side={side} width={w} onWidth={setW} min={280} max={640} testId="lab-copyholder" className="bg-[#f4f5f7]">
      <ReferenceViewer />
    </PanelShell>
  );
};

/** 열린 칸이 너무 많아 캔버스가 좁아지면 덜 급한 칸을 접는다 (칸 수 상한). */
const useBudget = (canvasW: () => number, collapse: () => boolean) => {
  const say = useLabStore((s) => s.say);
  const openRefId = useLabStore((s) => s.openRefId);
  React.useEffect(() => {
    if (!openRefId) return;
    if (canvasW() < window.innerWidth * 0.38 && collapse()) say("캔버스가 너무 좁아져서 왼쪽 칸을 레일로 접었어요");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRefId]);
};

const MinimizedHint: React.FC = () => {
  const toggle = useLabStore((s) => s.toggleMinimized);
  return (
    <button
      type="button"
      onClick={toggle}
      className="absolute left-1/2 -translate-x-1/2 top-3 z-30 h-7 px-3 rounded-full bg-black/75 text-white text-[11.5px]"
    >
      캔버스만 보는 중 · Shift+\ 또는 눌러서 칸 다시 열기
    </button>
  );
};

/* ───────────────────────── A · 양쪽 탭 ───────────────────────── */

export const VersionA: React.FC = () => {
  const minimized = useLabStore((s) => s.minimized);
  const pinned = useLabStore((s) => s.pinnedRefs.length);
  const attached = useLabStore((s) => s.attachedRes.length);
  const [leftTab, setLeftTab] = React.useState("structure");
  const [rightTab, setRightTab] = React.useState("ai");
  const [leftOpen, setLeftOpen] = React.useState(true);
  const [rightOpen, setRightOpen] = React.useState(true);
  // 서식 스키마(O6)는 담는 게 많아 왼쪽 칸을 넓게 시작한다.
  const [lw, setLw] = useW(["o6", "o7"].includes(useLayoutLabStore.getState().outline) ? 400 : 290);
  const [rw, setRw] = useW(380);

  useOnCite(() => {
    setRightOpen(true);
    setRightTab("res");
  });
  useBudget(
    () => window.innerWidth - (leftOpen ? lw : 44) - 380 - (rightOpen ? rw : 44),
    () => {
      if (!leftOpen) return false;
      setLeftOpen(false);
      return true;
    },
  );

  const leftTabs = [
    { id: "structure", label: "구조", icon: FolderTree },
    { id: "refs", label: "레퍼런스", icon: LayoutTemplate, badge: pinned ? <span className="text-[10px] text-[#9747ff]">{pinned}</span> : null },
  ];
  const rightTabs = [
    { id: "ai", label: "AI", icon: Sparkles },
    { id: "res", label: "리소스", icon: BookOpen, badge: <span className="text-[10px] text-[#0f9d58]">{attached}</span> },
  ];

  return (
    <div className="flex-1 min-h-0 flex relative">
      {!minimized &&
        (leftOpen ? (
          <PanelShell side="left" width={lw} onWidth={setLw} testId="lab-left">
            <PanelTabs tabs={leftTabs} value={leftTab} onChange={setLeftTab} actions={<button type="button" className="fig-icon-btn" onClick={() => setLeftOpen(false)} title="접기">«</button>} />
            {leftTab === "structure" ? <StructurePanel /> : <ReferencePanel />}
          </PanelShell>
        ) : (
          <Rail
            side="left"
            items={leftTabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon, badge: t.id === "refs" ? pinned : undefined }))}
            onPick={(id) => {
              setLeftTab(id);
              setLeftOpen(true);
            }}
          />
        ))}
      {!minimized && <Copyholder />}
      <LabCanvas overlay={minimized ? <MinimizedHint /> : null} />
      {!minimized &&
        (rightOpen ? (
          <PanelShell side="right" width={rw} onWidth={setRw} testId="lab-right">
            <PanelTabs tabs={rightTabs} value={rightTab} onChange={setRightTab} actions={<button type="button" className="fig-icon-btn" onClick={() => setRightOpen(false)} title="접기">»</button>} />
            {rightTab === "ai" ? <AiPanel /> : <ResourcePanel />}
          </PanelShell>
        ) : (
          <Rail
            side="right"
            items={rightTabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon, badge: t.id === "res" ? attached : undefined }))}
            onPick={(id) => {
              setRightTab(id);
              setRightOpen(true);
            }}
          />
        ))}
    </div>
  );
};

/* ───────────────────────── B · 양쪽 쌓기 ───────────────────────── */

/** 위아래 나눔 — 가운데 손잡이로 비율 조절. */
const VSplit: React.FC<{ top: React.ReactNode; bottom: React.ReactNode; initial?: number }> = ({ top, bottom, initial = 0.5 }) => {
  const [ratio, setRatio] = React.useState(initial);
  const box = React.useRef<HTMLDivElement>(null);
  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const r = box.current?.getBoundingClientRect();
      if (r) setRatio(Math.max(0.15, Math.min(0.85, (ev.clientY - r.top) / r.height)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div ref={box} className="flex-1 min-h-0 flex flex-col">
      <div className="min-h-0 flex flex-col" style={{ flex: ratio }}>{top}</div>
      <div onPointerDown={start} className="h-1.5 shrink-0 cursor-row-resize bg-[var(--fig-border)] hover:bg-[var(--fig-brand)]/40" title="끌어서 위아래 비율 조절" />
      <div className="min-h-0 flex flex-col" style={{ flex: 1 - ratio }}>{bottom}</div>
    </div>
  );
};

export const VersionB: React.FC = () => {
  const minimized = useLabStore((s) => s.minimized);
  const pinned = useLabStore((s) => s.pinnedRefs.length);
  const attached = useLabStore((s) => s.attachedRes.length);
  const [lw, setLw] = useW(290);
  const [rw, setRw] = useW(380);
  return (
    <div className="flex-1 min-h-0 flex relative">
      {!minimized && (
        <PanelShell side="left" width={lw} onWidth={setLw} testId="lab-left">
          <VSplit
            initial={0.45}
            top={<><PanelHead title={<span className="flex items-center gap-1.5"><FolderTree className="w-3.5 h-3.5" />구조</span>} /><StructurePanel /></>}
            bottom={<><PanelHead title={<span className="flex items-center gap-1.5"><LayoutTemplate className="w-3.5 h-3.5 text-[#9747ff]" />레퍼런스</span>} meta={`${pinned} 물림`} /><ReferencePanel /></>}
          />
        </PanelShell>
      )}
      {!minimized && <Copyholder />}
      <LabCanvas overlay={minimized ? <MinimizedHint /> : null} />
      {!minimized && (
        <PanelShell side="right" width={rw} onWidth={setRw} testId="lab-right">
          <VSplit
            initial={0.4}
            top={<><PanelHead title={<span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-[#0f9d58]" />리소스 · 근거</span>} meta={`${attached} 물림`} /><ResourcePanel /></>}
            bottom={<><PanelHead title={<span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />AI</span>} /><AiPanel /></>}
          />
        </PanelShell>
      )}
    </div>
  );
};

/* ───────────────────────── C · 작업 배치 ───────────────────────── */

const PinnedRefsStrip: React.FC = () => {
  const pinned = useLabStore((s) => s.pinnedRefs);
  const openRefId = useLabStore((s) => s.openRefId);
  const openRef = useLabStore((s) => s.openRef);
  if (!pinned.length) return null;
  return (
    <div className="border-t border-[var(--fig-border)] p-2">
      <div className="text-[11px] text-[var(--fig-text-secondary)] mb-1 flex items-center gap-1">
        <Pin className="w-3 h-3 text-[#9747ff]" />이 문서의 레퍼런스
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {pinned.map((id) => {
          const item = itemById(id);
          if (!item) return null;
          return (
            <button
              key={id}
              type="button"
              title={item.title}
              onClick={() => openRef(openRefId === id ? null : id)}
              className={`shrink-0 rounded-md p-0.5 border ${openRefId === id ? "border-[var(--fig-brand)]" : "border-transparent hover:border-[var(--fig-border)]"}`}
            >
              <SkeletonThumb item={item} className="w-11 h-14" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const VersionC: React.FC = () => {
  const mode = useLabStore((s) => s.workMode);
  const setMode = useLabStore((s) => s.setWorkMode);
  const minimized = useLabStore((s) => s.minimized);
  // 배치마다 칸 너비를 따로 기억한다 (Cursor 에서 배치가 초기화된다는 불만의 반대).
  const [gl, setGl] = useW(380);
  const [gr, setGr] = useW(400);
  const [wl, setWl] = useW(260);
  const [wr, setWr] = useW(380);
  const [rv, setRv] = useW(440);

  useOnCite(() => {
    if (mode === "write") setMode("review");
  });

  if (mode === "gather") {
    return (
      <div className="flex-1 min-h-0 flex relative" data-testid="lab-mode-gather">
        <PanelShell side="left" width={gl} onWidth={setGl} testId="lab-left">
          <ReferencePanel variant="grid" showHead />
        </PanelShell>
        <div className="flex-1 min-w-0 flex flex-col bg-[#f4f5f7] border-r border-[var(--fig-border)] fig-panel">
          <ReferenceViewer onClose={() => useLabStore.getState().openRef(null)} />
        </div>
        <PanelShell side="right" width={gr} onWidth={setGr} testId="lab-right">
          <ResourcePanel showHead />
        </PanelShell>
      </div>
    );
  }
  if (mode === "review") {
    return (
      <div className="flex-1 min-h-0 flex relative" data-testid="lab-mode-review">
        <LabCanvas overlay={minimized ? <MinimizedHint /> : null} />
        {!minimized && (
          <PanelShell side="right" width={rv} onWidth={setRv} testId="lab-right">
            <VerifyPanel />
          </PanelShell>
        )}
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 flex relative" data-testid="lab-mode-write">
      {!minimized && (
        <PanelShell side="left" width={wl} onWidth={setWl} testId="lab-left">
          <PanelHead title={<span className="flex items-center gap-1.5"><FolderTree className="w-3.5 h-3.5" />구조</span>} />
          <StructurePanel />
          <PinnedRefsStrip />
        </PanelShell>
      )}
      {!minimized && <Copyholder />}
      <LabCanvas overlay={minimized ? <MinimizedHint /> : null} />
      {!minimized && (
        <PanelShell side="right" width={wr} onWidth={setWr} testId="lab-right">
          <PanelHead title={<span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />AI</span>} meta="근거는 모으기에서 고른 것" />
          <AiPanel />
        </PanelShell>
      )}
    </div>
  );
};

/* ───────────────────────── D · 캔버스 중심 ───────────────────────── */

type DPanel = "structure" | "refs" | "res" | "ai";
const D_LABEL: Record<DPanel, { label: string; icon: typeof FolderTree }> = {
  structure: { label: "구조", icon: FolderTree },
  refs: { label: "레퍼런스", icon: LayoutTemplate },
  res: { label: "리소스", icon: BookOpen },
  ai: { label: "AI", icon: Sparkles },
};

const DBody: React.FC<{ id: DPanel }> = ({ id }) =>
  id === "structure" ? <StructurePanel /> : id === "refs" ? <ReferencePanel /> : id === "res" ? <ResourcePanel /> : <AiPanel />;

export const VersionD: React.FC = () => {
  const minimized = useLabStore((s) => s.minimized);
  const [pinnedPanels, setPinned] = React.useState<DPanel[]>([]);
  const [peek, setPeek] = React.useState<DPanel | null>(null);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [widths, setWidths] = React.useState<Record<DPanel, number>>({ structure: 280, refs: 300, res: 340, ai: 380 });
  const peekTimer = React.useRef<number | undefined>(undefined);

  const schedulePeek = (id: DPanel | null) => {
    window.clearTimeout(peekTimer.current);
    if (id) setPeek(id);
    else peekTimer.current = window.setTimeout(() => setPeek(null), 220);
  };
  const togglePin = (id: DPanel) => {
    setPinned((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    setPeek(null);
  };
  useOnCite(() => {
    if (!pinnedPanels.includes("res")) setPeek("res");
  });

  const leftIds: DPanel[] = ["structure", "refs"];
  const rightIds: DPanel[] = ["res", "ai"];
  const docked = (side: "left" | "right") => (side === "left" ? leftIds : rightIds).filter((id) => pinnedPanels.includes(id));
  const railItems = (ids: DPanel[]) => ids.map((id) => ({ id, label: D_LABEL[id].label, icon: D_LABEL[id].icon, active: pinnedPanels.includes(id) || peek === id }));
  const peekSide = peek ? (leftIds.includes(peek) ? "left" : "right") : null;

  return (
    <div className="flex-1 min-h-0 flex relative" data-testid="lab-version-d">
      {!minimized &&
        docked("left").map((id) => (
          <PanelShell key={id} side="left" width={widths[id]} onWidth={(w) => setWidths((s) => ({ ...s, [id]: w }))} testId={`lab-dock-${id}`}>
            <PanelHead title={D_LABEL[id].label} onClose={() => togglePin(id)} />
            <DBody id={id} />
          </PanelShell>
        ))}
      {!minimized && <Copyholder />}
      <LabCanvas
        overlay={
          minimized ? (
            <MinimizedHint />
          ) : (
            <>
              <Rail side="left" floating items={railItems(leftIds)} onPick={(id) => togglePin(id as DPanel)} onPeek={(id) => schedulePeek(id as DPanel | null)} />
              <Rail side="right" floating items={railItems(rightIds)} onPick={(id) => togglePin(id as DPanel)} onPeek={(id) => schedulePeek(id as DPanel | null)} />
              {peek && !pinnedPanels.includes(peek) && (
                <div
                  data-testid="lab-peek"
                  onMouseEnter={() => schedulePeek(peek)}
                  onMouseLeave={() => schedulePeek(null)}
                  className={`fig-panel absolute top-3 bottom-24 w-[340px] z-40 rounded-xl bg-white border border-[var(--fig-border)] shadow-2xl flex flex-col overflow-hidden ${
                    peekSide === "left" ? "left-[64px]" : "right-[64px]"
                  }`}
                >
                  <PanelHead
                    title={D_LABEL[peek].label}
                    actions={
                      <button type="button" className="fig-btn" onClick={() => togglePin(peek)}>
                        <Pin className="w-3 h-3" />고정
                      </button>
                    }
                  />
                  <DBody id={peek} />
                </div>
              )}
              {!pinnedPanels.includes("ai") && (
                <div className="fig-panel absolute left-1/2 -translate-x-1/2 bottom-12 z-30 w-[min(560px,calc(100%-160px))]">
                  {aiOpen && (
                    <div className="mb-2 max-h-[46vh] overflow-y-auto rounded-xl bg-white border border-[var(--fig-border)] shadow-2xl p-3" data-testid="lab-ai-pop">
                      <div className="flex items-center mb-2 text-[11.5px] text-[var(--fig-text-secondary)]">
                        AI 대화
                        <button type="button" className="fig-link ml-auto" onClick={() => togglePin("ai")}>오른쪽에 고정</button>
                        <button type="button" className="fig-icon-btn ml-1" onClick={() => setAiOpen(false)} title="접기">×</button>
                      </div>
                      <AiThread />
                    </div>
                  )}
                  <div className="shadow-xl rounded-xl">
                    <AiComposerBox onFocus={() => setAiOpen(true)} />
                  </div>
                </div>
              )}
            </>
          )
        }
      />
      {!minimized &&
        docked("right").map((id) => (
          <PanelShell key={id} side="right" width={widths[id]} onWidth={(w) => setWidths((s) => ({ ...s, [id]: w }))} testId={`lab-dock-${id}`}>
            <PanelHead title={D_LABEL[id].label} onClose={() => togglePin(id)} />
            <DBody id={id} />
          </PanelShell>
        ))}
    </div>
  );
};

/* ───────────────────────── E · 대화 중심 ───────────────────────── */

const RefStrip: React.FC = () => {
  const roles = useLabStore((s) => s.roles);
  const openRefId = useLabStore((s) => s.openRefId);
  const openRef = useLabStore((s) => s.openRef);
  const setLibrary = useLabStore((s) => s.setLibrary);
  const ids = Object.keys(roles).filter((id) => roles[id].ref);
  return (
    <div className="fig-panel shrink-0 h-[92px] px-3 flex items-center gap-2 bg-white border-b border-[var(--fig-border)] overflow-x-auto" data-testid="lab-ref-strip">
      <span className="shrink-0 w-14 text-[11px] text-[var(--fig-text-secondary)] leading-4">
        <LayoutTemplate className="w-3.5 h-3.5 text-[#9747ff] mb-0.5" />레퍼런스
      </span>
      {ids.map((id) => {
        const item = itemById(id);
        if (!item) return null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => openRef(openRefId === id ? null : id)}
            title={item.title}
            className={`shrink-0 w-[132px] h-[76px] rounded-lg border p-1 flex gap-1.5 text-left ${openRefId === id ? "border-[var(--fig-brand)] bg-[var(--fig-selected)]" : "border-[var(--fig-border)] hover:bg-[var(--fig-hover)]"}`}
          >
            <SkeletonThumb item={item} className="w-12 h-full shrink-0" />
            <span className="text-[11px] leading-[14px] line-clamp-4">{item.title}</span>
          </button>
        );
      })}
      <button type="button" className="fig-btn shrink-0" onClick={() => setLibrary(true)}>+ 자료실</button>
    </div>
  );
};

export const VersionE: React.FC = () => {
  const minimized = useLabStore((s) => s.minimized);
  const openRefId = useLabStore((s) => s.openRefId);
  const attached = useLabStore((s) => s.attachedRes.length);
  const [lw, setLw] = useW(280);
  const [cw, setCw] = useW(440);
  return (
    <div className="flex-1 min-h-0 flex relative" data-testid="lab-version-e">
      {!minimized && (
        <PanelShell side="left" width={lw} onWidth={setLw} testId="lab-left">
          <PanelHead title={<span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-[#0f9d58]" />리소스 · 근거</span>} meta={`${attached} 물림`} />
          <ResourcePanel />
        </PanelShell>
      )}
      {!minimized && (
        <PanelShell side="left" width={cw} onWidth={setCw} min={340} max={720} testId="lab-chat">
          <PanelHead title={<span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />AI 대화</span>} meta="문서는 오른쪽에서 바로 바뀝니다" />
          <AiPanel />
        </PanelShell>
      )}
      <LabCanvas
        top={minimized ? null : <RefStrip />}
        overlay={
          minimized ? (
            <MinimizedHint />
          ) : openRefId ? (
            <div className="fig-panel absolute left-3 top-3 bottom-3 w-[min(420px,48%)] z-20 rounded-xl bg-[#f4f5f7] border border-[var(--fig-border)] shadow-2xl flex flex-col overflow-hidden" data-testid="lab-ref-overlay">
              <ReferenceViewer compact />
            </div>
          ) : null
        }
      />
    </div>
  );
};
