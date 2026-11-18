import React from "react";
import { Library, Maximize2, X } from "lucide-react";

import {
  LAB_VERSIONS,
  LayoutLabPicker,
  OUTLINE_VERSIONS,
  SIDEBAR_VERSIONS,
  useLayoutLabStore,
  type LabVersionId,
  type OutlineVersionId,
  type SidebarVersionId,
} from "@/features/layout-lab";

import { LAB_DOC } from "../model/dummy";
import { useLabStore, type WorkMode } from "../model/useLabStore";
import { LibraryModal } from "./LibraryModal";
import { SidebarLab } from "./sidebar-lab/SidebarLab";
import { CardProto } from "./card-proto/CardProto";
import { VersionA, VersionB, VersionC, VersionD, VersionE } from "./versions";

/** 버전마다 "이걸 해 보세요" — 직접 써 보며 판단하라고. */
const TRY: Record<Exclude<LabVersionId, "current">, string> = {
  a: "왼쪽 레퍼런스 탭에서 자료를 눌러 캔버스 옆에 열기 · 글 속 [1] 을 눌러 오른쪽이 리소스로 바뀌는지 · « » 로 접어 레일 쓰기",
  b: "양쪽 칸 가운데 손잡이로 위아래 비율 조절 · 모든 걸 한 번에 볼 때 캔버스 폭이 얼마나 남는지",
  c: "위의 모으기 · 쓰기 · 검토 (Alt+1·2·3) 전환 · 모으기에서 고른 레퍼런스가 쓰기의 왼쪽 아래 · 캔버스 옆에 따라오는지",
  d: "가장자리 레일에 마우스를 올려 미리 보기 → 고정 · 아래 입력줄을 눌러 AI 대화 열기",
  e: "왼쪽 근거 · 가운데 대화 · 오른쪽 캔버스 · 캔버스 위 띠에서 레퍼런스를 눌러 겹쳐 보기",
};

const OUTLINE_TRY: Record<Exclude<OutlineVersionId, "current">, string> = {
  o1: "왼쪽 노드를 눌러 캔버스로 이동 · 노드를 고르고 Enter(새 절) · Tab / Shift+Tab(들여쓰기) · 두 번 눌러 이름 바꾸기 · 표가 칸이 아니라 노드 하나인지",
  o2: "위의 1 뼈대 · 2 서식 · 3 내용 렌즈를 바꿔 같은 트리가 단계마다 어떻게 읽히는지 · '이름 필요' 노드",
  o3: "카드를 끌어 절 순서 바꾸기 · 위의 쪽 칩으로 다른 쪽 카드 보기 · 의도 한 줄이 기획에 충분한지",
  o4: "흐린 AI 제안 노드 받기 / 버리기 · 노드에 올려 '의도대로 채우기' · 아래 'AI 가 보는 뼈대' 펼치기",
  o7: "새 문서: 목적 쓰고 AI 목차 제안 → 받기 · Enter / Tab / 끌어서 옮기기(가운데=안으로) → 2 서식에서 ⋯ 서식 꽂기 · 칸 스키마 고치기 → 3 내용에서 AI 로 채우기 · 가져온 서식: 섹션 옮기면 캔버스도 옮겨짐 · Ctrl+Z",
  o6: "위 쪽 칩으로 1 · 6 · 7쪽 서식 바꾸기 · 'AI 채우기 미리보기' 로 AI 가 채울 칸(보라) / 못 채울 칸(자물쇠) · 칸을 눌러 내보내기 매핑 · 아래 JSON 이 AI 에게 가는 모양",
  o5: "6 · 7쪽 서식을 '지금 트리' 와 번갈아 보기 · 블록을 눌러 아래 속성(칸) 보기 · 위 숫자로 자동 이름 비율 · 고정 글 숨기기",
};

