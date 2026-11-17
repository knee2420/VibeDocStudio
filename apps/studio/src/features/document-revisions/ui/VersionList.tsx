import React, { useState } from "react";
import { Bookmark, ChevronDown, ChevronRight, Pencil, RotateCcw, Trash2 } from "lucide-react";

import type { DocumentVersion } from "@/entities/vdoc-document";
import { useActiveDiffStore } from "@/features/document-diff";
import { errorMessage } from "@/shared/lib";

import { dayLabel, timeLabel } from "../model/history";
import { openVersionCompare, removeVersion, renameVersion, restoreVersion, useDocumentVersions, useVersionsStore } from "../model/versions";

const REASON_LABEL: Record<string, string> = {
  "편집 시작 전": "다시 고치기 시작하기 직전 상태",
  "되돌리기 전": "버전으로 되돌리기 직전 상태",
};

/** 버전 한 줄: 이름(또는 자동 보관) · 시각 · 쪽 수 · 글자 수 · 메모 — 누르면 지금과 비교, 올리면 되돌리기 · 이름 · 지우기. */
const VersionRow: React.FC<{ docId: string; v: DocumentVersion; active: boolean }> = ({ docId, v, active }) => {
  const [mode, setMode] = useState<"idle" | "rename" | "confirm">("idle");
  const [name, setName] = useState(v.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const named = v.kind === "named";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMode("idle");
    } catch (err) {
      setError(errorMessage(err, "처리하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "rename") {
    return (
      <form
        className="pl-7 pr-1 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => renameVersion(docId, v.id, { name: name.trim() || v.name }));
        }}
      >
        <label className="fig-input !h-7">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setMode("idle")} aria-label="버전 이름" />
        </label>
      </form>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={named ? "version-named" : "version-auto"}
      onClick={() => void run(() => openVersionCompare(docId, v))}
      onKeyDown={(e) => e.key === "Enter" && void run(() => openVersionCompare(docId, v))}
      className={`group relative pl-7 pr-1.5 py-1.5 rounded-[6px] cursor-pointer ${active ? "bg-[var(--fig-selected)]" : "bg-white hover:bg-[var(--fig-hover)]"}`}
      title="이 버전과 지금 비교"
    >
      {named ? (
        <Bookmark aria-hidden className="absolute left-[8px] top-[8px] w-[15px] h-[15px] text-[var(--fig-brand)] fill-[var(--fig-brand)] [background:inherit]" />
      ) : (
        <span aria-hidden className="absolute left-[12px] top-[12px] w-[7px] h-[7px] rounded-full bg-black/25" />
      )}
      <div className="flex items-center gap-1.5 min-w-0 [background:inherit]">
        <span className={`truncate text-[12.5px] ${named ? "font-semibold text-black/90" : "text-black/75 tabular-nums"}`}>
          {named ? v.name : whenLabel(v.at)}
        </span>
        <span
          className="absolute right-1 top-1 hidden group-hover:flex items-center rounded-[5px] pl-1 [background:inherit]"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="fig-icon-btn !w-6 !h-6" title="문서 전체를 이 버전으로 되돌리기" onClick={() => setMode("confirm")} data-testid="version-restore-btn">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button type="button" className="fig-icon-btn !w-6 !h-6" title={named ? "이름 바꾸기" : "이름 붙여 버전으로 남기기"} onClick={() => setMode("rename")}>
            <Pencil className="w-3 h-3" />
          </button>
          <button type="button" className="fig-icon-btn !w-6 !h-6" title="이 버전 지우기" onClick={() => void run(() => removeVersion(docId, v.id))}>
            <Trash2 className="w-3 h-3" />
          </button>
        </span>
      </div>
      <div className="text-[11.5px] text-black/45 truncate">
        {named ? `${whenLabel(v.at)} · ` : `${REASON_LABEL[v.reason] ?? v.reason} · `}
        {v.pageCount}쪽{v.blockCount !== undefined ? ` · 블록 ${v.blockCount}개` : ""}
      </div>
      {v.note && <p className="text-[11.5px] text-black/60 line-clamp-2 whitespace-pre-wrap">{v.note}</p>}
      {mode === "confirm" && (
        <div className="mt-1.5 p-2 rounded-[6px] bg-[#fff8e6] border border-[#f0d58c] text-[11.5px] text-black/75 cursor-default" onClick={(e) => e.stopPropagation()}>
          문서 전체를 이 상태로 되돌릴까요? 지금 상태는 자동 보관되고, 실행 취소(Ctrl+Z)도 됩니다.
          <div className="mt-1.5 flex justify-end gap-1">
            <button type="button" className="fig-btn" onClick={() => setMode("idle")}>
              취소
            </button>
            <button
              type="button"
              disabled={busy}
              className="fig-btn fig-btn-primary"
              data-testid="version-restore-confirm"
              onClick={() =>
                void run(async () => {
                  await restoreVersion(docId, v);
                  useActiveDiffStore.getState().closeDiff();
                })
              }
            >
              {busy ? "되돌리는 중…" : "되돌리기"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
};

/** 피그마 버전 내역처럼: 오늘이면 "오후 2:20", 아니면 "11월 13일, 오후 4:53". */
function whenLabel(at: string): string {
  const day = dayLabel(at);
  return day === "오늘" ? timeLabel(at) : `${day === "어제" ? "어제" : new Date(Date.parse(at)).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}, ${timeLabel(at)}`;
}

type Entry = { type: "named"; v: DocumentVersion } | { type: "autos"; items: DocumentVersion[] };

/** 이름 붙인 버전 사이의 자동 보관들을 "자동 저장 버전 N개" 하나로 묶는다 (최신이 위). */
function groupVersions(versions: DocumentVersion[]): Entry[] {
  const out: Entry[] = [];
  for (const v of versions) {
    const last = out[out.length - 1];
    if (v.kind === "named") out.push({ type: "named", v });
    else if (last?.type === "autos") last.items.push(v);
    else out.push({ type: "autos", items: [v] });
  }
  return out;
}

const AutoGroup: React.FC<{ docId: string; items: DocumentVersion[]; activeId?: string }> = ({ docId, items, activeId }) => {
  const [open, setOpen] = useState(items.some((v) => v.id === activeId));
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative w-full h-8 pl-7 pr-1.5 flex items-center gap-1 rounded-[6px] bg-white hover:bg-[var(--fig-hover)] text-left"
        data-testid="version-auto-group"
      >
        <span className="absolute left-[8px] top-[8px] w-[15px] h-[15px] flex items-center justify-center text-black/45 [background:inherit]">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        <span className="text-[12.5px] font-medium text-black/80">자동 저장 버전 {items.length}개</span>
      </button>
      {open && (
        <div className="space-y-0.5">
          {items.map((v) => (
            <VersionRow key={v.id} docId={docId} v={v} active={activeId === v.id} />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 버전 내역 (피그마와 같은 짜임) — 맨 위 "현재 버전", 이름 붙인 버전, 그 사이 자동 보관은 "자동 저장 버전 N개"로 접어 둔다.
 * 버전마다 그때 문서 전체가 보관돼 있다: 누르면 지금과 비교(곳 · 쪽마다 되돌리기), 올리면 문서 전체를 그 버전으로 되돌리기.
 */
export const VersionList: React.FC<{ docId: string }> = ({ docId }) => {
  const versions = useDocumentVersions(docId);
  const error = useVersionsStore((s) => s.error);
  const activeVersionId = useActiveDiffStore((s) => s.activeDiff?.version?.id);
  const entries = groupVersions(versions);

  return (
    <section data-testid="version-list">
      <div className="h-8 flex items-center gap-1.5">
        <span className="text-[12px] font-semibold">버전 내역</span>
        <span className="text-[11px] text-black/40">{versions.length}</span>
      </div>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
      <div className="relative space-y-0.5">
        {/* 세로 선 */}
        <span aria-hidden className="absolute left-[15px] top-4 bottom-4 w-px bg-black/10" />
        <div className="relative h-8 pl-7 flex items-center rounded-[6px]" data-testid="version-current">
          <span aria-hidden className="absolute left-[9px] top-[9px] w-[13px] h-[13px] rounded-full border-2 border-black/50 bg-white" />
          <span className="text-[12.5px] font-medium text-black/85">현재 버전</span>
          <span className="ml-1.5 text-[11.5px] text-black/40">편집 중</span>
        </div>
        {entries.map((e) =>
          e.type === "named" ? (
            <VersionRow key={e.v.id} docId={docId} v={e.v} active={activeVersionId === e.v.id} />
          ) : (
            <AutoGroup key={e.items[0].id} docId={docId} items={e.items} activeId={activeVersionId} />
          ),
        )}
      </div>
      {versions.length === 0 && (
        <p className="pt-1 pl-7 text-[11.5px] text-black/45 leading-4">
          아직 보관된 버전이 없습니다. '버전 저장'을 누르거나, 한동안 쉬었다 다시 고치면 그 직전 상태가 자동으로 보관됩니다.
        </p>
      )}
    </section>
  );
};
