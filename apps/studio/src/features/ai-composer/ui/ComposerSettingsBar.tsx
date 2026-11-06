import React from "react";
import { BookOpen, Check, ChevronDown, ChevronRight, ChevronUp, Crosshair, FileText, Pin, RefreshCw, Settings2, X } from "lucide-react";

import { getCheckedResourceItems, type ResourceItem } from "@vibe/vdoc-schema";

import { DEFAULT_SCOPE, pageTitle, resolveScope, useAiScopeStore, type ScopeMode } from "@/entities/ai-scope";
import { deckStageLabel, isDeckBusy, isDeckUsable, useKnowledgeDeckStore, type KnowledgeDeck } from "@/entities/knowledge-deck";
import { useResourceStore } from "@/entities/resource";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";

/**
 * Composer 설정바 — 입력창 위, 오래 걸어 두는 세팅. 줄마다 [행 스위치] [요약 버튼 ▴ → 펼침 메뉴].
 *
 *   📚 자료  RM 원본 · 지식 덱(섹션) 을 여러 개 골라 켜고 끈다 (RM 과 같은 상태)
 *   🎯 범위  선택만 · 이 페이지 · 문서 전체 + 페이지 고르기/빼기 + 📌 고정
 *
 * 메뉴 항목은 ✓ 로 켜고 끄며, 메뉴를 닫지 않고 여러 개를 연달아 고른다. 꺼진 항목도 회색으로 남아 바로 다시 켤 수 있다.
 * 한 단계 더 들어가는 항목(덱 섹션)은 메뉴 안 아코디언으로 펼친다.
 * 입력창(@멘션 · /스킬 · 이번 메시지의 선택)은 보내면 비워지는 일회용 칸이다.
 */
export const ComposerSettingsBar: React.FC = () => (
  <div data-testid="composer-settings-bar" className="mb-1.5 flex items-center gap-1.5 text-[11px]">
    <SourcesRow />
    <ScopeRow />
  </div>
);

// --- 공통 부품 ------------------------------------------------------------------------

/** 행 스위치 — 그 줄(자료 · 범위)을 통째로 켜고 끈다. 끄더라도 안의 설정은 그대로 남는다. */
const RowSwitch: React.FC<{ icon: React.ReactNode; label: string; on: boolean; onToggle: () => void; title: string; tone: "violet" | "amber"; testId: string }> = ({
  icon,
  label,
  on,
  onToggle,
  title,
  tone,
  testId,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    data-testid={testId}
    onClick={onToggle}
    title={[title, `지금: ${on ? "켜짐 — 누르면 끔" : "꺼짐 — 누르면 켬"}`].join("\n")}
    className={`flex items-center gap-1 w-[52px] shrink-0 px-1 py-0.5 rounded-md border font-bold cursor-pointer transition ${
      on
        ? tone === "violet"
          ? "bg-violet-50 text-violet-700 border-violet-300 hover:bg-violet-100"
          : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
        : "bg-slate-50 text-slate-400 border-slate-200 line-through hover:text-slate-600"
    }`}
  >
    {icon}
    {label}
  </button>
);

function usePopover() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return [open, setOpen, ref] as const;
}

/** 줄의 요약 버튼 (모델 선택 버튼처럼) — 누르면 위로 메뉴가 열린다. */
const SummaryButton: React.FC<{ open: boolean; onClick: () => void; testId: string; on: boolean; tone: "violet" | "amber"; children: React.ReactNode; title: string }> = ({
  open,
  onClick,
  testId,
  on,
  tone,
  children,
  title,
}) => (
  <button
    type="button"
    data-testid={testId}
    aria-expanded={open}
    onClick={onClick}
    title={title}
    className={`flex-1 min-w-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-semibold cursor-pointer transition ${
      on
        ? tone === "violet"
          ? "bg-violet-600 text-white border-violet-600 hover:bg-violet-700"
          : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
        : "bg-white text-slate-400 border-slate-200 hover:text-slate-600"
    }`}
  >
    {children}
    {open ? <ChevronDown className="w-3 h-3 ml-auto shrink-0 opacity-80" /> : <ChevronUp className="w-3 h-3 ml-auto shrink-0 opacity-80" />}
  </button>
);

/**
 * 일체형 세팅 버튼:
 * - 좌측: [아이콘 라벨] 클릭 시 ON/OFF 즉시 토글
 * - 우측: [요약 텍스트 ▾] 클릭 시 세부 팝오버 메뉴 열림
 */
const UnifiedSettingButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  summary: React.ReactNode;
  on: boolean;
  onToggle: () => void;
  open: boolean;
  onOpenMenu: () => void;
  tone: "violet" | "amber";
  switchTestId: string;
  buttonTestId: string;
  switchTitle: string;
  buttonTitle: string;
}> = ({
  icon,
  label,
  summary,
  on,
  onToggle,
  open,
  onOpenMenu,
  tone,
  switchTestId,
  buttonTestId,
  switchTitle,
  buttonTitle,
}) => (
  <div
    className={`flex-1 min-w-0 inline-flex items-center rounded-md border text-[11px] transition shadow-2xs ${
      on
        ? tone === "violet"
          ? "bg-violet-50/80 border-violet-200 text-violet-950 hover:bg-violet-50"
          : "bg-amber-50/80 border-amber-200 text-amber-950 hover:bg-amber-50"
        : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
    }`}
  >
    {/* 1. 좌측 스위치: 아이콘 + 라벨 (클릭 시 토글) */}
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-testid={switchTestId}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={switchTitle}
      className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-l-md font-bold cursor-pointer transition select-none shrink-0 ${
        on
          ? tone === "violet"
            ? "text-violet-700 hover:text-violet-900 hover:bg-violet-100/60"
            : "text-amber-700 hover:text-amber-900 hover:bg-amber-100/60"
          : "text-slate-400 line-through hover:text-slate-600"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>

    {/* 수직 구분선 */}
    <div
      className={`w-px h-3 shrink-0 ${
        on
          ? tone === "violet"
            ? "bg-violet-200"
            : "bg-amber-200"
          : "bg-slate-200"
      }`}
    />

    {/* 2. 우측 요약: 텍스트 + 쉐브론 (클릭 시 팝오버) */}
    <button
      type="button"
      data-testid={buttonTestId}
      aria-expanded={open}
      onClick={onOpenMenu}
      title={buttonTitle}
      className="flex-1 min-w-0 inline-flex items-center justify-between gap-1 px-1.5 py-1 rounded-r-md cursor-pointer transition select-none hover:bg-black/5"
    >
      <span className={`truncate text-left ${on ? "font-semibold" : "line-through opacity-70"}`}>
        {summary}
      </span>
      {open ? (
        <ChevronDown className="w-3 h-3 shrink-0 opacity-60 ml-0.5" />
      ) : (
        <ChevronUp className="w-3 h-3 shrink-0 opacity-60 ml-0.5" />
      )}
    </button>
  </div>
);

const Menu: React.FC<{ testId: string; align?: "left" | "right"; children: React.ReactNode }> = ({ testId, align = "left", children }) => (
  <div
    data-testid={testId}
    role="menu"
    className={`absolute bottom-full mb-1 ${align === "right" ? "right-0" : "left-0"} z-50 w-[300px] max-w-[calc(100vw-32px)] max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl py-1.5 text-[12px]`}
  >
    {children}
  </div>
);

const MenuHeader: React.FC<{ label: string; action?: React.ReactNode }> = ({ label, action }) => (
  <div className="flex items-center justify-between px-3 pt-1.5 pb-0.5 text-[10.5px] font-bold text-slate-400">
    <span>{label}</span>
    {action}
  </div>
);

const MenuDivider = () => <div className="my-1 border-t border-slate-100" />;

/** 메뉴 항목 — 제목 · 회색 보조 표시 · 오른쪽 ✓ (또는 펼침 ›). 누르면 켜고 끈다 (메뉴는 닫지 않는다). */
const MenuItem: React.FC<{
  title: string;
  detail?: React.ReactNode;
  checked?: boolean;
  /** 라디오(하나만) 항목 — 꺼져도 취소선 없이 */
  radio?: boolean;
  onClick: () => void;
  expand?: { open: boolean; onToggle: () => void };
  icon?: React.ReactNode;
  testId?: string;
  hint?: string;
  indent?: boolean;
}> = ({ title, detail, checked, radio, onClick, expand, icon, testId, hint, indent }) => (
  <div
    role={radio ? "menuitemradio" : "menuitemcheckbox"}
    aria-checked={checked}
    data-testid={testId}
    data-checked={checked ? "1" : "0"}
    onClick={onClick}
    title={hint ?? title}
    className={`group flex items-center gap-2 px-3 py-1 cursor-pointer hover:bg-slate-50 ${indent ? "pl-8" : ""}`}
  >
    {icon}
    <span className={`min-w-0 truncate ${checked ? "text-slate-900 font-medium" : radio ? "text-slate-600" : "text-slate-400"}`}>{title}</span>
    {detail && <span className="shrink-0 text-[10.5px] text-slate-400 font-medium">{detail}</span>}
    <span className="ml-auto flex items-center gap-1 shrink-0">
      {checked && <Check className="w-3.5 h-3.5 text-violet-600" />}
      {expand && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            expand.onToggle();
          }}
          className="p-0.5 rounded hover:bg-slate-200 text-slate-400"
          title={expand.open ? "접기" : "펼치기"}
        >
          {expand.open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      )}
    </span>
  </div>
);

