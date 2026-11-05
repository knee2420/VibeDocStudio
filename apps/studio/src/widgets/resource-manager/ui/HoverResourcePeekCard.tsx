import React, { useMemo } from "react";
import {
  FileCode,
  FileSpreadsheet,
  FileText,
  Globe,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import { useResourcePeekKeyboard, useResourcePeekStore } from "../model/useResourcePeek";

const CARD_WIDTH = 300;
const CARD_HEIGHT = 260;

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * 리소스 트리 항목 위에서 Ctrl(⌘) + 호버 시 커서 옆에 뜨는 미니멀 퀵 피크 카드.
 * 기존 사이드 패널(OutlinePreviewSidebar)의 퀵 피크와 일치하는 UX를 제공합니다.
 */
export const HoverResourcePeekCard: React.FC = () => {
  useResourcePeekKeyboard();
  const peek = useResourcePeekStore((s) => s.open);

  const item = peek?.item;
  const ext = (item?.extension || "").toLowerCase();
  const isImage = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext);
  const isPdf = ext === ".pdf";
  const isWeb = item?.type === "web" || (item?.pathOrUrl ?? "").startsWith("http");

  const rawUrl = useMemo(() => {
    if (!item?.pathOrUrl) return "";
    if (isWeb) return item.pathOrUrl;
    return `/api/resources/raw-file?path=${encodeURIComponent(item.pathOrUrl)}`;
  }, [item, isWeb]);

  if (!peek || !item) return null;

  const left = Math.min(peek.x + 18, window.innerWidth - CARD_WIDTH - 20);
  const top = Math.max(16, Math.min(peek.y - 60, window.innerHeight - CARD_HEIGHT - 20));

  const snippetText = item.sectors?.[0]?.textSnippet;

  return (
    <div
      data-testid="hover-resource-peek-card"
      style={{ left, top, width: CARD_WIDTH }}
      className="fixed z-50 pointer-events-none select-none rounded-xl bg-white shadow-2xl border border-slate-300 ring-1 ring-black/10 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
    >
      {/* 헤더 바 */}
      <div className="px-2.5 py-1.5 bg-slate-900 text-white flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {isPdf ? (
            <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          ) : isWeb ? (
            <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          ) : isImage ? (
            <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : ext === ".csv" || ext === ".xlsx" ? (
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}

          <span title={item.title} className="text-[11px] font-semibold text-slate-100 truncate">
            {item.title}
          </span>
        </div>

        <span className="text-[9px] font-mono text-slate-400 shrink-0">
          {formatBytes(item.sizeBytes)}
        </span>
      </div>

      {/* 바디 프리뷰 */}
      <div className="p-2.5 bg-slate-50 flex flex-col justify-center min-h-[140px] max-h-[220px] overflow-hidden">
        {isImage && rawUrl ? (
          <div className="w-full flex items-center justify-center bg-white rounded border border-slate-200 p-1">
            <img
              src={rawUrl}
              alt={item.title}
              className="max-h-36 object-contain rounded"
            />
          </div>
        ) : isPdf ? (
          <div className="flex flex-col items-center justify-center p-3 text-center bg-white rounded border border-slate-200 gap-1.5">
            <FileText className="w-8 h-8 text-rose-500/80" />
            <p className="text-xs font-bold text-slate-800">PDF 문서 원본</p>
            <p className="text-[10px] text-slate-500">
              클릭 시 Heptabase 패널에서 바로 열람 가능
            </p>
            {item.sectors && item.sectors.length > 0 && (
              <span className="mt-1 px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[10px] font-semibold flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                발췌 섹터 {item.sectors.length}개
              </span>
            )}
          </div>
        ) : snippetText ? (
          <div className="w-full bg-white rounded border border-slate-200 p-2 overflow-hidden">
            <div className="text-[10px] font-bold text-slate-400 font-mono mb-1 uppercase">
              {ext.replace(".", "") || "TEXT"} Preview
            </div>
            <p className="font-mono text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap line-clamp-6">
              {snippetText}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center text-slate-400 text-xs">
            <FileCode className="w-6 h-6 text-slate-300 mb-1" />
            <span className="text-[11px]">{ext.toUpperCase() || "RESOURCE"} 파일</span>
            <span className="text-[10px] text-slate-400 mt-1 truncate max-w-[240px]">
              {item.pathOrUrl}
            </span>
          </div>
        )}
      </div>

      {/* 푸터 */}
      <div className="px-2.5 py-1 bg-white border-t border-slate-200 text-[9px] text-slate-400 flex items-center justify-between font-mono">
        <span>Ctrl 키를 떼면 닫힘</span>
        <span>클릭하여 열기</span>
      </div>
    </div>
  );
};

