import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Copy,
  FileCode,
  FileSpreadsheet,
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  MousePointerClick,
  Sparkles,
  Type,
  X,
} from "lucide-react";
import {
  PdfViewer,
  WebViewer,
  type ViewerHighlight,
  type ViewerSegment,
} from "@vibe/document-viewer";
import type { ResourceItem } from "@vibe/vdoc-schema";
import type { ResourcePreviewFocus } from "@/entities/resource";
import { env } from "@/shared/config";
import { useDragResize } from "@/shared/lib";
import { attachToComposer, referenceTextRef } from "@/features/ai-workspace";

interface Props {
  item: ResourceItem | null;
  /** 인용 · 근거에서 열었을 때 보여 줄 자리 (PDF 페이지 + 영역, 텍스트 줄 범위) */
  focus?: ResourcePreviewFocus | null;
  onClose: () => void;
}

/**
 * 헵타베이스 스타일 우측 슬라이드오버 문서 뷰어 패널.
 *
 * createPortal(..., document.body) 를 통해 최상위 document.body 에 마운트되므로,
 * 부모의 overflow/transform 에 절대 갇히지 않고 상단 메뉴바가 z-[100] 최전면으로 확실하게 튀어나옵니다.
 */
export const ResourceViewerDrawer: React.FC<Props> = ({ item, focus, onClose }) => {
  const [drawerWidth, setDrawerWidth] = useState<number>(640);
  const [feedback, setFeedback] = useState<string | null>(null);

  // PDF 관련 인터랙션 상태
  const [pdfInteractionMode, setPdfInteractionMode] = useState<"text" | "box">("text");
  const [customSegments, setCustomSegments] = useState<ViewerSegment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // 텍스트/코드 파일 프리뷰 상태
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState<boolean>(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 근거 초점 → PDF 강조 상자 (참조 영역 · RM 섹터와 같은 1000분율 좌표)
  const focusHighlights = useMemo<ViewerHighlight[]>(() => {
    if (!focus?.page || !focus.bbox) return [];
    return [{ id: "evidence-focus", page: focus.page, box: focus.bbox, label: focus.label, variant: "primary" }];
  }, [focus]);
  const focusLines = focus?.lines ?? null;

  const { isResizing, onResizeStart } = useDragResize({
    axis: "x-left",
    size: drawerWidth,
    onResize: (newSize) => setDrawerWidth(Math.max(400, Math.min(1100, newSize))),
  });

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2000);
  };

  const pathOrUrl = item?.pathOrUrl ?? "";

  const fileUrl = useMemo(() => {
    if (!item) return "";
    const p = item.pathOrUrl ?? "";
    if (item.type === "web" || p.startsWith("http://") || p.startsWith("https://")) {
      return p;
    }
    return `${env.apiBaseUrl}/api/resources/raw-file?path=${encodeURIComponent(p)}`;
  }, [item]);

  const ext = (item?.extension || "").toLowerCase();
  const isPdf = ext === ".pdf";
  const isWeb = item?.type === "web" || pathOrUrl.startsWith("http");
  const isImage = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext);
  const isTextLike = [
    ".md",
    ".markdown",
    ".txt",
    ".json",
    ".csv",
    ".ts",
    ".tsx",
    ".js",
    ".py",
    ".html",
    ".css",
    ".yaml",
    ".yml",
  ].includes(ext);

  // 텍스트 파일인 경우 내용 fetch (FastAPI 백엔드 정규 URL)
  useEffect(() => {
    if (!item || !isTextLike || !fileUrl) {
      setTextContent(null);
      return;
    }

    let cancelled = false;
    setTextLoading(true);
    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`파일을 불러올 수 없습니다 (HTTP ${res.status})`);
        return res.text();
      })
      .then((txt) => {
        if (!cancelled) {
          setTextContent(txt);
          setTextLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setTextContent(`파일을 읽어오지 못했습니다: ${err.message}`);
          setTextLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [item, isTextLike, fileUrl]);

  // 근거 자리로 스크롤 — PDF 는 페이지가 그려질 때까지 몇 번 다시 찾는다
  useEffect(() => {
    if (!focus) return;
    let tries = 0;
    let timer: number | undefined;
    const seek = () => {
      const root = bodyRef.current;
      if (!root) return;
      const target = focus.lines
        ? root.querySelector<HTMLElement>("[data-focus-line='start']")
        : focus.page
        ? root.querySelector<HTMLElement>(`[data-page-number="${focus.page}"]`)
        : null;
      if (target) {
        if (focus.page && focus.bbox && !focus.lines) {
          // 페이지 안에서 상자 높이만큼 내려 상자가 화면 위쪽에 오게
          const scroller = target.closest<HTMLElement>(".overflow-y-auto") ?? root;
          const offset = target.offsetTop + (target.offsetHeight * focus.bbox[0]) / 1000 - 80;
          scroller.scrollTo({ top: Math.max(offset, 0), behavior: "smooth" });
        } else {
          target.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        return;
      }
      if (tries++ < 40) timer = window.setTimeout(seek, 150);
    };
    seek();
    return () => window.clearTimeout(timer);
  }, [focus, textContent]);

  // Esc 키를 누르면 닫힘
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!item || typeof document === "undefined") return null;

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(pathOrUrl);
      showFeedback("경로가 클립보드에 복사되었습니다!");
    } catch {
      showFeedback("클립보드 접근 권한이 필요합니다.");
    }
  };

  const handleAttachToAI = () => {
    const snippet =
      textContent?.slice(0, 500) ||
      `[참조 문서: ${item.title}]\n경로: ${pathOrUrl}`;
    attachToComposer([referenceTextRef(item.id, snippet)]);
    showFeedback("AI Composer에 첨부되었습니다!");
  };

  const lineCount = textContent ? textContent.split("\n").length : 0;
  const charCount = textContent ? textContent.length : 0;

  return createPortal(
    <>
      {/* 헵타베이스 우측 슬라이드오버 패널 (화면 최상단 z-[100]에 마운트되어 상단 바에 가려지지 않음) */}
      <aside
        data-testid="resource-viewer-drawer"
        style={{ width: `${drawerWidth}px` }}
        className={`fixed top-0 right-0 bottom-0 z-[100] bg-white border-l border-slate-300 shadow-2xl flex flex-col select-none ${
          isResizing ? "transition-none" : "transition-transform duration-200 ease-out"
        }`}
      >
        {/* 좌측 리사이즈 핸들 */}
        <div
          data-testid="resource-viewer-resize-handle"
          onMouseDown={onResizeStart}
          title="드래그하여 너비 조절"
          className="absolute -left-1.5 top-0 bottom-0 w-3 hover:w-3.5 cursor-col-resize hover:bg-violet-400/50 active:bg-violet-600/60 transition-all z-50"
        />

        {/* 최전면 상단 메뉴바: z-[100] 최상단 헤더 (확실한 대비 & 닫기 버튼이 바로 보임) */}
        <header className="h-14 px-4 border-b border-slate-800 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0 select-none shadow-md z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
              {isPdf ? (
                <FileText className="w-4.5 h-4.5 text-rose-400" />
              ) : isWeb ? (
                <Globe className="w-4.5 h-4.5 text-blue-400" />
              ) : isImage ? (
                <ImageIcon className="w-4.5 h-4.5 text-emerald-400" />
              ) : (
                <FileCode className="w-4.5 h-4.5 text-amber-400" />
              )}
            </div>

            <div className="min-w-0 flex flex-col">
              <h3 className="text-xs font-bold text-white truncate leading-tight" title={item.title}>
                {item.title}
              </h3>
              <span
                className="text-[10px] text-slate-400 font-mono truncate max-w-[280px] cursor-pointer hover:text-slate-200 mt-0.5"
                onClick={handleCopyPath}
                title={`클릭하여 경로 복사: ${pathOrUrl}`}
              >
                {pathOrUrl}
              </span>
            </div>
          </div>

          {/* 우측 메뉴바 도구 모음 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* PDF 모드 토글 (텍스트 vs 영역 선택) */}
            {isPdf && (
              <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setPdfInteractionMode("text")}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded transition cursor-pointer ${
                    pdfInteractionMode === "text"
                      ? "bg-violet-600 text-white shadow-2xs font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="글자/문장 드래그 복사 모드"
                >
                  <Type className="w-3 h-3" />
                  <span>텍스트</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPdfInteractionMode("box")}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded transition cursor-pointer ${
                    pdfInteractionMode === "box"
                      ? "bg-violet-600 text-white shadow-2xs font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="사각 영역 선택(BBox) 모드"
                >
                  <MousePointerClick className="w-3 h-3" />
                  <span>영역 선택</span>
                </button>
              </div>
            )}

            {/* AI Composer 첨부 버튼 */}
            <button
              type="button"
              onClick={handleAttachToAI}
              className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
              title="현재 문서를 AI Composer 컨텍스트에 첨부"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI 첨부</span>
            </button>

            <div className="w-[1px] h-5 bg-slate-700 mx-0.5" />

            {/* 닫기 버튼: 최전면에 명확하게 노출되는 대형 닫기 버튼 */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer flex items-center justify-center shadow-xs"
              title="패널 닫기 (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* 피드백 알림 바 */}
        {feedback && (
          <div className="bg-emerald-50 text-emerald-800 text-xs font-semibold px-4 py-1.5 border-b border-emerald-200 flex items-center gap-1.5 animate-fadeIn shrink-0">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{feedback}</span>
          </div>
        )}

        {/* 바디 영역: 문서 종류별 뷰어 */}
        <div ref={bodyRef} className="flex-1 w-full h-full overflow-hidden flex flex-col relative min-h-0 bg-slate-100 select-text">
          {isPdf ? (
            <PdfViewer
              url={fileUrl}
              title={item.title}
              isSpread={false}
              isEditMode={pdfInteractionMode === "box"}
              enableSmartSnap={true}
              segments={customSegments}
              highlights={focusHighlights}
              selectedSegmentId={selectedSegmentId}
              onSelectSegment={(seg) => setSelectedSegmentId(seg.id)}
              onCreateSegment={(seg) => {
                setCustomSegments([seg]);
                setSelectedSegmentId(seg.id);
                showFeedback("사각 영역이 지정되었습니다!");
              }}
              onUpdateSegment={(seg) => {
                setCustomSegments((prev) =>
                  prev.some((s) => s.id === seg.id) ? prev.map((s) => (s.id === seg.id ? seg : s)) : [seg]
                );
              }}
              onDeleteSegment={(id) => {
                setCustomSegments((prev) => prev.filter((s) => s.id !== id));
                if (selectedSegmentId === id) setSelectedSegmentId(null);
              }}
            />
          ) : isWeb ? (
            <WebViewer
              url={fileUrl}
              title={item.title}
              initialMode="reader"
              onExtractText={(txt) => {
                void navigator.clipboard.writeText(txt);
                showFeedback("텍스트를 복사했습니다!");
              }}
            />
          ) : isImage ? (
            <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-slate-900/5">
              <img
                src={fileUrl}
                alt={item.title}
                className="max-w-full max-h-full object-contain rounded-lg shadow-md border border-slate-200 bg-white"
              />
            </div>
          ) : isTextLike ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
              {/* 서브 툴바 */}
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-bold uppercase">
                    {ext.replace(".", "") || "TEXT"}
                  </span>
                  <span>{lineCount.toLocaleString()} 줄</span>
                  <span>·</span>
                  <span>{charCount.toLocaleString()} 자</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (textContent) {
                      void navigator.clipboard.writeText(textContent);
                      showFeedback("전체 텍스트를 복사했습니다!");
                    }
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer transition shadow-2xs"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-600" />
                  <span>내용 복사</span>
                </button>
              </div>

              {/* 텍스트 본문 (가독성 높은 서식) */}
              <div className="flex-1 overflow-auto p-6 bg-[#fafbfc]">
                {textLoading ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-xs gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
                    <span className="font-semibold text-slate-600">문서를 불러오는 중...</span>
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto bg-white p-6 rounded-lg border border-slate-200 shadow-2xs">
                    <pre className="font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed select-text font-normal">
                      {focusLines && textContent ? <FocusedText text={textContent} lines={focusLines} /> : textContent}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 text-xs gap-3">
              <FileText className="w-10 h-10 text-slate-300" />
              <p className="font-bold text-slate-700 text-sm">미리보기를 직접 지원하지 않는 파일 형식입니다.</p>
              <p className="text-xs text-slate-500">확장자: {ext || "알 수 없음"}</p>
              <button
                type="button"
                onClick={handleCopyPath}
                className="mt-2 px-3.5 py-1.5 rounded-md bg-slate-200 text-slate-800 hover:bg-slate-300 text-xs font-semibold cursor-pointer transition shadow-2xs"
              >
                로컬 경로 복사하기
              </button>
            </div>
          )}
        </div>

        {/* 푸터 영역 */}
        <footer className="px-4 py-2 bg-white border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between select-none shrink-0 shadow-xs">
          <span className="truncate">
            {isPdf
              ? pdfInteractionMode === "box"
                ? "💡 마우스로 원하는 영역을 사각 드래그하여 선택하세요"
                : "💡 글자나 문장을 마우스로 드래그하여 복사하세요"
              : isWeb
              ? "💡 웹 아티클을 스크롤하여 참조할 수 있습니다"
              : "💡 텍스트를 드래그하여 복사하거나 AI Composer로 주입할 수 있습니다"}
          </span>
          <span className="text-[10px] text-slate-400 font-mono shrink-0">Heptabase Viewer</span>
        </footer>
      </aside>
    </>,
    document.body
  );
};

const NL = "\n";

/** 근거 줄 범위를 칠한 본문 — 나머지는 그대로 둔다. */
const FocusedText: React.FC<{ text: string; lines: [number, number] }> = ({ text, lines }) => {
  const all = text.split(NL);
  const start = Math.max(1, lines[0]);
  const end = Math.min(all.length, Math.max(start, lines[1]));
  return (
    <>
      {all.slice(0, start - 1).join(NL)}
      {start > 1 ? NL : ""}
      <mark data-focus-line="start" className="bg-amber-100 text-slate-900 rounded-sm outline outline-2 outline-amber-300">
        {all.slice(start - 1, end).join(NL)}
      </mark>
      {end < all.length ? NL : ""}
      {all.slice(end).join(NL)}
    </>
  );
};