// --- 📚 자료 -----------------------------------------------------------------------

const leafChecked = (items: ResourceItem[]) => getCheckedResourceItems(items).filter((it) => !it.children?.length);

function deckDetail(d: KnowledgeDeck): string {
  if (isDeckBusy(d)) return `${deckStageLabel(d.stage) || "색인 중"}`;
  if (!d.builtAt) return "재색인 필요";
  const parts: string[] = [];
  if (d.selectedSections?.length) parts.push(`${d.selectedSections.length}/${d.topics.length}섹션`);
  else parts.push(`${d.topics.length}섹션`);
  if (d.builtAt && Date.now() - Date.parse(d.builtAt) < 24 * 3600 * 1000) parts.push("New");
  return parts.join(" · ");
}

const SourcesRow: React.FC = () => {
  const projectId = useProjectStore((s) => selectActiveProject(s)?.projectId ?? "default_project");
  const items = useResourceStore((s) => s.items);
  const loadSession = useResourceStore((s) => s.loadSession);
  const toggleItemChoice = useResourceStore((s) => s.toggleItemChoice);
  const decks = useKnowledgeDeckStore((s) => s.decks);
  const toggleDeckChoice = useKnowledgeDeckStore((s) => s.toggleDeckChoice);
  const selectDeckSections = useKnowledgeDeckStore((s) => s.selectDeckSections);
  const sourcesOn = useAiScopeStore((s) => s.sourcesOn);
  const setSourcesOn = useAiScopeStore((s) => s.setSourcesOn);
  const [open, setOpen, menuRef] = usePopover();
  // 이 세션에서 끈 원본 — 메뉴에 회색으로 남겨 바로 다시 켤 수 있게 한다
  const [turnedOff, setTurnedOff] = React.useState<ResourceItem[]>([]);
  const [openDecks, setOpenDecks] = React.useState<Set<string>>(new Set());

  // RM 패널을 아직 안 열었어도 체크 상태를 보여 준다
  React.useEffect(() => {
    if (items.length === 0) void loadSession(projectId);
  }, [projectId, items.length, loadSession]);

  const checked = leafChecked(items);
  const listed = [...checked, ...turnedOff.filter((r) => !checked.some((c) => c.id === r.id))];
  const shownDecks = decks.filter((d) => !!d.builtAt || isDeckBusy(d));
  const usable = decks.filter(isDeckUsable);

  const toggleSource = (it: ResourceItem, on: boolean) => {
    if (!on) setTurnedOff((r) => (r.some((x) => x.id === it.id) ? r : [...r, it]));
    void toggleItemChoice(projectId, it.id, on);
  };
  const allSourcesOn = listed.length > 0 && listed.every((it) => checked.some((c) => c.id === it.id));

  const toggleSection = (d: KnowledgeDeck, sectionId: string, on: boolean) => {
    const all = d.topics.map((t) => t.id);
    const chosen = new Set(d.isChecked ? (d.selectedSections?.length ? d.selectedSections : all) : []);
    if (on) chosen.add(sectionId);
    else chosen.delete(sectionId);
    if (chosen.size === 0) {
      void toggleDeckChoice(projectId, d.id, false);
      void selectDeckSections(projectId, d.id, null);
      return;
    }
    if (!d.isChecked) void toggleDeckChoice(projectId, d.id, true);
    const ordered = all.filter((id) => chosen.has(id));
    void selectDeckSections(projectId, d.id, ordered.length === all.length ? null : ordered);
  };

  const totalCount = checked.length + usable.length;
  const sourcesSummary = React.useMemo(() => {
    if (!sourcesOn) return "꺼짐";
    if (totalCount === 0) return "없음";
    // 덱 1개 단독 선택: 덱 제목 + 부분 섹션 상태(예: 3/4)
    if (usable.length === 1 && checked.length === 0) {
      const d = usable[0];
      const partialSec = d.selectedSections?.length && d.selectedSections.length < d.topics.length
        ? ` (${d.selectedSections.length}/${d.topics.length})`
        : "";
      return `${d.title}${partialSec}`;
    }
    // 소스 1개 단독 선택: 소스 제목
    if (checked.length === 1 && usable.length === 0) {
      return checked[0].title;
    }
    // 복수 선택
    if (checked.length === 0) return `덱 ${usable.length}건`;
    if (usable.length === 0) return `소스 ${checked.length}건`;
    return `자료 ${totalCount}건`;
  }, [sourcesOn, totalCount, checked, usable]);

  const sourcesTooltip = React.useMemo(() => {
    if (!sourcesOn) return "자료 꺼짐 — AI가 자료를 참고하지 않습니다 (클릭하여 켜기)";
    if (totalCount === 0) return "선택된 자료 없음 — 눌러서 원본/지식 덱 선택";
    const parts: string[] = [];
    if (checked.length > 0) parts.push(`소스 ${checked.length}개 (${checked.map((c) => c.title).join(", ")})`);
    if (usable.length > 0) parts.push(`덱 ${usable.length}개 (${usable.map((d) => d.title).join(", ")})`);
    return `AI 참고 자료: ${parts.join(" · ")}\n눌러서 변경`;
  }, [sourcesOn, totalCount, checked, usable]);

  return (
    <div ref={menuRef} className="relative flex-1 min-w-0 flex">
      <UnifiedSettingButton
        icon={<BookOpen className="w-3 h-3" />}
        label="자료"
        summary={sourcesSummary}
        on={sourcesOn}
        onToggle={() => setSourcesOn(!sourcesOn)}
        open={open}
        onOpenMenu={() => {
          setTurnedOff([]);
          setOpen((v) => !v);
        }}
        tone="violet"
        switchTestId="settings-sources-switch"
        buttonTestId="settings-sources"
        switchTitle={sourcesOn ? "자료 켜짐 — 누르면 끕니다" : "자료 꺼짐 — 누르면 켭니다"}
        buttonTitle={sourcesTooltip}
      />
      {open && (
        <Menu testId="settings-sources-menu" align="left">
            <MenuHeader
              label="원본 (RM)"
              action={
                listed.length > 0 && (
                  <button
                    type="button"
                    className="text-violet-600 hover:underline font-semibold"
                    onClick={() => listed.forEach((it) => toggleSource(it, !allSourcesOn))}
                  >
                    {allSourcesOn ? "전체 끄기" : "전체 켜기"}
                  </button>
                )
              }
            />
            {listed.length === 0 && <div className="px-3 py-1 text-slate-400">RM 에서 원본을 체크하세요.</div>}
            {listed.map((it) => {
              const on = checked.some((c) => c.id === it.id);
              return (
                <MenuItem
                  key={it.id}
                  testId="settings-source-item"
                  title={it.title}
                  hint={it.pathOrUrl}
                  checked={on}
                  onClick={() => toggleSource(it, !on)}
                />
              );
            })}
            <MenuHeader label="지식 덱" />
            {shownDecks.length === 0 && <div className="px-3 py-1 text-slate-400">색인된 지식 덱이 없습니다.</div>}
            {shownDecks.map((d) => {
              const on = d.isChecked && !!d.builtAt;
              const expanded = openDecks.has(d.id);
              const chosen = new Set(d.isChecked ? (d.selectedSections?.length ? d.selectedSections : d.topics.map((t) => t.id)) : []);
              return (
                <React.Fragment key={d.id}>
                  <MenuItem
                    testId="settings-deck-item"
                    title={d.title}
                    detail={deckDetail(d)}
                    checked={on}
                    onClick={() => d.builtAt && void toggleDeckChoice(projectId, d.id, !d.isChecked)}
                    expand={
                      d.topics.length
                        ? {
                            open: expanded,
                            onToggle: () =>
                              setOpenDecks((prev) => {
                                const next = new Set(prev);
                                if (next.has(d.id)) next.delete(d.id);
                                else next.add(d.id);
                                return next;
                              }),
                          }
                        : undefined
                    }
                  />
                  {expanded &&
                    d.topics.map((t) => (
                      <MenuItem
                        key={t.id}
                        indent
                        testId="settings-deck-section"
                        title={t.title}
                        detail={`${t.children?.length ?? 0}카드`}
                        checked={chosen.has(t.id)}
                        onClick={() => toggleSection(d, t.id, !chosen.has(t.id))}
                      />
                    ))}
                </React.Fragment>
              );
            })}
            <MenuDivider />
            <MenuItem
              radio
              icon={<Settings2 className="w-3.5 h-3.5 text-slate-400" />}
              title="RM 에서 관리"
              onClick={() => {
                setOpen(false);
                useWorkspaceLayoutStore.getState().openRightPanel("resource-manager");
              }}
            />
          </Menu>
        )}
    </div>
  );
};