const SIDEBAR_TRY: Record<Exclude<SidebarVersionId, "current">, string> = {
  sa: "위 '예시 문서'를 회의록 · 카드 안내장 · 청원서로 바꿔 같은 나무가 버티는지 · 보일 단계(장 · 구역 · 칸) · 오른쪽 아래 다음 할 일 · 본문 칸을 누르면 트리가 따라 펼쳐지는지",
  sb: "목차에서 구역을 고르면 아래 '할 일' 목록이 바뀌는지 · 청원서(29장)에서 위 목차가 얼마나 길어지는지 · 1 · 2 단계에서 아래 칸이 쓸모 있는지",
  se: "예시 문서를 '넛지 시리즈'로 · 아래 넛지 1 의 장을 오른쪽 대화로 끌어다 놓고 보내기 → '목차에 넣기' · 두 번 눌러 이름 · Enter · Tab · Alt+↑↓ · 장 번호를 눌러 확대 · 다른 프로젝트 장을 내 목차로 끌어 가져오기",
  sd: "A · B · C 와 번갈아 보며 덜어낸 것이 아쉬운지 · 청원서에서 장까지만 접힌 목차 + 부 접기 + 찾기로 충분한지 · 점 하나로 어디를 열지 알 수 있는지",
  sc: "청원서로 바꿔 왼쪽 띠만 보고 어느 부 · 장이 비었는지 말해 보기 · 회의록(3장)에서 띠가 쓸모 있는지 · 본문을 스크롤하면 파란 틀이 따라오는지",
};

const MODES: { id: WorkMode; label: string }[] = [
  { id: "gather", label: "모으기" },
  { id: "write", label: "쓰기" },
  { id: "review", label: "검토" },
];

