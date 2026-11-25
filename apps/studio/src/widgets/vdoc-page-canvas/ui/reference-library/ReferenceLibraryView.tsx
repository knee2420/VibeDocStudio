import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plus,
  Type,
  X,
} from "lucide-react";

import { useReferenceStore, type BoundReference, type ReferenceKind, type ReferencePin } from "@/entities/reference-manager";
import { useReferenceRegionStore } from "@/features/ai-workspace";

import { ReferenceItemMenu } from "./ReferenceItemMenu";
import { useReferenceThumb } from "./referenceThumbs";

type KindTab = "all" | ReferenceKind;
type ViewMode = "grid" | "list";

const EMPTY_PINS: ReferencePin[] = [];
const LAYER_IDS = ["D1", "D2", "D3", "D4", "D5", "D6"];
const VIEW_KEY = "vdoc:reference-view";

const KIND_TABS: ReadonlyArray<{ id: KindTab; label: string }> = [
  { id: "all", label: "전체" },
  { id: "pdf", label: "PDF" },
  { id: "web", label: "웹" },
  { id: "image", label: "이미지" },
];

const KIND_META: Record<ReferenceKind, { label: string; icon: React.ReactNode; tone: string }> = {
  pdf: { label: "PDF", icon: <FileText className="w-3.5 h-3.5" />, tone: "text-[var(--vds-accent)]" },
  web: { label: "웹", icon: <Globe className="w-3.5 h-3.5" />, tone: "text-[var(--vds-accent)]" },
  image: { label: "이미지", icon: <ImageIcon className="w-3.5 h-3.5" />, tone: "text-[var(--vds-ink-secondary)]" },
};

const readView = (): ViewMode => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
};

/**
 * 레퍼런스 라이브러리 목록 (피그마 패널 톤 · 캔바처럼 파일 종류별 탭).
 * 탭: 전체 · PDF · 웹 · 이미지 — 보기: 그리드(첫 쪽 미리보기) · 리스트(핀까지 펼침).
 * 카드 · 줄의 ⋯ 는 "그 층위만 적용"(캔바의 텍스트만 · 색상만 적용 자리) · AI와 이야기하기 메뉴.
 */