// --- 🎯 범위 -----------------------------------------------------------------------

const MODES: { id: ScopeMode; label: string; hint: string }[] = [
  { id: "selection", label: "선택만", hint: "캔버스에서 고른 칸 · 블록만 보고 고칩니다" },
  { id: "page", label: "이 페이지", hint: "한 페이지만 보고 고칩니다" },
  { id: "document", label: "문서 전체", hint: "문서 전체 (빼 둔 페이지 제외)" },
];

const ScopeRow: React.FC = () => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const docId = doc?.docId ?? "";
  // 저장된 값만 구독한다 (기본값을 합친 새 객체를 고르면 매 렌더마다 다시 그리게 된다)
  const stored = useAiScopeStore((s) => s.settings[docId]);
  const setting = React.useMemo(() => ({ ...DEFAULT_SCOPE, ...(stored ?? {}) }), [stored]);
  const live = useAiScopeStore((s) => s.live);
  const scopeOn = useAiScopeStore((s) => s.scopeOn);
  const setScopeOn = useAiScopeStore((s) => s.setScopeOn);
  const { setMode, setFixed, pinTarget, pinPage, togglePageExcluded, clearPin } = useAiScopeStore.getState();
  const [open, setOpen, menuRef] = usePopover();

  if (!doc) return null;
  const liveHere = live.docId === docId ? live : { target: null, pageId: null };
  const resolved = resolveScope(doc, setting, liveHere);
  const currentTarget = setting.fixed ? setting.target : liveHere.target ?? setting.target;
  const currentPage = (setting.fixed ? setting.pageId : liveHere.pageId) ?? setting.pageId ?? doc.pages[0]?.pageId ?? "";
  const excluded = setting.excludedPageIds.filter((p) => doc.pages.some((x) => x.pageId === p));

  // 고정 중에 캔버스 초점이 달라지면 점선 제안 (메뉴 밖 — 눌러야 바뀐다)
  let suggestion: { label: string; apply: () => void } | null = null;
  if (setting.fixed) {
    if (setting.mode === "selection" && liveHere.target && liveHere.target.id !== setting.target?.id) {
      const t = liveHere.target;
      suggestion = { label: `${pageTitle(doc, t.pageId)} ${t.label}`, apply: () => pinTarget(docId, t) };
    } else if (setting.mode === "page" && liveHere.pageId && liveHere.pageId !== setting.pageId) {
      const p = liveHere.pageId;
      suggestion = { label: pageTitle(doc, p), apply: () => pinPage(docId, p) };
    }
  }
  const waitingForSelection = setting.mode === "selection" && !currentTarget;
  const modeDetail: Record<ScopeMode, string> = {
    selection: currentTarget ? `${pageTitle(doc, currentTarget.pageId).split(" ")[0]} ${currentTarget.label}` : "칸을 고르세요",
    page: pageTitle(doc, currentPage).split(" ")[0],
    document: `${doc.pages.length - excluded.length}/${doc.pages.length}쪽`,
  };

  const scopeSummary = React.useMemo(() => {
    if (!scopeOn) return "꺼짐";
    if (waitingForSelection) return "선택 필요";
    if (setting.mode === "selection") {
      const pName = currentTarget ? pageTitle(doc, currentTarget.pageId).split(" ")[0] : "";
      return currentTarget ? `${pName} ${currentTarget.label}` : "선택만";
    }
    if (setting.mode === "page") {
      return pageTitle(doc, currentPage).split(" ")[0];
    }
    return `전체 (${doc.pages.length - excluded.length}쪽)`;
  }, [scopeOn, waitingForSelection, setting.mode, doc, currentTarget, currentPage, excluded.length]);

  return (
    <div ref={menuRef} className="relative flex-1 min-w-0 flex">
      <UnifiedSettingButton
        icon={<Crosshair className="w-3 h-3" />}
        label="범위"
        summary={
          <span className="inline-flex items-center gap-1 truncate" data-testid="scope-current">
            {setting.fixed && <Pin className="w-2.5 h-2.5 shrink-0 text-amber-600" />}
            <span className="truncate">{scopeSummary}</span>
          </span>
        }
        on={scopeOn}
        onToggle={() => setScopeOn(!scopeOn)}
        open={open}
        onOpenMenu={() => setOpen((v) => !v)}
        tone="amber"
        switchTestId="settings-scope-switch"
        buttonTestId="settings-scope"
        switchTitle={scopeOn ? "범위 켜짐 — 누르면 끕니다" : "범위 꺼짐 — 누르면 켭니다"}
        buttonTitle={`${resolved.label}${setting.fixed ? " — 고정됨" : " — 캔버스 초점을 따라갑니다"}\n눌러서 범위 · 페이지 · 고정 바꾸기`}
      />
      {open && (
        <Menu testId="settings-scope-menu" align="right">
            <MenuHeader label="범위" />
            {MODES.map((m) => (
              <MenuItem
                key={m.id}
                radio
                testId={`scope-mode-${m.id}`}
                title={m.label}
                detail={modeDetail[m.id]}
                hint={m.hint}
                checked={setting.mode === m.id}
                onClick={() => setMode(docId, m.id)}
              />
            ))}

            {setting.mode === "page" && (
              <>
                <MenuHeader label="페이지 — 고르면 그 페이지로 고정" />
                {doc.pages.map((p) => (
                  <MenuItem
                    key={p.pageId}
                    radio
                    testId="scope-page-item"
                    title={pageTitle(doc, p.pageId)}
                    checked={p.pageId === currentPage}
                    onClick={() => pinPage(docId, p.pageId)}
                  />
                ))}
              </>
            )}
            {setting.mode === "document" && (
              <>
                <MenuHeader label="페이지 — 끈 페이지는 AI 가 보지도 고치지도 않음" />
                {doc.pages.map((p) => (
                  <MenuItem
                    key={p.pageId}
                    testId="scope-page-item"
                    title={pageTitle(doc, p.pageId)}
                    checked={!excluded.includes(p.pageId)}
                    onClick={() => togglePageExcluded(docId, p.pageId)}
                  />
                ))}
              </>
            )}
            {setting.mode === "selection" && (
              <>
                <MenuHeader label="선택 — 캔버스에서 칸 · 블록을 고르거나 입력창 칩의 📌" />
                <div className="px-3 py-1 text-slate-600 truncate" data-testid="scope-selection-detail">
                  {currentTarget ? `${pageTitle(doc, currentTarget.pageId)} · ${currentTarget.label} (${currentTarget.slotIds.length}칸)` : "아직 고른 칸이 없습니다"}
                </div>
              </>
            )}

            {setting.mode !== "document" && (
              <>
                <MenuDivider />
                <MenuItem
                  testId="scope-fix"
                  icon={<Pin className="w-3.5 h-3.5 text-amber-500" />}
                  title="고정"
                  detail={setting.fixed ? "초점을 따라가지 않음" : "지금은 캔버스 초점을 따라감"}
                  checked={setting.fixed}
                  onClick={() => setFixed(docId, !setting.fixed)}
                />
                {(setting.fixed || setting.target) && (
                  <MenuItem
                    radio
                    testId="scope-clear"
                    icon={<X className="w-3.5 h-3.5 text-slate-400" />}
                    title="고정 해제 · 붙잡은 선택 지우기"
                    onClick={() => clearPin(docId)}
                  />
                )}
              </>
            )}
          </Menu>
        )}
        {suggestion && scopeOn && (
          <button
            type="button"
            data-testid="scope-suggestion"
            onClick={suggestion.apply}
            className="inline-flex items-center gap-1 max-w-[140px] shrink-0 px-1.5 py-0.5 rounded-md border border-dashed border-slate-300 bg-white text-slate-500 font-semibold hover:text-amber-700 hover:border-amber-300 cursor-pointer"
            title="캔버스 초점이 바뀌었습니다 — 누르면 범위를 이것으로 바꿉니다 (고정은 유지)"
          >
            <RefreshCw className="w-3 h-3 shrink-0" />
            <span className="truncate">초점: {suggestion.label}</span>
          </button>
        )}
      </div>
  );
};
