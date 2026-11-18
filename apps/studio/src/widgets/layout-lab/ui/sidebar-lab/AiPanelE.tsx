import React from "react";
import { ArrowUp, FileText, Sparkles, X } from "lucide-react";

import { indexOf, type SbChapter, type SbSection } from "../../model/sidebarDummy";
import { DRAG_MIME, useELabStore, type DragNode } from "../../model/useELabStore";
import { useLabStore } from "../../model/useLabStore";
import { activeDoc, scenarioOf, useScenario, useSidebarLabStore } from "../../model/useSidebarLabStore";
import { findInWorkspace, ImportButton } from "./SidebarE";

/**
 * 시안 E 의 AI 대화 칸 (안티그래비티 · 커서의 에이전트 칸처럼 오른쪽).
 * 작업 공간 어디서든 장 · 구역을 끌어다 놓으면 참고로 붙는다. "지금 쓰는 곳"은 저절로 붙는다.
 * 대답은 시제품용 고정 문장 — 붙인 참고를 바탕으로 구역을 제안하고, "목차에 넣기"로 바로 목차가 바뀐다.
 */

let mid = 0;

/** 참고 하나를 실제 내용으로 */
function resolve(n: DragNode): { chapter?: SbChapter; section?: SbSection; from: string } | null {
  if (n.projectId) {
    const r = findInWorkspace(n.projectId, n.id);
    return r ? { chapter: r.chapter, section: r.section, from: `${r.project.name} (${r.project.note})` } : null;
  }
  const sc = useSidebarLabStore.getState();
  const e = indexOf(scenarioOf(sc.scenario, sc.docs)).get(n.id);
  return e ? { chapter: e.chapter, section: e.section, from: "지금 쓰는 원고" } : null;
}

