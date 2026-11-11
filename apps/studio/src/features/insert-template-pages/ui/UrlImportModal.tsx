import React, { useEffect, useState } from "react";
import { Globe, Loader2, X } from "lucide-react";

import type { UrlScaffoldParams, UrlSplitMode } from "../api/catalogApi";

export interface UrlImportModalProps {
  targetDocId: string | null;
  loading: boolean;
  error: string | null;
  onDismissError: () => void;
  onSubmit: (targetDocId: string, params: UrlScaffoldParams) => void;
  onClose: () => void;
}

const HEIGHT_PRESETS = [
  { label: "세로 웹표준 (1500px)", value: 1500 },
  { label: "A4 표준 (1123px)", value: 1123 },
  { label: "롱스크롤 (2000px)", value: 2000 },
  { label: "카드형 (900px)", value: 900 },
] as const;

export const UrlImportModal: React.FC<UrlImportModalProps> = ({
  targetDocId,
  loading,
  error,
  onDismissError,
  onSubmit,
  onClose,
}) => {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [splitMode, setSplitMode] = useState<UrlSplitMode>("height");
  const [targetHeightPx, setTargetHeightPx] = useState(1500);
  const [includeImages, setIncludeImages] = useState(true);
  const [useBrowserLayout, setUseBrowserLayout] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetDocId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [targetDocId, loading, onClose]);

  if (!targetDocId) return null;

  const displayError = localError || error;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const trimmed = url.trim();
    if (!/^https?:\/\/\S+/i.test(trimmed)) {
      setLocalError("http:// 또는 https:// 로 시작하는 웹 주소를 입력하세요.");
      return;
    }
    const clampedHeight = Math.max(480, Math.min(4000, Number(targetHeightPx) || 1500));
    setLocalError(null);
    onDismissError();
    onSubmit(targetDocId, {
      url: trimmed,
      title: title.trim(),
      splitMode,
      targetHeightPx: clampedHeight,
      includeImages,
      useBrowserFallback: useBrowserLayout,
    });
  };

  return (
    <div
      data-testid="url-import-modal"
      className="fixed inset-0 z-[120] bg-slate-900/45 backdrop-blur-[1px] flex items-center justify-center p-4 select-none"
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
      >
        <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
              <Globe className="w-3.5 h-3.5" />
              <span>URL에서 페이지 가져오기</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mt-0.5">
              웹사이트·블로그·칼럼을 페이지 단위로 잘라 가져옵니다
            </h3>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 space-y-4 text-xs">
          {displayError && (
            <div
              data-testid="url-import-error"
              className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-2"
            >
              <span className="break-all">{displayError}</span>
              <button
                type="button"
                onClick={() => {
                  setLocalError(null);
                  onDismissError();
                }}
                className="underline shrink-0 cursor-pointer"
              >
                닫기
              </button>
            </div>
          )}

          <label className="block space-y-1.5">
            <span className="font-semibold text-slate-700">웹 페이지 URL</span>
            <input
              type="url"
              autoFocus
              required
              disabled={loading}
              data-testid="url-import-input"
              placeholder="https://m.blog.naver.com/... 또는 https://toss.tech/article/..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (localError) setLocalError(null);
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="font-semibold text-slate-700">문서 이름 (선택)</span>
            <input
              type="text"
              disabled={loading}
              data-testid="url-import-title"
              placeholder="비워 두면 웹페이지 원문 제목을 사용합니다"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50"
            />
          </label>

          <div className="space-y-1.5">
            <span className="block font-semibold text-slate-700">페이지 자르기 기준</span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "height", title: "높이 기준", desc: "지정 px마다 자동 분할" },
                  { id: "heading", title: "소제목 기준", desc: "대/중제목마다 페이지 분리" },
                  { id: "single", title: "한 페이지", desc: "전체 블록을 1장에 모음" },
                ] as const
              ).map((opt) => {
                const active = splitMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={loading}
                    data-testid={`url-split-mode-${opt.id}`}
                    onClick={() => setSplitMode(opt.id)}
                    className={`text-left p-2.5 rounded-xl border transition cursor-pointer ${
                      active
                        ? "border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className={`font-bold text-[11px] ${active ? "text-emerald-900" : "text-slate-800"}`}>
                      {opt.title}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {splitMode === "height" && (
            <div className="space-y-1.5 rounded-xl bg-slate-50 border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-700">페이지당 컷 높이 (px)</span>
                <input
                  type="number"
                  min={480}
                  max={4000}
                  step={10}
                  disabled={loading}
                  data-testid="url-height-input"
                  value={targetHeightPx}
                  onChange={(e) => setTargetHeightPx(Number(e.target.value))}
                  className="w-24 px-2 py-1 rounded border border-slate-300 bg-white text-right font-mono text-slate-800"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {HEIGHT_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    disabled={loading}
                    onClick={() => setTargetHeightPx(p.value)}
                    className={`px-2 py-1 rounded-md text-[10px] font-semibold border cursor-pointer ${
                      targetHeightPx === p.value
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 pt-0.5">
            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeImages}
                disabled={loading}
                onChange={(e) => setIncludeImages(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>본문 이미지 및 카드 이미지 함께 가져오기</span>
            </label>
            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={useBrowserLayout}
                disabled={loading}
                data-testid="url-browser-layout-checkbox"
                onChange={(e) => setUseBrowserLayout(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>브라우저 CSS 레이아웃 실측 우선 (다단 이미지 · 소제목 자동 판별)</span>
            </label>
          </div>
        </div>

        <footer className="px-5 py-3.5 border-t border-slate-200 bg-white flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40 cursor-pointer"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            data-testid="url-import-submit-btn"
            className="px-4 py-1.5 rounded-lg bg-[#248567] hover:bg-[#1d6b52] disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{loading ? "웹페이지 분석 중…" : "페이지 분석 · 선택하기"}</span>
          </button>
        </footer>
      </form>
    </div>
  );
};