/** 레이아웃 실험 화면 — 더미 데이터로 배치만 맛본다. */
export const LabWorkspace: React.FC = () => {
  // 아웃라인 실험만 골랐으면 A 배치 안에서 보여 준다.
  const picked = useLayoutLabStore((s) => s.version);
  const outline = useLayoutLabStore((s) => s.outline);
  const version = (picked === "current" ? "a" : picked) as Exclude<LabVersionId, "current">;
  const info = LAB_VERSIONS.find((v) => v.id === version);
  const outlineInfo = OUTLINE_VERSIONS.find((v) => v.id === outline && v.id !== "current");
  // 사이드바 시안을 골랐으면 그 화면이 먼저다 (레이아웃 · 아웃라인 실험은 뒤로).
  const sidebar = useLayoutLabStore((s) => s.sidebar);
  const sidebarInfo = SIDEBAR_VERSIONS.find((v) => v.id === sidebar && v.id !== "current");
  const proto = useLayoutLabStore((s) => s.proto);
  const minimized = useLabStore((s) => s.minimized);
  const toggleMinimized = useLabStore((s) => s.toggleMinimized);
  const setLibrary = useLabStore((s) => s.setLibrary);
  const workMode = useLabStore((s) => s.workMode);
  const setWorkMode = useLabStore((s) => s.setWorkMode);
  const toast = useLabStore((s) => s.toast);
  const [tipHidden, setTipHidden] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true']");
      if (e.shiftKey && e.code === "Backslash" && !typing) {
        e.preventDefault();
        toggleMinimized();
      } else if (e.altKey && ["Digit1", "Digit2", "Digit3"].includes(e.code) && version === "c") {
        e.preventDefault();
        setWorkMode(MODES[Number(e.code.slice(-1)) - 1].id);
      } else if (e.key === "Escape") {
        const s = useLabStore.getState();
        if (s.libraryOpen) s.setLibrary(false);
        else if (s.openRefId) s.openRef(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMinimized, setWorkMode, version]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f4f5f7] text-slate-900 overflow-hidden select-none relative" data-testid="layout-lab">
      <header className="h-9 bg-[#f6f6f6] text-slate-700 px-2.5 flex items-center gap-3 shrink-0 z-30 border-b border-slate-200/80">
        <div className="flex items-center gap-1 shrink-0">
          <img src="/favicon.png" alt="" className="w-5 h-5 rounded object-cover border border-slate-200 bg-white shrink-0 mr-1" />
          {["File", "Edit", "View"].map((m) => (
            <span key={m} className="px-2 py-1 rounded-md text-[13px] text-slate-400" title="시제품에서는 메뉴가 동작하지 않습니다">
              {m}
            </span>
          ))}
          <LayoutLabPicker />
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-center">
          {version === "c" && !sidebarInfo ? (
            <div className="fig-panel fig-seg w-[210px] !h-[26px]" role="group" aria-label="작업 배치">
              {MODES.map((m, i) => (
                <button key={m.id} type="button" aria-pressed={workMode === m.id} onClick={() => setWorkMode(m.id)} title={`Alt+${i + 1}`} data-testid={`lab-mode-${m.id}`}>
                  {m.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-500 font-medium truncate">
              {LAB_DOC.project} — {LAB_DOC.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" className="h-6 px-2 rounded-md text-[11.5px] flex items-center gap-1 text-slate-600 hover:bg-slate-200/70" onClick={() => setLibrary(true)} data-testid="lab-open-library">
            <Library className="w-3.5 h-3.5" />자료실
          </button>
          <button
            type="button"
            aria-pressed={minimized}
            onClick={toggleMinimized}
            className={`h-6 px-2 rounded-md text-[11.5px] flex items-center gap-1 ${minimized ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-200/70"}`}
            title="캔버스만 보기 (Shift+\)"
          >
            <Maximize2 className="w-3.5 h-3.5" />캔버스만
          </button>
        </div>
      </header>

      {!tipHidden && proto && (
        <div className="fig-panel h-7 shrink-0 px-3 flex items-center gap-2 bg-violet-50 border-b border-violet-200 text-[11.5px] text-violet-900">
          <span className="font-semibold shrink-0">시제품 · 카드 안내장</span>
          <span className="truncate text-violet-800/80">해 볼 것 · 왼쪽에 메모 더 써 보기 → 오른쪽 '정돈 제안 보기' → 받기 → 줄 하나 골라 다른 카드사 비교 → 서식에서 판형 바꾸기 → 채우기에서 위험한 곳부터</span>
          <button type="button" className="ml-auto shrink-0 opacity-60 hover:opacity-100" onClick={() => setTipHidden(true)} title="숨기기">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {!tipHidden && !proto && (sidebarInfo || info) && (
        <div className="fig-panel h-7 shrink-0 px-3 flex items-center gap-2 bg-violet-50 border-b border-violet-200 text-[11.5px] text-violet-900">
          <span className="font-semibold shrink-0">{sidebarInfo ? `사이드바 ${sidebarInfo.name}` : `${info?.name}${outlineInfo ? ` + ${outlineInfo.name}` : ""}`}</span>
          <span className="truncate text-violet-800/80" title={sidebarInfo ? SIDEBAR_TRY[sidebarInfo.id as Exclude<SidebarVersionId, "current">] : undefined}>
            해 볼 것 ·{" "}
            {sidebarInfo
              ? SIDEBAR_TRY[sidebarInfo.id as Exclude<SidebarVersionId, "current">]
              : outlineInfo
                ? OUTLINE_TRY[outline as Exclude<OutlineVersionId, "current">]
                : TRY[version]}
          </span>
          <button type="button" className="ml-auto shrink-0 opacity-60 hover:opacity-100" onClick={() => setTipHidden(true)} title="숨기기">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {proto ? (
        <CardProto />
      ) : sidebarInfo ? (
        <SidebarLab variant={sidebarInfo.id as Exclude<SidebarVersionId, "current">} />
      ) : (
        <>
          {version === "a" && <VersionA />}
          {version === "b" && <VersionB />}
          {version === "c" && <VersionC />}
          {version === "d" && <VersionD />}
          {version === "e" && <VersionE />}
        </>
      )}

      <LibraryModal />
      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-5 z-[90] px-3 h-8 rounded-lg bg-slate-900 text-white text-[12px] flex items-center shadow-xl" data-testid="lab-toast">
          {toast}
        </div>
      )}
    </div>
  );
};