export const AiPanelE: React.FC = () => {
  const sc = useScenario();
  const chips = useELabStore((s) => s.chips);
  const messages = useELabStore((s) => s.messages);
  const dragging = useELabStore((s) => s.dragging);
  const addChip = useELabStore((s) => s.addChip);
  const removeChip = useELabStore((s) => s.removeChip);
  const push = useELabStore((s) => s.push);
  const markApplied = useELabStore((s) => s.markApplied);
  const setDragging = useELabStore((s) => s.setDragging);
  const selectedId = useSidebarLabStore((s) => s.selectedId);
  const viewChapterId = useSidebarLabStore((s) => s.viewChapterId);
  const docId = useSidebarLabStore((s) => s.activeDocId);
  const addSections = useSidebarLabStore((s) => s.addSections);
  const select = useSidebarLabStore((s) => s.select);
  const say = useLabStore((s) => s.say);
  const [text, setText] = React.useState("");
  const [over, setOver] = React.useState(false);
  const list = React.useRef<HTMLDivElement>(null);

  // 지금 쓰는 곳: 고른 줄의 장, 없으면 본문에 보이는 장
  const idx = indexOf(sc);
  const here = (selectedId ? idx.get(selectedId)?.chapter : undefined) ?? (viewChapterId ? idx.get(viewChapterId)?.chapter : undefined) ?? activeDoc(sc, docId).chapters[0];
  const hereNo = here ? activeDoc(sc, docId).chapters.indexOf(here) + 1 : 0;

  React.useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = (raw?: string) => {
    const t = (raw ?? text).trim();
    if (!t || !here) return;
    setText("");
    push({ id: `m${mid++}`, role: "user", text: t, refs: chips.map((c) => c.label) });
    // 시제품: 붙인 참고의 구역을 지금 장에 맞춰 다시 짜는 제안
    const items: { name: string; intent: string; sample: string; cites?: string[] }[] = [];
    for (const c of chips) {
      const r = resolve(c);
      if (!r) continue;
      const secs = r.section ? [r.section] : (r.chapter?.sections ?? []);
      for (const s of secs.slice(0, 2)) {
        const exists = here.sections.some((x) => x.name === s.name);
        items.push({
          name: exists ? `${s.name} (보강)` : s.name,
          intent: `${r.from}의 '${s.name}'을 지금 장에 맞게 다시 씀`,
          sample: s.slots[0]?.value ?? s.slots[0]?.sample ?? s.intent,
          cites: sc.sources.filter((x) => x.kind === "resource").slice(0, 1).map((x) => x.id),
        });
      }
    }
    if (!items.length)
      items.push(
        { name: "들어가며 — 왜 이 장인가", intent: "독자가 이 장을 읽어야 하는 이유", sample: "지난 판 이후 달라진 것부터 짚는다." },
        { name: "새 사례", intent: "최근 사례 하나로 요지 보여 주기", sample: "2020년대 사례 한 가지", cites: sc.sources.filter((x) => x.kind === "resource").slice(0, 1).map((x) => x.id) },
      );
    const refsText = chips.length ? chips.map((c) => `「${c.label}」`).join(", ") + "을(를) 참고해서 " : "";
    window.setTimeout(
      () =>
        push({
          id: `m${mid++}`,
          role: "ai",
          text: `${refsText}'${hereNo} ${here.name}'에 넣을 구역 ${items.length}개를 골라 봤어요. 넣으면 목차와 캔버스에 바로 생기고, 칸은 빈칸으로 시작해요.`,
          proposal: { chapterId: here.id, chapterName: `${hereNo} ${here.name}`, items },
        }),
      450,
    );
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const raw = e.dataTransfer.getData(DRAG_MIME);
    setDragging(null);
    if (!raw) return;
    try {
      addChip(JSON.parse(raw) as DragNode);
    } catch {
      /* 다른 곳에서 끌어온 것 */
    }
  };

  const suggestions = [
    chips.length ? "붙인 장을 참고해서 이 장 구성을 다시 짜 줘" : "넛지 1의 기본값 장을 끌어다 놓고, 이 장 구성을 다시 짜 줘",
    "지난 판과 달라진 점만 구역으로 뽑아 줘",
    "이 장에 빠진 반론이 있는지 봐 줘",
  ];

  return (
    <aside
      className="fig-panel w-[320px] shrink-0 min-h-0 flex flex-col bg-white border-l border-[var(--fig-border)]"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={onDrop}
      data-testid="sb-e-ai"
    >
      <div className="h-10 shrink-0 px-3 flex items-center gap-1.5 border-b border-[var(--fig-border)]">
        <Sparkles className="w-3.5 h-3.5 text-violet-600" />
        <span className="text-[12.5px] font-semibold text-slate-800">AI 대화</span>
        <span className="ml-auto text-[10.5px] text-slate-400">{sc.workspaceName ? "작업 공간 전체를 봐요" : "이 프로젝트를 봐요"}</span>
      </div>

      <div ref={list} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11.5px] text-slate-500 leading-5">
              왼쪽 목차에서 장이나 구역을 이 칸으로 끌어다 놓으면 참고로 붙어요. 다른 프로젝트의 장도 됩니다.
            </p>
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setText(s)} className="text-left text-[12px] px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="self-end max-w-[88%] flex flex-col items-end gap-1">
              {!!m.refs?.length && (
                <div className="flex flex-wrap justify-end gap-1">
                  {m.refs.map((r) => (
                    <span key={r} className="text-[10px] px-1.5 rounded bg-slate-100 text-slate-500 truncate max-w-[220px]">
                      {r}
                    </span>
                  ))}
                </div>
              )}
              <div className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[12.5px] leading-5">{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col gap-2 text-[12.5px] leading-5 text-slate-800">
              <p>{m.text}</p>
              {m.proposal && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-2.5 flex flex-col gap-1.5">
                  <div className="text-[11px] font-semibold text-violet-800">제안 · {m.proposal.chapterName}에 구역 추가</div>
                  {m.proposal.items.map((it) => (
                    <div key={it.name} className="flex gap-1.5">
                      <span className="mt-2 w-1 h-1 rounded-full bg-violet-400 shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-900">{it.name}</span>
                        <span className="block text-[11px] text-slate-500">{it.intent}</span>
                      </span>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={m.proposal.applied}
                    onClick={() => {
                      const p = m.proposal!;
                      if (addSections(p.chapterId, p.items)) {
                        markApplied(m.id);
                        useSidebarLabStore.getState().setOpen(p.chapterId, true);
                        select(p.chapterId);
                        say(`${p.chapterName}에 구역 ${p.items.length}개를 넣었어요 — Ctrl+Z 로 되돌리기`);
                      }
                    }}
                    className="self-start mt-1 h-7 px-2.5 rounded-md text-[11.5px] font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {m.proposal.applied ? "목차에 넣었어요" : "목차에 넣기"}
                  </button>
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <div className={`shrink-0 m-2 rounded-lg border ${over || dragging ? "border-violet-400 ring-2 ring-violet-200" : "border-slate-200"} bg-white`}>
        <div className="px-2 pt-2 flex flex-wrap gap-1">
          {here && (
            <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-slate-100 text-[10.5px] text-slate-600 max-w-full" title="지금 쓰는 곳 — 저절로 붙어요">
              <FileText className="w-3 h-3 shrink-0" />
              <span className="truncate">쓰는 곳 · {hereNo} {here.name}</span>
            </span>
          )}
          {chips.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 h-5 pl-1.5 pr-0.5 rounded bg-violet-100 text-[10.5px] text-violet-800 max-w-full" data-testid="sb-e-chip">
              <span className="truncate">{c.label}</span>
              <button type="button" onClick={() => removeChip(c.id)} className="w-4 h-4 grid place-items-center rounded hover:bg-violet-200" title="떼기">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          {(over || dragging) && <span className="h-5 px-1.5 rounded border border-dashed border-violet-400 text-[10.5px] text-violet-700">여기에 놓으면 참고로 붙어요</span>}
        </div>
        <div className="flex items-end gap-1.5 p-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="무엇을 쓸까요? (장을 끌어다 놓아 참고로)"
            className="flex-1 min-w-0 resize-none text-[12.5px] leading-5 outline-none placeholder:text-slate-400"
            data-testid="sb-e-input"
          />
          <button type="button" onClick={() => send()} disabled={!text.trim()} className="w-7 h-7 rounded-md grid place-items-center bg-slate-900 text-white disabled:bg-slate-200" title="보내기 (Enter)">
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

/** 다른 프로젝트의 장 미리보기 — 캔버스 위에 떠서 읽기만 */
export const PeekE: React.FC = () => {
  const peek = useELabStore((s) => s.peek);
  const setPeek = useELabStore((s) => s.setPeek);
  const addChip = useELabStore((s) => s.addChip);
  const say = useLabStore((s) => s.say);
  if (!peek) return null;
  const r = findInWorkspace(peek.projectId, peek.chapterId);
  if (!r) return null;
  const label = `${r.project.name} · ${r.no} ${r.chapter.name}`;
  return (
    <div className="absolute left-5 top-14 z-30 w-[460px] max-w-[calc(100%-40px)] max-h-[62%] flex flex-col rounded-xl bg-white border border-slate-200 shadow-2xl" data-testid="sb-e-peek">
      <div className="px-4 pt-3 pb-2 border-b border-slate-100 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-slate-400">
            {r.project.name} · {r.project.note} · {r.doc.name} · 읽기 전용
          </div>
          <div className="text-[15px] font-bold text-slate-900 truncate">
            <span className="text-slate-300 mr-1.5">{r.no}</span>
            {r.chapter.name}
          </div>
          <div className="text-[12px] text-slate-500">{r.chapter.syn}</div>
        </div>
        <button type="button" onClick={() => setPeek(null)} className="fig-icon-btn" title="닫기">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {r.chapter.sections.map((s) => (
          <div key={s.id}>
            <div className="text-[11px] font-semibold text-slate-400 mb-1">{s.name}</div>
            {s.slots.map((x) => (
              <p key={x.id} className="text-[13px] leading-6 text-slate-700">
                {x.name !== "요지" && <b className="mr-1.5 text-slate-900">{x.name}.</b>}
                {x.value ?? x.sample ?? <span className="text-slate-400">비어 있음</span>}
              </p>
            ))}
          </div>
        ))}
      </div>
      <div className="px-4 py-2.5 border-t border-slate-100 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            addChip({ projectId: r.project.id, id: r.chapter.id, kind: "chapter", label });
            say(`대화에 붙였어요 — ${label}`);
          }}
          className="h-7 px-2.5 rounded-md text-[11.5px] font-semibold flex items-center gap-1 bg-violet-600 text-white hover:bg-violet-700"
        >
          <Sparkles className="w-3.5 h-3.5" />
          대화에 붙이기
        </button>
        <ImportButton projectId={r.project.id} id={r.chapter.id} big />
        <span className="ml-auto text-[10.5px] text-slate-400">끌어서 놓아도 돼요</span>
      </div>
    </div>
  );
};
