import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  Copy,
  FileText,
  FlaskConical,
  MoreHorizontal,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";

import type { VDocDocument } from "@vibe/vdoc-schema";

import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { playgroundActions, usePlaygroundDocIds, usePlaygroundDocs, usePlaygroundSettings } from "@/features/playground";
import { errorMessage } from "@/shared/lib";

import { OutlineExplorer } from "./OutlineExplorer";

const relativeTime = (iso: string | undefined) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  const min = Math.round(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
};

/**
 * 플레이그라운드 — 프로젝트를 건드리지 않고 끄적이는 개인 안전지대 (노션 "개인 페이지" 같은 자리).
 * 빈 초안 · 메모를 바로 만들거나, 프로젝트 문서(또는 지금 쪽)를 복사해 와서 고쳐 본다.
 * 합치기 · 프로젝트에 넣기는 다음 단계에서 이 목록의 ⋯ 메뉴에 붙는다.
 */
export const PlaygroundSidebarPanel: React.FC = () => {
  const drafts = usePlaygroundDocs();
  const playgroundIds = usePlaygroundDocIds();
  const activeDoc = useStudioDocumentStore(selectActiveDocument);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);
  const exclude = usePlaygroundSettings((s) => s.excludeFromBackdata);
  const setExclude = usePlaygroundSettings((s) => s.setExcludeFromBackdata);

  const [menuOpen, setMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ docId: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !rowMenu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
      setRowMenu(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen, rowMenu]);

  /** 플레이그라운드 초안을 열어 두었으면 그 초안의 쪽 · 엘리먼트를 아래에 보여 준다. */
  const openDraft = activeDoc && playgroundIds.has(activeDoc.docId) ? activeDoc : null;

  /** 지금 보고 있는 프로젝트 문서 (플레이그라운드 문서면 복사해 올 원본이 아니다). */
  const sourceDoc = activeDoc && !playgroundIds.has(activeDoc.docId) ? activeDoc : null;
  const sourcePage = sourceDoc?.pages.find((p) => p.pageId === activePageId) ?? sourceDoc?.pages[0];

  const run = async (task: () => Promise<unknown>) => {
    setMenuOpen(false);
    setRowMenu(null);
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err, "플레이그라운드 작업을 하지 못했어요."));
    } finally {
      setBusy(false);
    }
  };

  const startItems = (
    <>
      <button type="button" className="fig-menu-item" onClick={() => run(() => playgroundActions.createDraft("draft"))}>
        <FileText className="w-3 h-3" />새 초안
      </button>
      <button type="button" className="fig-menu-item" onClick={() => run(() => playgroundActions.createDraft("memo"))}>
        <StickyNote className="w-3 h-3" />새 메모
      </button>
      {sourceDoc && (
        <button type="button" className="fig-menu-item" onClick={() => run(() => playgroundActions.copyDocument(sourceDoc.docId))}>
          <Copy className="w-3 h-3" />
          <span className="truncate">지금 문서 복사해 오기</span>
        </button>
      )}
      {sourceDoc && sourcePage && sourceDoc.pages.length > 1 && (
        <button
          type="button"
          className="fig-menu-item"
          onClick={() => run(() => playgroundActions.copyPage(sourceDoc.docId, sourcePage.pageId))}
        >
          <Copy className="w-3 h-3" />
          <span className="truncate">지금 쪽만 복사해 오기</span>
        </button>
      )}
    </>
  );

  const renderRow = (doc: VDocDocument) => {
    const active = activeDoc?.docId === doc.docId;
    const from = doc.origin?.copiedFrom;
    const isMemo = doc.surface?.kind === "scroll" && !from;
    const kind = from ? `원본: ${from.title}${from.pageIds?.length ? "에서 일부" : ""}` : isMemo ? "메모" : "초안";
    const Icon = from ? Copy : isMemo ? StickyNote : FileText;

    if (renaming?.docId === doc.docId) {
      return (
        <form
          key={doc.docId}
          className="px-1.5 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            const { docId, title } = renaming;
            setRenaming(null);
            void run(() => playgroundActions.rename(docId, title));
          }}
        >
          <input
            autoFocus
            value={renaming.title}
            onChange={(e) => setRenaming({ docId: doc.docId, title: e.target.value })}
            onBlur={() => setRenaming(null)}
            onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
            className="w-full px-2 py-1 text-[12px] border border-[#0d99ff] rounded outline-none"
          />
        </form>
      );
    }

    return (
      <div
        key={doc.docId}
        data-testid={`playground-row-${doc.docId}`}
        className={`group relative flex items-start gap-2 px-2 py-1.5 rounded-md cursor-pointer ${
          active ? "bg-indigo-50 ring-1 ring-indigo-300" : "hover:bg-slate-100/90"
        }`}
        onClick={() => playgroundActions.open(doc.docId)}
        onDoubleClick={() => setRenaming({ docId: doc.docId, title: doc.title })}
      >
        <Icon className="w-3.5 h-3.5 mt-0.5 text-slate-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-slate-800 truncate">{doc.title}</div>
          <div className="text-[10.5px] text-slate-400 truncate">
            {kind} · {doc.pages.length}쪽 · {relativeTime(doc.updatedAt)}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setRowMenu((v) => (v === doc.docId ? null : doc.docId));
          }}
          title="더보기"
          className={`fig-icon-btn shrink-0 ${rowMenu === doc.docId ? "" : "opacity-0 group-hover:opacity-100"}`}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
        {rowMenu === doc.docId && (
          <div ref={menuRef} className="fig-menu absolute right-1 top-8 z-40 w-44" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="fig-menu-item"
              onClick={() => {
                setRowMenu(null);
                setRenaming({ docId: doc.docId, title: doc.title });
              }}
            >
              <Pencil className="w-3 h-3" />
              이름 바꾸기
            </button>
            <button
              type="button"
              className="fig-menu-item text-red-600"
              onClick={() => {
                if (window.confirm(`'${doc.title}'을(를) 플레이그라운드에서 지울까요? 원본 문서는 그대로예요.`)) {
                  void run(() => playgroundActions.remove(doc.docId));
                } else setRowMenu(null);
              }}
            >
              <Trash2 className="w-3 h-3" />
              지우기
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div data-testid="playground-panel" className="flex-1 flex flex-col min-h-0 bg-white text-slate-800 select-none">
      <div className="h-10 px-3 border-b border-slate-200/90 flex items-center justify-between shrink-0">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
          <FlaskConical className="w-3.5 h-3.5 text-indigo-600" />
          플레이그라운드
        </span>
        <div className="flex items-center gap-0.5">
          <div className="relative" ref={menuOpen ? menuRef : undefined}>
            <button
              type="button"
              data-testid="playground-new-btn"
              aria-expanded={menuOpen}
              disabled={busy}
              onClick={() => setMenuOpen((v) => !v)}
              title="새로 만들기"
              className="fig-icon-btn"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {menuOpen && <div className="fig-menu absolute right-0 top-7 z-40 w-48">{startItems}</div>}
          </div>
          <button type="button" onClick={() => setLeftSidebarOpen(false)} title="패널 접기" className="fig-icon-btn">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        className={
          openDraft
            ? "shrink-0 max-h-[38%] overflow-y-auto p-2.5 space-y-3 border-b border-slate-200/90"
            : "flex-1 overflow-y-auto p-2.5 space-y-3"
        }
      >
        {!openDraft && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200/80 px-3 py-2.5 text-[11.5px] leading-[17px] text-indigo-900">
            <div className="font-semibold mb-0.5">프로젝트에 바로 하기 망설여질 때</div>
            여기서 한 작업은 프로젝트에 영향을 주지 않아요. 마음껏 써 보고, 마음에 드는 것만 가져가세요.
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-2.5 py-1.5 text-[11.5px] text-red-700 flex justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 cursor-pointer">
              닫기
            </button>
          </div>
        )}

        {drafts.length === 0 ? (
          <div className="pt-2 space-y-2" data-testid="playground-empty">
            <div className="text-[12.5px] font-semibold text-slate-800">첫 실험을 시작해 보세요</div>
            <p className="text-[11.5px] text-slate-500 leading-[17px]">
              빈 초안이나 메모에 끄적여도 되고, 지금 보고 있는 문서를 복사해 와서 마음껏 고쳐 봐도 돼요.
            </p>
            <div className="grid gap-1.5">
              <StartButton icon={<FileText className="w-3.5 h-3.5" />} label="새 초안" sub="A4 문서로 시작" disabled={busy} onClick={() => run(() => playgroundActions.createDraft("draft"))} />
              <StartButton icon={<StickyNote className="w-3.5 h-3.5" />} label="새 메모" sub="자유롭게 적는 한 단" disabled={busy} onClick={() => run(() => playgroundActions.createDraft("memo"))} />
              {sourceDoc && (
                <StartButton
                  icon={<Copy className="w-3.5 h-3.5" />}
                  label="지금 문서 복사해 오기"
                  sub={sourceDoc.title}
                  disabled={busy}
                  onClick={() => run(() => playgroundActions.copyDocument(sourceDoc.docId))}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="px-1 mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-500">
              <span>내 실험</span>
              <span className="font-mono text-[10px] text-slate-400">{drafts.length}</span>
            </div>
            {drafts.map(renderRow)}
          </div>
        )}
        {busy && <div className="text-[11px] text-slate-400 px-1">만드는 중…</div>}
      </div>

      {openDraft && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden" data-testid="playground-draft-outline">
          <OutlineExplorer activeDocId={openDraft.docId} embedded />
        </div>
      )}

      <div className="shrink-0 border-t border-slate-200/90 px-3 py-2.5 space-y-1">
        <label className="flex items-start gap-2 text-[11.5px] text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            data-testid="playground-exclude-backdata"
            checked={exclude}
            onChange={(e) => setExclude(e.target.checked)}
            className="mt-[3px] accent-indigo-600"
          />
          <span>여기서 한 대화 · 작업을 백데이터로 쓰지 않기</span>
        </label>
        <p className="pl-5 text-[10.5px] leading-[15px] text-slate-400">
          {exclude
            ? "플레이그라운드 내용이 프로젝트 AI 맥락과 에셋 템플릿에 섞이지 않아요. 가져간 내용만 프로젝트 데이터가 돼요."
            : "플레이그라운드 문서도 프로젝트 AI가 @로 지정해 쓰고, 에셋 템플릿에도 보여요."}
        </p>
      </div>
    </div>
  );
};

