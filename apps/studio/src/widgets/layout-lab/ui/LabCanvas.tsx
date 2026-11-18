import React from "react";
import { Image as ImageIcon } from "lucide-react";

import { LAB_DOC } from "../model/dummy";
import { useLayoutLabStore } from "@/features/layout-lab";

import { FormAbsence, FormCertificate } from "./FormPages";
import { SkeletonCanvas } from "./skeleton/SkeletonCanvas";
import { useLabStore } from "../model/useLabStore";

const Cite: React.FC<{ n: number }> = ({ n }) => {
  const cite = useLabStore((s) => s.cite);
  const active = useLabStore((s) => s.activeCite === n);
  return (
    <sup>
      <button
        type="button"
        onClick={() => cite(active ? null : n)}
        data-testid={`lab-cite-${n}`}
        className={`px-[3px] rounded text-[9.5px] font-bold ${active ? "bg-[#0f9d58] text-white" : "text-[#0f9d58] hover:bg-[#0f9d58]/10"}`}
        title="출처 보기"
      >
        [{n}]
      </button>
    </sup>
  );
};

/** 캔버스가 화면에서 차지하는 폭 — 버전끼리 비교하라고 오른쪽 아래에 띄운다. */
const CanvasMeter: React.FC<{ target: React.RefObject<HTMLDivElement | null> }> = ({ target }) => {
  const [m, setM] = React.useState({ w: 0, pct: 0 });
  React.useLayoutEffect(() => {
    const measure = () => {
      const el = target.current;
      if (!el) return;
      const w = el.getBoundingClientRect().width;
      setM({ w: Math.round(w), pct: Math.round((w / Math.max(1, window.innerWidth)) * 100) });
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (target.current) ro?.observe(target.current);
    window.addEventListener("resize", measure);
    // 칸을 열고 닫을 때도 다시 잰다 (ResizeObserver 가 늦거나 없는 환경 대비)
    const t = window.setInterval(measure, 500);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.clearInterval(t);
    };
  }, [target]);
  return (
    <div
      data-testid="lab-canvas-meter"
      data-pct={m.pct}
      className="absolute right-3 bottom-3 z-10 px-2 h-6 rounded-md bg-black/70 text-white text-[11px] flex items-center gap-1.5 tabular-nums pointer-events-none"
    >
      캔버스 {m.pct}% · {m.w}px
    </div>
  );
};

