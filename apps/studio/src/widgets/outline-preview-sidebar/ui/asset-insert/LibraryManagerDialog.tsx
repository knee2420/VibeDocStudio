import React, { useEffect, useMemo, useState } from "react";
import { Check, Globe, Plus, Search, X } from "lucide-react";

import type { VDocDocument } from "@vibe/vdoc-schema";

import { useAssetLibraryStore } from "@/entities/asset-library";

import { AssetPreview } from "./AssetPreview";
import { pageAssetSource } from "./templateSources";

type Tab = "file" | "templates" | "community";

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "file", label: "이 파일" },
  { id: "templates", label: "템플릿" },
  { id: "community", label: "커뮤니티" },
];

/**
 * 라이브러리 관리 (피그마 에셋 패널의 책 아이콘 → 라이브러리 창).
 * 에셋 패널에 보일 템플릿 라이브러리를 켜고 끈다. 커뮤니티 탭은 나중에
 * 다른 사람의 템플릿 · 에셋 라이브러리를 둘러보고 받는 자리로 미리 잡아 둔다.
 */
export const LibraryManagerDialog: React.FC<{
  docs: readonly VDocDocument[];
  activeDocId: string;
  localAssetCount: number;
  onClose: () => void;
  onOpenTemplate: (docId: string) => void;
}> = ({ docs, activeDocId, localAssetCount, onClose, onOpenTemplate }) => {
  const [tab, setTab] = useState<Tab>("templates");
  const [query, setQuery] = useState("");
  const hidden = useAssetLibraryStore((s) => s.hiddenTemplateIds);
  const setTemplateEnabled = useAssetLibraryStore((s) => s.setTemplateEnabled);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => docs.filter((d) => !q || d.title.toLowerCase().includes(q)), [docs, q]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20" onMouseDown={onClose}>
      <div
        data-testid="library-manager-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        className="fig-panel w-[560px] max-w-[calc(100vw-32px)] h-[520px] max-h-[calc(100vh-64px)] flex flex-col bg-white rounded-[13px] overflow-hidden shadow-[0_5px_17px_rgba(0,0,0,0.2),0_2px_7px_rgba(0,0,0,0.15),0_0_0_0.5px_rgba(0,0,0,0.12)]"
      >
        <div className="h-12 pl-4 pr-2 flex items-center justify-between border-b border-[var(--fig-border)] shrink-0">
          <span className="text-[13px] font-semibold">라이브러리</span>
          <button type="button" onClick={onClose} className="fig-icon-btn" title="닫기">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav className="w-[148px] shrink-0 border-r border-[var(--fig-border)] p-2 space-y-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`w-full h-7 px-2 rounded-[5px] text-left text-[12px] flex items-center justify-between cursor-default ${
                  tab === t.id ? "bg-[var(--fig-hover,#f5f5f5)] font-semibold" : "text-black/70 hover:bg-black/[0.04]"
                }`}
              >
                {t.label}
                {t.id === "community" && <span className="text-[10px] text-black/35">준비 중</span>}
              </button>
            ))}
          </nav>

          <div className="flex-1 min-w-0 flex flex-col">
            {tab === "file" && (
              <div className="p-4 space-y-2">
                <p className="text-black/50">이 문서에서 만든 에셋입니다. 다른 문서에서 쓰려면 이 문서를 템플릿으로 추가하세요.</p>
                <div className="flex items-center gap-3 p-2 rounded-lg border border-[var(--fig-border)]">
                  <div className="w-16 h-11 rounded bg-[#f5f5f5]" />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium">이 파일에서 생성됨</div>
                    <div className="text-black/45">{localAssetCount}개의 에셋</div>
                  </div>
                </div>
              </div>
            )}

            {tab === "templates" && (
              <>
                <div className="p-3 border-b border-[var(--fig-border)]">
                  <label className="fig-input !h-7">
                    <Search className="w-3.5 h-3.5 text-black/40" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="템플릿 검색" />
                  </label>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {filtered.map((doc) => {
                    const enabled = !hidden.includes(doc.docId);
                    const first = doc.pages[0];
                    return (
                      <div key={doc.docId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-black/[0.03]">
                        <button
                          type="button"
                          onClick={() => onOpenTemplate(doc.docId)}
                          className="w-16 h-[46px] shrink-0 rounded border border-[var(--fig-border)] bg-white overflow-hidden cursor-default"
                          title="열어 보기"
                        >
                          {first && <AssetPreview source={pageAssetSource(doc, first)} height={46} fit="width" contentWidth={714} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium truncate">{doc.title}</div>
                          <div className="text-black/45">
                            {doc.pages.length}개의 페이지
                            {doc.docId === activeDocId && " · 지금 열린 문서"}
                          </div>
                        </div>
                        <button
                          type="button"
                          data-testid={`library-toggle-${doc.docId}`}
                          onClick={() => setTemplateEnabled(doc.docId, !enabled)}
                          className={`h-7 px-2.5 rounded-[6px] text-[11.5px] font-medium inline-flex items-center gap-1 cursor-default shrink-0 ${
                            enabled ? "border border-[#e6e6e6] text-black/70 hover:bg-[#f5f5f5]" : "bg-[var(--vds-accent)] text-white hover:bg-[var(--vds-accent-hover)]"
                          }`}
                        >
                          {enabled ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                          {enabled ? "추가됨" : "추가"}
                        </button>
                      </div>
                    );
                  })}
                  {filtered.length === 0 && <div className="py-10 text-center text-black/40">일치하는 템플릿이 없습니다.</div>}
                </div>
              </>
            )}

            {tab === "community" && (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
                <Globe className="w-7 h-7 text-black/25" />
                <div className="text-[13px] font-semibold">커뮤니티 라이브러리</div>
                <p className="max-w-[300px] text-black/50 leading-4">
                  다른 사람이 올린 템플릿 · 에셋 라이브러리를 둘러보고 받거나, 내 라이브러리를 올리는 곳이 될 예정입니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