export const ReferenceLibraryView: React.FC<{
  bound: BoundReference[];
  currentRefId: string | null;
  viewerOpen: boolean;
  /** 분할 작업창에서 아래 뷰어와 나눠 쓸 때의 높이 (없으면 남은 높이를 다 쓴다). */
  height?: number;
  canAdd: boolean;
  onAdd: () => void;
  onOpen: (refId: string) => void;
}> = ({ bound, currentRefId, viewerOpen, height, canAdd, onAdd, onOpen }) => {
  const pins = useReferenceStore((s) => s.pins);
  const checkedPinIds = useReferenceStore((s) => s.checkedPinIds);
  const focusedPin = useReferenceStore((s) => s.focusedPin);
  const store = useReferenceStore.getState;

  const [tab, setTab] = useState<KindTab>("all");
  const [view, setViewState] = useState<ViewMode>(readView);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ refId: string; anchor: DOMRect } | null>(null);

  const setView = (v: ViewMode) => {
    setViewState(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* 저장 못 해도 화면은 바뀐다 */
    }
  };

  const counts = useMemo(() => {
    const c: Record<KindTab, number> = { all: bound.length, pdf: 0, web: 0, image: 0 };
    for (const b of bound) c[b.item.kind] += 1;
    return c;
  }, [bound]);
  const visible = useMemo(() => bound.filter((b) => tab === "all" || b.item.kind === tab), [bound, tab]);
  const numberOf = (refId: string) => bound.findIndex((b) => b.refId === refId) + 1;
  const menuEntry = menu ? bound.find((b) => b.refId === menu.refId) : undefined;

  const openMenu = (e: React.MouseEvent<HTMLElement>, refId: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu((m) => (m?.refId === refId ? null : { refId, anchor: rect }));
  };

  if (bound.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10 text-center select-none">
        <BookOpen className="w-6 h-6 text-black/25" />
        <div className="text-[12.5px] font-semibold text-black/80">참고할 완성물을 추가해 보세요</div>
        <p className="max-w-[220px] text-[11.5px] leading-4 text-black/45">PDF · 웹 주소 · 이미지를 넣으면 어떻게 썼는지 층위별로 읽어 둬요.</p>
        <button
          type="button"
          disabled={!canAdd}
          onClick={onAdd}
          className="mt-1 h-7 px-3 rounded-[6px] bg-[var(--vds-accent)] hover:bg-[var(--vds-accent-hover)] text-white text-[12px] font-semibold inline-flex items-center gap-1 cursor-default disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />
          레퍼런스 추가
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="reference-library-view"
      style={height ? { height } : undefined}
      className={`fig-panel flex flex-col min-h-0 ${height ? "shrink-0" : "flex-1"}`}
    >
      {/* 파일 종류 탭 (캔바의 이미지 · 동영상 · 오디오 자리) + 보기 전환 */}
      <div className="px-2.5 pt-1.5 flex items-end justify-between gap-2 border-b border-[var(--fig-border)] shrink-0">
        <div role="tablist" className="flex items-end gap-3 min-w-0 overflow-x-auto no-scrollbar">
          {KIND_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              data-testid={`reference-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`h-8 shrink-0 inline-flex items-center gap-1 border-b-2 -mb-px text-[12px] cursor-default ${
                tab === t.id ? "border-black/85 text-black/90 font-semibold" : "border-transparent text-black/45 hover:text-black/75"
              }`}
            >
              {t.label}
              <span className="text-[10.5px] font-normal text-black/35">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <div className="mb-1.5 flex items-center bg-[#f3f4f6] p-0.5 rounded-md shrink-0">
          <button
            type="button"
            data-testid="reference-view-grid"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            title="그리드 보기"
            className={`p-1 rounded cursor-default ${view === "grid" ? "bg-white text-black/85 shadow-2xs" : "text-black/45 hover:text-black/75"}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-testid="reference-view-list"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            title="리스트 보기"
            className={`p-1 rounded cursor-default ${view === "list" ? "bg-white text-black/85 shadow-2xs" : "text-black/45 hover:text-black/75"}`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {visible.length === 0 ? (
          <div className="py-8 text-center text-[11.5px] text-black/40">이 종류의 레퍼런스가 없어요.</div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-2">
            {visible.map((entry) => (
              <ReferenceTile
                key={entry.refId}
                entry={entry}
                number={numberOf(entry.refId)}
                pinCount={(pins[entry.refId] ?? EMPTY_PINS).length}
                selected={viewerOpen && currentRefId === entry.refId}
                menuOpen={menu?.refId === entry.refId}
                onOpen={() => onOpen(entry.refId)}
                onMenu={(e) => openMenu(e, entry.refId)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-px">
            {visible.map((entry) => {
              const { refId, item } = entry;
              const refPins = pins[refId] ?? EMPTY_PINS;
              const isOpen = expanded[refId] ?? false;
              const selected = viewerOpen && currentRefId === refId;
              const meta = KIND_META[item.kind];
              return (
                <div key={refId} data-testid={`reference-row-${numberOf(refId)}`}>
                  <div
                    onClick={() => onOpen(refId)}
                    title="누르면 아래 뷰어에서 열어요"
                    className={`group fig-row !mx-0 gap-1.5 ${selected ? "!bg-[var(--fig-selected)]" : ""} ${entry.enabled ? "" : "opacity-50"}`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded((p) => ({ ...p, [refId]: !isOpen }));
                      }}
                      className={`fig-row-chevron ${refPins.length ? "" : "invisible"}`}
                    >
                      {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    <input
                      type="checkbox"
                      data-testid={`reference-enable-${numberOf(refId)}`}
                      checked={entry.enabled}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => void store().setEnabled(refId, !entry.enabled)}
                      title={entry.enabled ? "AI 가 참고하는 중 (끄기)" : "AI 가 참고하지 않음 (켜기)"}
                      className="w-3 h-3 shrink-0 accent-[var(--vds-accent)]"
                    />
                    <span className={`shrink-0 ${meta.tone}`}>{meta.icon}</span>
                    <span className="shrink-0 text-[10.5px] font-mono text-black/40">참조{numberOf(refId)}</span>
                    <span className="fig-row-label">{item.title}</span>
                    {item.status === "failed" && <AlertTriangle className="w-3 h-3 text-[#f24822] shrink-0" aria-label="가져오기 실패" />}
                    {refPins.length > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-0.5 text-[10.5px] text-black/45">
                        <MapPin className="w-3 h-3" />
                        {refPins.length}
                      </span>
                    )}
                    <span className="shrink-0 text-[10px] text-black/35">{meta.label}</span>
                    <button
                      type="button"
                      data-testid={`reference-menu-btn-${numberOf(refId)}`}
                      onClick={(e) => openMenu(e, refId)}
                      title="더보기 — 이 레퍼런스의 층위만 적용 · AI와 이야기하기"
                      className={`fig-icon-btn shrink-0 ${menu?.refId === refId ? "" : "opacity-0 group-hover:opacity-100"}`}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {isOpen &&
                    refPins.map((pin) => {
                      const checked = checkedPinIds.includes(pin.pinId);
                      const focused = focusedPin?.pinId === pin.pinId;
                      return (
                        <div
                          key={pin.pinId}
                          data-testid={`reference-pin-${pin.pinId}`}
                          onClick={() => {
                            onOpen(refId);
                            store().setFocusedPin(pin);
                            if (pin.kind === "region" && pin.bbox && pin.page) {
                              useReferenceRegionStore.getState().setFocus({ refId, page: pin.page, box: pin.bbox });
                            }
                          }}
                          style={{ paddingLeft: 30 }}
                          className={`group fig-row !mx-0 gap-1.5 ${focused ? "!bg-[var(--fig-selected)]" : checked ? "!bg-[var(--fig-selected-child)]" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => store().toggleChecked(pin.pinId)}
                            className="w-3 h-3 shrink-0 accent-[var(--vds-accent)]"
                            title="체크한 핀만 AI 에 보낸다 (아무것도 체크하지 않으면 전부)"
                          />
                          {pin.kind === "text" ? <Type className="w-3 h-3 text-black/50 shrink-0" /> : <MapPin className="w-3 h-3 text-black/50 shrink-0" />}
                          <span className="fig-row-label">{pin.label}</span>
                          <select
                            value={pin.layer}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => void store().updatePin(refId, pin.pinId, { layer: e.target.value })}
                            className="text-[10px] font-mono bg-transparent border border-[var(--fig-border)] rounded px-0.5 cursor-default"
                            title="이 핀이 보여 주는 결정의 층위"
                          >
                            <option value="">층위</option>
                            {LAYER_IDS.map((id) => (
                              <option key={id} value={id}>
                                {id}
                              </option>
                            ))}
                          </select>
                          <span className="text-[10px] font-mono text-black/35 shrink-0">{pin.page ?? 1}p</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void store().removePin(refId, pin.pinId);
                            }}
                            className="fig-icon-btn opacity-0 group-hover:opacity-100 shrink-0"
                            title="핀 삭제"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {menu && menuEntry && (
        <ReferenceItemMenu
          entry={menuEntry}
          number={numberOf(menuEntry.refId)}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          onOpenViewer={() => onOpen(menuEntry.refId)}
        />
      )}
    </div>
  );
};

/** 그리드 카드: 첫 쪽(PDF) · 원본(이미지) · 첫 캡처(웹) 미리보기 + 종류 · 쪽 수 · 핀 수. */
const ReferenceTile: React.FC<{
  entry: BoundReference;
  number: number;
  pinCount: number;
  selected: boolean;
  menuOpen: boolean;
  onOpen: () => void;
  onMenu: (e: React.MouseEvent<HTMLElement>) => void;
}> = ({ entry, number, pinCount, selected, menuOpen, onOpen, onMenu }) => {
  const { item } = entry;
  const { ref, src, loading } = useReferenceThumb(item);
  const meta = KIND_META[item.kind];
  const store = useReferenceStore.getState;
  return (
    <div
      data-testid={`reference-tile-${number}`}
      onClick={onOpen}
      title={`${item.title} — 누르면 뷰어에서 열어요`}
      className={`group flex flex-col min-w-0 cursor-default ${entry.enabled ? "" : "opacity-50"}`}
    >
      <div
        ref={ref}
        className={`relative aspect-[4/3] rounded-lg overflow-hidden border bg-[#f5f5f5] ${
          selected ? "border-[var(--vds-accent)] ring-2 ring-[var(--vds-accent)]/25" : "border-[var(--fig-border)] group-hover:border-black/20"
        }`}
      >
        {src ? (
          <img src={src} alt="" className="w-full h-full object-cover object-top" draggable={false} />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${meta.tone}`}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-black/30" /> : <span className="scale-150 opacity-60">{meta.icon}</span>}
          </div>
        )}
        <input
          type="checkbox"
          checked={entry.enabled}
          onClick={(e) => e.stopPropagation()}
          onChange={() => void store().setEnabled(entry.refId, !entry.enabled)}
          title={entry.enabled ? "AI 가 참고하는 중 (끄기)" : "AI 가 참고하지 않음 (켜기)"}
          className="absolute top-1.5 left-1.5 w-3.5 h-3.5 accent-[var(--vds-accent)]"
        />
        <button
          type="button"
          data-testid={`reference-menu-btn-${number}`}
          onClick={onMenu}
          title="더보기 — 이 레퍼런스의 층위만 적용 · AI와 이야기하기"
          className={`absolute top-1 right-1 w-6 h-6 rounded-md bg-white/95 border border-black/10 shadow-xs flex items-center justify-center text-black/70 hover:text-black ${
            menuOpen ? "" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
        {item.status === "failed" && (
          <span className="absolute bottom-1 left-1 px-1.5 h-4 rounded bg-white/95 text-[10px] text-[#f24822] inline-flex items-center gap-0.5">
            <AlertTriangle className="w-2.5 h-2.5" />
            실패
          </span>
        )}
      </div>
      <div className="mt-1 px-0.5 min-w-0">
        <div className="text-[11.5px] font-medium text-black/85 truncate">
          <span className="font-mono text-[10px] text-black/40 mr-1">참조{number}</span>
          {item.title}
        </div>
        <div className="text-[10.5px] text-black/40 truncate inline-flex items-center gap-1">
          <span className={meta.tone}>{meta.label}</span>
          {item.pageCount ? <span>· {item.pageCount}쪽</span> : null}
          {pinCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              · <MapPin className="w-2.5 h-2.5" />
              {pinCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