const PageBody: React.FC<{ pageId: string; title: string; index: number }> = ({ pageId, title, index }) => {
  if (pageId === "p6") return <FormAbsence />;
  if (pageId === "p7") return <FormCertificate />;
  if (pageId !== "p1") {
    return (
      <>
        <h2 className="text-[17px] font-bold mb-3">{title}</h2>
        <div className="space-y-2">
          {Array.from({ length: 9 }, (_, k) => (
            <div key={k} className="h-2.5 rounded bg-black/[0.07]" style={{ width: `${70 + ((k * 13 + index * 7) % 30)}%` }} />
          ))}
        </div>
        <div className="mt-5 h-32 rounded bg-black/[0.04] border border-dashed border-black/10 flex items-center justify-center text-[11px] text-black/35">
          <ImageIcon className="w-4 h-4 mr-1" />그림 칸
        </div>
      </>
    );
  }
  return (
    <>
      <div className="flex items-center gap-2 text-[10.5px] text-black/45 mb-1">정례 회의록 표준 양식 (GSV-01)</div>
      <h2 className="text-[18px] font-bold mb-3">{title}</h2>
      <div className="grid grid-cols-2 gap-3 mb-4 text-[11.5px]">
        <div data-anchor="meta" className="rounded border border-black/10 p-2 leading-[18px]">
          <b>일시:</b> 2026-10-28 14:00<br />
          <b>주관:</b> 아키텍처 위원회<br />
          <b>핵심 기조:</b> PandaDoc 80% + 백데이터/인라인 AI 20%
        </div>
        <div data-anchor="summary" className="rounded border border-black/10 p-2 leading-[18px]">
          <b>Executive Summary</b>
          <br />
          거대 모놀리식(LibreOffice/VSCode) 대신 확장 가능한 코어 + 플러그인 구조로 가기로 합의했다
          <Cite n={1} />.
        </div>
      </div>
      <div data-anchor="decisions" className="rounded mb-3">
      <h3 className="text-[13px] font-bold mb-1.5">핵심 협의 및 결의사항</h3>
      <p className="text-[12px] leading-[20px]">
        Kolas Editor 를 참고해 칸(슬롯)을 독립 단위로 분리했고, 내부 시험에서 편집 충돌이 82% 줄었다
        <Cite n={2} />. LibreOffice 코어는 빌드에 3시간 이상 걸려
        <Cite n={4} /> 그대로 들여오기 어렵다는 의견이 많았다.
      </p>
      </div>
      <table data-anchor="table" className="w-full text-[11.5px] border border-black/15 mb-3">
        <thead>
          <tr className="bg-black/[0.04]">
            <th className="border border-black/10 p-1 text-left">항목</th>
            <th className="border border-black/10 p-1 text-left">내용</th>
            <th className="border border-black/10 p-1 text-left">담당</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black/10 p-1">구조</td>
            <td className="border border-black/10 p-1">코어 + 플러그인<Cite n={1} /></td>
            <td className="border border-black/10 p-1">김민지</td>
          </tr>
          <tr>
            <td className="border border-black/10 p-1">예산</td>
            <td className="border border-black/10 p-1">4분기 집행률 64%<Cite n={3} /></td>
            <td className="border border-black/10 p-1">이도윤</td>
          </tr>
          <tr>
            <td className="border border-black/10 p-1">효과</td>
            <td className="border border-black/10 p-1 bg-[#fff6e5]">도입 후 운영비 30% 절감 예상 (출처 없음)</td>
            <td className="border border-black/10 p-1">박서준</td>
          </tr>
        </tbody>
      </table>
      <div data-anchor="actions" className="rounded border border-dashed border-[#f2c94c] bg-[#fffbeb] p-2 mb-3 text-[11.5px] leading-[18px]">
        <b>차주 핵심 실행 과제 (Action Items)</b>
        <ul className="list-disc pl-4 text-black/40">
          <li>항목을 입력하세요</li>
          <li>항목을 입력하세요</li>
          <li>항목을 입력하세요</li>
        </ul>
      </div>
      <div data-anchor="photos" className="grid grid-cols-2 gap-3 rounded">
        <div className="h-24 rounded bg-[#1f2b33] text-white p-3 text-[14px] font-bold">제목<div className="text-[10px] font-normal opacity-70">부제</div></div>
        <div className="h-24 rounded bg-[#1f2b33] text-white p-3 text-[14px] font-bold">제목<div className="text-[10px] font-normal opacity-70">부제</div></div>
      </div>
    </>
  );
};

/** 더미 캔버스 — 쪽 몇 장, 글 속 출처 번호를 누르면 근거 칸이 그 대목을 보여 준다. */
export const LabCanvas: React.FC<{ top?: React.ReactNode; overlay?: React.ReactNode; className?: string }> = ({ top, overlay, className = "" }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const setPage = useLabStore((s) => s.setPage);
  // 뼈대 편집(O7)은 고정 그림 대신 아웃라인 데이터로 그린다.
  const skeleton = useLayoutLabStore((s) => s.outline === "o7");
  return (
    <div ref={ref} className={`relative flex-1 min-w-0 min-h-0 flex flex-col bg-[#e9eaee] ${className}`} data-testid="lab-canvas">
      {top}
      <div className="relative flex-1 min-h-0">
        <div
          className="absolute inset-0 overflow-y-auto px-6 py-6"
          onScroll={(e) => {
            if (skeleton) return;
            const box = e.currentTarget.getBoundingClientRect();
            for (const p of LAB_DOC.pages) {
              const el = document.getElementById(`lab-page-${p.id}`);
              if (el && el.getBoundingClientRect().bottom > box.top + 80) {
                setPage(p.id);
                break;
              }
            }
          }}
        >
          {skeleton ? (
            <SkeletonCanvas />
          ) : (
          <div className="flex flex-col items-center gap-6">
            {LAB_DOC.pages.map((p, i) => (
              <div
                key={p.id}
                id={`lab-page-${p.id}`}
                data-anchor={p.id}
                className="bg-white shadow-sm border border-black/5 w-full max-w-[794px] aspect-[210/297] p-[6%] overflow-hidden"
              >
                <PageBody pageId={p.id} title={p.title} index={i} />
              </div>
            ))}
          </div>
          )}
        </div>
        {overlay}
      </div>
      <CanvasMeter target={ref} />
    </div>
  );
};