const StartButton: React.FC<{ icon: React.ReactNode; label: string; sub: string; disabled?: boolean; onClick: () => void }> = ({
  icon,
  label,
  sub,
  disabled,
  onClick,
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-left cursor-pointer disabled:opacity-50"
  >
    <span className="w-7 h-7 rounded-md bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">{icon}</span>
    <span className="min-w-0">
      <span className="block text-[12px] font-medium text-slate-800">{label}</span>
      <span className="block text-[10.5px] text-slate-400 truncate">{sub}</span>
    </span>
  </button>
);

/**
 * 파일 트리(Layers) 탭에서 플레이그라운드 초안을 열어 둔 경우 — 파일 트리는 프로젝트 자리라
 * 초안의 트리 대신 어디서 보는지 알려 주고, 프로젝트 문서로 돌아가는 길을 둔다.
 */
export const PlaygroundOpenNotice: React.FC = () => {
  const activeDoc = useStudioDocumentStore(selectActiveDocument);
  const docs = useStudioDocumentStore((s) => s.docs);
  const projectTitle = useProjectStore((s) => selectActiveProject(s)?.title) || "프로젝트";
  const setActiveActivityTab = useWorkspaceLayoutStore((s) => s.setActiveActivityTab);
  const from = activeDoc?.origin?.copiedFrom;
  const back = () => {
    const loaded = new Set(docs.map((d) => d.docId));
    const target =
      (from && loaded.has(from.docId) ? from.docId : null) ??
      selectActiveProject(useProjectStore.getState())?.docIds.find((id) => loaded.has(id));
    if (!target) return;
    useStudioDocumentStore.getState().setActiveDocId(target);
    if (from?.docId === target && from.pageIds?.[0]) useStudioDocumentStore.getState().setActivePageId(from.pageIds[0]);
  };
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white" data-testid="explorer-playground-notice">
      <div className="h-10 pl-3 pr-2 border-b border-[var(--fig-border)] flex items-center shrink-0">
        <span className="min-w-0 truncate text-[12.5px] font-semibold text-slate-800">{projectTitle}</span>
      </div>
      <div className="p-4 space-y-3 text-[12px] text-slate-600 leading-[18px]">
        <div className="flex items-center gap-2 text-indigo-800 font-semibold">
          <FlaskConical className="w-4 h-4" />
          지금은 플레이그라운드 초안을 보고 있어요
        </div>
        <p>
          &lsquo;{activeDoc?.title}&rsquo;은(는) 프로젝트 밖의 실험 문서라 여기(프로젝트 트리)에는 없어요. 쪽과 엘리먼트는
          플레이그라운드 탭에서 볼 수 있어요.
        </p>
        <div className="grid gap-1.5">
          <button
            type="button"
            onClick={() => setActiveActivityTab("playground")}
            className="h-8 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            플레이그라운드에서 보기
          </button>
          <button
            type="button"
            onClick={back}
            className="h-8 rounded-md border border-slate-200 hover:bg-slate-50 text-[12px] text-slate-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {from ? "원본 문서로 돌아가기" : "프로젝트 문서로 돌아가기"}
          </button>
        </div>
      </div>
    </div>
  );
};
