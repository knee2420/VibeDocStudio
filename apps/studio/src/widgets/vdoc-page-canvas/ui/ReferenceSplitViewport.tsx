/**
 * Reference Manager — 레퍼런스(남이 만든 완성물) 라이브러리를 프로젝트에 연결하고, 원본을 보며 핀을 꽂고,
 * 층위별로 무엇을 따를지 켜고 끈다.
 *
 * 레퍼런스는 작업 문서가 아니다. 에디터 문서 스토어 · 템플릿 허브 · 활성 문서에 절대 손대지 않고,
 * `@/entities/reference-manager` (서버 `/api/reference`)만 쓴다. 폴더 · 대량 자료 인입은 Resource Manager 의 일이다.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  FileUp,
  Globe,
  Library,
  Loader2,
  Lock,
  MapPin,
  MousePointerClick,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Sparkles,
  SquareSplitHorizontal,
  Trash2,
  Type,
  X,
} from "lucide-react";

import {
  PdfViewer,
  WebViewer,
  type ViewerHighlight,
  type ViewerSegment,
  type WebArticlePayload,
} from "@vibe/document-viewer";

import {
  isLayerOn,
  referenceApi,
  useReferenceStore,
  type BoundReference,
  type ConsensusAdoption,
  type ConsensusCard,
  type ReferenceItem,
  type ReferencePin,
} from "@/entities/reference-manager";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { REFERENCE_SPLIT_WIDTH, useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import {
  attachable,
  attachToComposer,
  extractPdfRegionText,
  referenceRegionRef,
  referenceTextRef,
  useReferenceRegionStore,
} from "@/features/ai-workspace";
import { useDragResize } from "@/shared/lib";
import { CollapsedPanelRail } from "@/shared/ui";

const FEEDBACK_MS = 2000;
const EMPTY_PINS: ReferencePin[] = [];
const ACCEPT_FILES = ".pdf,.html,.htm,.png,.jpg,.jpeg,.webp,.gif";
const LAYER_IDS = ["D1", "D2", "D3", "D4", "D5", "D6"];

const kindBadge = (item: ReferenceItem) =>
  item.kind === "pdf"
    ? { label: "PDF", tone: "bg-rose-50 text-rose-700 border-rose-200" }
    : item.kind === "web"
      ? { label: "Web", tone: "bg-blue-50 text-blue-700 border-blue-200" }
      : { label: "IMG", tone: "bg-slate-100 text-slate-600 border-slate-200" };

// --- 층위 스트립 ------------------------------------------------------------------------------

/** 층위별 켜고 끄기 (D1–D6 …). 꺼 둔 층위는 AI 가 따르지 않는다. 측정값은 툴팁으로 보여 준다. */
const LayerStrip: React.FC<{ entry: BoundReference }> = ({ entry }) => {
  const report = useReferenceStore((s) => s.layers[entry.refId]);
  const toggleLayer = useReferenceStore((s) => s.toggleLayer);
  if (!report || report.layers.length === 0) return null;
  return (
    <div data-testid="reference-layer-strip" className="px-2.5 py-1 border-b border-slate-200 bg-white flex items-center gap-1 flex-wrap shrink-0">
      <span className="text-[10px] text-slate-500 mr-0.5" title="이 레퍼런스에서 따를 결정의 층위 (끄면 AI 가 그 층위는 따르지 않는다)">
        층위
      </span>
      {report.layers.map((layer) => {
        const on = isLayerOn(entry, layer.id);
        const values = Object.entries(layer.values)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join("\n");
        return (
          <button
            key={layer.id}
            type="button"
            data-testid={`reference-layer-${layer.id}`}
            onClick={() => void toggleLayer(entry.refId, layer.id)}
            title={`${layer.id} ${layer.name}\n${layer.question}\n${values || "(정성 판단 층위)"}\n\n클릭: ${on ? "끄기" : "켜기"}`}
            className={`px-1.5 py-0.5 rounded-sm text-[10px] font-mono border transition cursor-pointer ${
              on
                ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                : "bg-slate-50 text-slate-400 border-slate-200 line-through hover:text-slate-600"
            }`}
          >
            {layer.id}
          </button>
        );
      })}
    </div>
  );
};

// --- 해석 합의 ----------------------------------------------------------------------------------

const EMPTY_CARDS: ConsensusCard[] = [];
const ADOPTION_LABEL: Record<ConsensusAdoption, string> = { follow: "따름", consult: "참고만", exclude: "안 따름" };
const ADOPTION_TONE: Record<ConsensusAdoption, string> = {
  follow: "bg-emerald-600 text-white",
  consult: "bg-sky-600 text-white",
  exclude: "bg-slate-600 text-white",
};

const scopeLabel = (scope: string): string => {
  const sub = scope.split("#").slice(1).join(" · ");
  if (!sub) return "전체";
  return sub.replace(/^p(\d+)/, "$1쪽").replace("pin:", "핀 ").replace("blk:", "덩어리 ").replace("sec:", "섹션 ");
};

const AdoptionPicker: React.FC<{ value: ConsensusAdoption; onChange: (a: ConsensusAdoption) => void; testid: string }> = ({
  value,
  onChange,
  testid,
}) => (
  <div className="inline-flex rounded-sm border border-slate-300 overflow-hidden text-[10px]" data-testid={testid}>
    {(Object.keys(ADOPTION_LABEL) as ConsensusAdoption[]).map((a) => (
      <button
        key={a}
        type="button"
        onClick={() => onChange(a)}
        className={`px-1.5 py-0.5 cursor-pointer transition ${value === a ? ADOPTION_TONE[a] : "bg-white text-slate-600 hover:bg-slate-100"}`}
      >
        {ADOPTION_LABEL[a]}
      </button>
    ))}
  </div>
);

/** AI 가 제안한 해석 카드 하나 — 채택 강도와 해석(본 해석 · 대안)을 고르고 확정한다. */
const PendingCardRow: React.FC<{ refId: string; card: ConsensusCard }> = ({ refId, card }) => {
  const confirmCard = useReferenceStore((s) => s.confirmCard);
  const discardCard = useReferenceStore((s) => s.discardCard);
  const [adoption, setAdoption] = useState<ConsensusAdoption>(card.adoption);
  const [choice, setChoice] = useState<number>(-1); // -1 = 본 해석
  const readings = [card.reading, ...card.alternatives.map((a) => a.reading)];
  return (
    <li data-testid={`consensus-pending-${card.cardId}`} className="rounded-sm border border-amber-300 bg-amber-50/60 p-1.5 space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] px-1 rounded-xs bg-amber-200 text-amber-900">{card.layer}</span>
        <span className="text-[10px] text-slate-500">{scopeLabel(card.scope)}</span>
        <span className="ml-auto text-[9px] text-amber-700">AI 제안</span>
      </div>
      {readings.map((text, i) => (
        <label key={i} className={`flex gap-1 text-[11px] leading-snug ${readings.length > 1 ? "cursor-pointer" : ""}`}>
          {readings.length > 1 && (
            <input
              type="radio"
              className="mt-0.5"
              checked={choice === i - 1}
              onChange={() => setChoice(i - 1)}
              data-testid={`consensus-reading-${card.cardId}-${i}`}
            />
          )}
          <span className={i > 0 ? "text-slate-600" : "text-slate-800"}>
            {i > 0 && <span className="text-[9px] text-slate-400 mr-1">대안 {i}</span>}
            {text}
          </span>
        </label>
      ))}
      <div className="flex items-center gap-1.5">
        <AdoptionPicker value={adoption} onChange={setAdoption} testid={`consensus-adoption-${card.cardId}`} />
        <button
          type="button"
          data-testid={`consensus-confirm-${card.cardId}`}
          onClick={() => void confirmCard(refId, card.cardId, { adoption, alternative: choice >= 0 ? choice : undefined })}
          className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm bg-amber-600 text-white text-[10px] font-bold hover:bg-amber-700 cursor-pointer"
        >
          <Check className="w-2.5 h-2.5" /> 확정
        </button>
        <button
          type="button"
          onClick={() => discardCard(refId, card.cardId)}
          className="px-1 py-0.5 rounded-sm text-[10px] text-slate-500 hover:text-rose-700 cursor-pointer"
          title="이 제안 버리기"
        >
          버림
        </button>
      </div>
    </li>
  );
};

/**
 * 해석 합의 — 같은 레퍼런스도 사람마다 다르게 읽고, 일부분만 따를 수 있다.
 * AI 가 낸 해석 카드를 사용자가 채택 강도(따름 · 참고만 · 안 따름)와 해석(본 해석 · 대안)을 골라 확정하면,
 * 이후 AI 는 다시 해석하지 않고 확정 카드를 따른다.
 */
const ConsensusPanel: React.FC<{ entry: BoundReference }> = ({ entry }) => {
  const pending = useReferenceStore((s) => s.pendingCards[entry.refId] ?? EMPTY_CARDS);
  const setCardAdoption = useReferenceStore((s) => s.setCardAdoption);
  const removeCard = useReferenceStore((s) => s.removeCard);
  const [open, setOpen] = useState(true);
  const confirmed = entry.consensus ?? EMPTY_CARDS;
  if (confirmed.length === 0 && pending.length === 0) return null;
  return (
    <div data-testid="reference-consensus" className="border-b border-slate-200 bg-white shrink-0 max-h-[40%] overflow-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-2.5 py-1 flex items-center gap-1.5 text-[10px] text-slate-600 hover:bg-slate-50 cursor-pointer"
      >
        <Sparkles className="w-3 h-3 text-amber-600" />
        <span className="font-bold text-slate-800">해석 합의</span>
        <span>확정 {confirmed.length}</span>
        {pending.length > 0 && <span className="px-1 rounded-xs bg-amber-100 text-amber-800">확정 대기 {pending.length}</span>}
        {open ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      {open && (
        <ul className="px-2.5 pb-2 space-y-1.5">
          {pending.map((card) => (
            <PendingCardRow key={card.cardId} refId={entry.refId} card={card} />
          ))}
          {confirmed.map((card) => (
            <li key={card.cardId} data-testid={`consensus-card-${card.cardId}`} className="rounded-sm border border-slate-200 p-1.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] px-1 rounded-xs bg-slate-100 text-slate-700">{card.layer}</span>
                <span className="text-[10px] text-slate-500">{scopeLabel(card.scope)}</span>
                <AdoptionPicker
                  value={card.adoption}
                  onChange={(a) => void setCardAdoption(entry.refId, card.cardId, a)}
                  testid={`consensus-adoption-${card.cardId}`}
                />
                <button
                  type="button"
                  onClick={() => void removeCard(entry.refId, card.cardId)}
                  className="ml-auto p-0.5 text-slate-400 hover:text-rose-700 cursor-pointer"
                  title="이 합의 지우기"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <p className="text-[11px] leading-snug text-slate-800">{card.reading}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// --- 원본 카드 ---------------------------------------------------------------------------------

/**
 * 레퍼런스 원본 카드 — 원본(PDF · 웹 · 이미지)을 그대로 보여 주고 핀을 꽂는다.
 * PDF: [텍스트] 글자 드래그 · [영역 선택] 사각 드래그 / 웹: 리더(추출 본문) · 스냅샷 · 라이브
 */
const ReferenceCard: React.FC<{ entry: BoundReference; number: number; onClose: () => void }> = ({
  entry,
  number,
  onClose,
}) => {
  const { refId, item } = entry;
  const sourceUrl = referenceApi.sourceUrl(refId);
  const extraction = useReferenceStore((s) => s.extraction[refId]);
  const pins = useReferenceStore((s) => s.pins[refId] ?? EMPTY_PINS);
  const focusedPin = useReferenceStore((s) => s.focusedPin);
  const ensureDetail = useReferenceStore((s) => s.ensureDetail);
  const reanalyze = useReferenceStore((s) => s.reanalyze);

  const [pdfMode, setPdfMode] = useState<"text" | "box">("text");
  const [segments, setSegments] = useState<ViewerSegment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<{ text: string; page: number } | null>(null);
  const [regionText, setRegionText] = useState<{ segmentId: string; text: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const articleRef = React.useRef<HTMLElement>(null);

  useEffect(() => {
    void ensureDetail(refId);
  }, [refId, ensureDetail]);

  const selectedSegment = segments.find((s) => s.id === selectedSegmentId) ?? segments[0] ?? null;
  const isPdf = item.kind === "pdf" && item.status === "ready";

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), FEEDBACK_MS);
  };

  // 고른 영역의 글자 (핀 · AI 첨부용). 끄는 동안은 기다렸다 읽는다.
  useEffect(() => {
    if (!selectedSegment || !isPdf) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      extractPdfRegionText(sourceUrl, selectedSegment.page, selectedSegment.box)
        .then((text) => !cancelled && setRegionText({ segmentId: selectedSegment.id, text }))
        .catch(() => !cancelled && setRegionText({ segmentId: selectedSegment.id, text: "" }));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sourceUrl, isPdf, selectedSegment?.id, selectedSegment?.page, selectedSegment?.box.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const regionReady = Boolean(selectedSegment && regionText?.segmentId === selectedSegment.id);
  const regionRef = useMemo(
    () =>
      selectedSegment && regionReady
        ? referenceRegionRef(refId, { page: selectedSegment.page, box: selectedSegment.box, text: regionText!.text })
        : null,
    [refId, selectedSegment, regionReady, regionText]
  );

  // Ctrl+L 이 "지금 고른 영역" 을 알 수 있게 알린다.
  useEffect(() => {
    const store = useReferenceRegionStore.getState();
    if (regionRef) store.setCurrent(regionRef);
    else if (store.current?.meta?.entityId === refId) store.setCurrent(null);
  }, [regionRef, refId]);
  useEffect(
    () => () => {
      const store = useReferenceRegionStore.getState();
      if (store.current?.meta?.entityId === refId) store.setCurrent(null);
    },
    [refId]
  );

  // AI 칩 · 핀 클릭으로 들어온 초점 → 그 쪽으로 스크롤
  const regionFocus = useReferenceRegionStore((s) => (s.focus?.refId === refId ? s.focus : null));
  const pinFocus = useMemo(() => {
    if (focusedPin?.refId === refId && focusedPin.page) {
      return {
        refId,
        page: focusedPin.page,
        box: focusedPin.bbox ?? [0, 0, 60, 1000],
        at: focusedPin.at,
      };
    }
    return null;
  }, [focusedPin, refId]);
  const focus = regionFocus ?? pinFocus;
  useEffect(() => {
    if (!focus) return;
    let attempts = 0;
    let lastHeight = 0;
    const tryScroll = () => {
      attempts++;
      const pageEl = articleRef.current?.querySelector<HTMLElement>(`[data-page-number="${focus.page}"]`);
      if (pageEl) {
        const scroller = pageEl.closest<HTMLElement>(".overflow-y-auto, .overflow-auto");
        const height = pageEl.offsetHeight;
        if (scroller && height > 50 && Math.abs(height - lastHeight) > 10) {
          lastHeight = height;
          const offset = pageEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
          scroller.scrollTo({ top: Math.max(0, offset + (focus.box[0] / 1000) * height - 24), behavior: attempts === 1 ? "auto" : "smooth" });
        } else if (!scroller) {
          pageEl.scrollIntoView({ block: "start", behavior: "smooth" });
          window.clearInterval(poll);
        }
      }
      if (attempts >= 20) window.clearInterval(poll);
    };
    const first = window.setTimeout(tryScroll, 50);
    const poll = window.setInterval(tryScroll, 100);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
    };
  }, [focus]);

  // 영역 핀은 상시 상자로, 초점은 강조 상자로
  const highlights = useMemo<ViewerHighlight[]>(() => {
    const list: ViewerHighlight[] = pins
      .filter((p) => p.kind === "region" && p.bbox && p.page)
      .map((p) => ({
        id: `pin-${p.pinId}`,
        page: p.page!,
        box: p.bbox!,
        label: p.layer || "핀",
        variant: focusedPin?.pinId === p.pinId ? ("primary" as const) : ("context" as const),
      }));
    if (focus && !list.some((h) => h.page === focus.page && h.box[0] === focus.box[0] && h.box[1] === focus.box[1])) {
      list.push({ id: `ai-focus-${focus.at}`, page: focus.page, box: focus.box, label: "AI", variant: "primary" });
    }
    return list;
  }, [pins, focusedPin, focus]);

  const article = useMemo<WebArticlePayload>(
    () => ({
      title: extraction?.article?.title || item.title,
      siteName: extraction?.article?.siteName,
      byline: extraction?.article?.byline,
      contentHtml: extraction?.article?.html ?? extraction?.blocks.map((b) => b.html).join("\n"),
      textContent: extraction?.article?.text ?? extraction?.blocks.map((b) => b.text).join("\n\n"),
    }),
    [extraction, item.title]
  );

  const copyText = async (text: string) => {
    if (!text || !navigator.clipboard) return showFeedback("복사할 텍스트가 없습니다.");
    try {
      await navigator.clipboard.writeText(text);
      showFeedback("텍스트를 클립보드에 복사했습니다!");
    } catch {
      showFeedback("클립보드 접근 권한이 필요합니다.");
    }
  };

  const createRegionPin = async () => {
    if (!selectedSegment) return;
    setBusy(true);
    try {
      const pin = await useReferenceStore.getState().addPin(refId, {
        kind: "region",
        page: selectedSegment.page,
        bbox: selectedSegment.box,
        text: regionText?.segmentId === selectedSegment.id ? regionText.text : "",
      });
      useReferenceStore.getState().setFocusedPin(pin);
      setSegments([]);
      setSelectedSegmentId(null);
      showFeedback("📌 핀을 꽂았습니다");
    } finally {
      setBusy(false);
    }
  };

  const createTextPin = async () => {
    if (!selectedText) return;
    setBusy(true);
    try {
      const pin = await useReferenceStore.getState().addPin(refId, { kind: "text", page: selectedText.page, text: selectedText.text });
      useReferenceStore.getState().setFocusedPin(pin);
      setSelectedText(null);
      window.getSelection()?.removeAllRanges();
      showFeedback("📌 텍스트 핀을 꽂았습니다");
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, item.pageCount || 1);
  const selecting = segments.length > 0 || Boolean(selectedText);

  return (
    <article
      ref={articleRef}
      data-testid={`reference-card-${refId}`}
      data-ai-entity={refId}
      className="w-full h-full bg-white rounded border border-slate-300 shadow-sm ring-1 ring-slate-900/5 flex flex-col overflow-hidden"
    >
      <header className="px-3 py-2 bg-slate-300 text-slate-800 border-b border-slate-300 flex items-center justify-between gap-2 shrink-0 rounded-t select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-white/90 text-slate-700 border border-slate-300/90 text-[10px] font-bold shrink-0">
            <Lock className="w-2.5 h-2.5 text-slate-500" />
            참조 {number}
          </span>
          <h4 className="text-xs font-bold truncate text-slate-800" title={item.title}>
            {item.title}
          </h4>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isPdf && (
            <div className="inline-flex items-center p-0.5 rounded-sm bg-slate-200 border border-slate-300 text-[10px]">
              {(["text", "box"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPdfMode(mode);
                    setSelectedText(null);
                    window.getSelection()?.removeAllRanges();
                  }}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs transition cursor-pointer ${
                    pdfMode === mode ? "bg-amber-600 text-white font-bold" : "text-slate-600 hover:text-slate-900"
                  }`}
                  title={mode === "text" ? "글자나 문장을 드래그해 고르는 모드" : "사각 영역을 드래그해 고르는 모드"}
                >
                  {mode === "text" ? <Type className="w-2.5 h-2.5" /> : <MousePointerClick className="w-2.5 h-2.5" />}
                  <span>{mode === "text" ? "텍스트" : "영역 선택"}</span>
                </button>
              ))}
            </div>
          )}
          <div className="w-px h-3 bg-slate-400 mx-0.5" />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-sm hover:bg-rose-100 hover:text-rose-700 text-slate-500 cursor-pointer transition-colors"
            title="뷰어 닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <LayerStrip entry={entry} />
      <ConsensusPanel entry={entry} />

      <div
        className="flex-1 w-full h-full overflow-hidden flex flex-col relative min-h-0 select-text"
        onMouseUp={() => {
          if (pdfMode === "box") return;
          const sel = window.getSelection();
          const text = sel?.toString().trim();
          if (!text) return setSelectedText(null);
          const anchor = sel?.anchorNode;
          const el = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
          const page = Number(el?.closest<HTMLElement>("[data-page-number]")?.getAttribute("data-page-number") || "1");
          setSelectedText({ text, page: Number.isFinite(page) && page > 0 ? page : 1 });
        }}
        onContextMenu={
          attachable(() => {
            const text = window.getSelection()?.toString() ?? "";
            return text.trim() ? [referenceTextRef(refId, text)] : [];
          }).onContextMenu
        }
      >
        {item.status === "failed" ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-xs text-slate-500 bg-slate-50 text-center">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span>원본을 가져오거나 해체하지 못했습니다.</span>
            <span className="text-[10px] text-slate-400 max-w-[320px] break-all">{item.error}</span>
            <button
              type="button"
              onClick={() => void reanalyze(refId)}
              className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> 다시 시도
            </button>
          </div>
        ) : item.kind === "web" ? (
          <WebViewer
            url={item.sourceUrl || sourceUrl}
            title={item.title}
            initialMode="reader"
            snapshotUrl={sourceUrl}
            article={article}
            onExtractText={(text) => void copyText(text)}
          />
        ) : item.kind === "image" ? (
          <div className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center p-3">
            <img src={sourceUrl} alt={item.title} className="max-w-full shadow border border-slate-200 bg-white" />
          </div>
        ) : (
          <PdfViewer
            url={sourceUrl}
            title={item.title}
            isSpread={false}
            isEditMode={pdfMode === "box"}
            highlights={highlights}
            enableSmartSnap={true}
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={(segment) => setSelectedSegmentId(segment.id)}
            onCreateSegment={(created) => {
              setSegments([created]);
              setSelectedSegmentId(created.id);
              setSelectedText(null);
            }}
            onUpdateSegment={(updated) =>
              setSegments((prev) => (prev.some((s) => s.id === updated.id) ? prev.map((s) => (s.id === updated.id ? updated : s)) : [updated]))
            }
            onDeleteSegment={(id) => {
              setSegments((prev) => prev.filter((s) => s.id !== id));
              if (selectedSegmentId === id) setSelectedSegmentId(null);
            }}
          />
        )}

        {isPdf && pins.length > 0 && (
          <div className="absolute top-2 bottom-2 right-1.5 w-3 z-30 pointer-events-none flex flex-col" title="핀 위치">
            {pins.map((pin) => {
              const yOffset = pin.bbox ? pin.bbox[0] / 1000 : 0.35;
              const topPct = Math.min(97, Math.max(3, (((pin.page ?? 1) - 1 + yOffset) / totalPages) * 100));
              return (
                <button
                  key={pin.pinId}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    useReferenceStore.getState().setFocusedPin(pin);
                    useReferenceRegionStore.getState().setFocus({ refId, page: pin.page ?? 1, box: pin.bbox ?? [0, 0, 60, 1000] });
                  }}
                  style={{ top: `${topPct}%` }}
                  className="absolute right-0 w-2.5 h-1.5 bg-amber-500 hover:w-4 hover:h-2.5 -translate-y-1/2 rounded-xs hover:bg-amber-600 transition-all cursor-pointer pointer-events-auto border border-amber-600/60"
                  title={`${pin.label} (클릭 시 이동)`}
                />
              );
            })}
          </div>
        )}
      </div>

      <footer className="p-2.5 bg-slate-50 border-t border-slate-200/90 flex flex-col gap-1.5 shrink-0 rounded-b select-none">
        <div className="flex items-center justify-between text-[11px] px-1 text-slate-600">
          <span className="truncate max-w-[340px]">
            {feedback ? (
              <span className="text-amber-800 font-bold flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" /> {feedback}
              </span>
            ) : segments.length > 0 ? (
              <span className="text-amber-800 font-bold">영역을 골랐습니다. [핀 꽂기] 로 남기세요</span>
            ) : selectedText ? (
              <span className="text-amber-800 font-bold">
                선택한 글 ({selectedText.page}p, {selectedText.text.length}자) — [핀 꽂기] 로 남기세요
              </span>
            ) : (
              <span className="text-slate-500">💡 따라 하고 싶은 부분에 핀을 꽂으세요 (내용이 아니라 결정 방식을 가져옵니다)</span>
            )}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {item.kind.toUpperCase()} · {item.pageCount || 1}p
          </span>
        </div>
        <div className="flex items-center gap-1.5 pt-0.5">
          {selecting ? (
            <>
              <button
                type="button"
                data-testid={segments.length > 0 ? "reference-pin-create-btn" : "reference-text-pin-create-btn"}
                disabled={busy}
                onClick={() => void (segments.length > 0 ? createRegionPin() : createTextPin())}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-sm text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                핀 꽂기
              </button>
              <button
                type="button"
                onClick={() => void copyText(segments.length > 0 ? regionText?.text || "" : selectedText?.text || "")}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-sm text-xs cursor-pointer"
              >
                <Copy className="w-3 h-3 text-slate-500" /> 복사
              </button>
              <button
                type="button"
                data-testid="reference-region-attach"
                disabled={segments.length > 0 && !regionRef}
                {...(regionRef && segments.length > 0 ? attachable(() => [regionRef]) : {})}
                onClick={() => {
                  if (segments.length > 0) {
                    if (regionRef) attachToComposer([regionRef]);
                  } else if (selectedText) {
                    attachToComposer([referenceTextRef(refId, selectedText.text)]);
                  }
                  showFeedback("✦ AI Composer 에 첨부했습니다");
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-sm text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3 text-amber-600" /> AI 첨부
              </button>
              <button
                type="button"
                onClick={() => {
                  setSegments([]);
                  setSelectedSegmentId(null);
                  setSelectedText(null);
                  window.getSelection()?.removeAllRanges();
                }}
                className="inline-flex items-center px-2 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-slate-300 rounded-sm text-xs cursor-pointer ml-auto"
              >
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void copyText(article.textContent || "")}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-300 hover:bg-slate-400/80 text-slate-800 border border-slate-400/70 rounded-sm text-xs font-semibold cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-slate-600" /> 추출 텍스트 복사
            </button>
          )}
        </div>
      </footer>
    </article>
  );
};

// --- 추가 팝오버 ------------------------------------------------------------------------------

const AddReferencePopover: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const library = useReferenceStore((s) => s.library);
  const bound = useReferenceStore((s) => s.bound);
  const addFile = useReferenceStore((s) => s.addFile);
  const addUrl = useReferenceStore((s) => s.addUrl);
  const bind = useReferenceStore((s) => s.bind);
  const setViewerOpen = useWorkspaceLayoutStore((s) => s.setRefViewerOpen);
  const [tab, setTab] = useState<"file" | "url" | "library">("file");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const unbound = library.filter((it) => !bound.some((b) => b.refId === it.refId));

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setViewerOpen(true);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { id: "file" as const, icon: <FileUp className="w-3.5 h-3.5 text-amber-700" />, title: "파일 하나 (PDF · HTML · 이미지)" },
    { id: "url" as const, icon: <Globe className="w-3.5 h-3.5 text-blue-600" />, title: "웹 주소 하나" },
    { id: "library" as const, icon: <Library className="w-3.5 h-3.5 text-slate-600" />, title: "라이브러리에서 연결" },
  ];

  return (
    <div
      ref={boxRef}
      data-testid="reference-add-popover"
      className="absolute right-2 top-9 w-80 bg-white/95 backdrop-blur-md rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col text-xs"
    >
      <div className="px-2 py-1.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
        <div className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`reference-add-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              title={t.title}
              className={`p-1 rounded transition cursor-pointer ${tab === t.id ? "bg-amber-100 shadow-2xs" : "hover:bg-slate-200"}`}
            >
              {t.icon}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-200 text-slate-400 cursor-pointer" title="닫기">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2 space-y-2">
        <p className="text-[10px] text-slate-500 leading-snug">
          남이 만든 완성물을 <b>하나씩</b> 추가합니다. 폴더 · 대량 자료(사실 근거)는 Resource Manager 에 넣으세요.
        </p>
        {tab === "file" && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_FILES}
              className="hidden"
              data-testid="reference-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void run(() => addFile(file));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded border border-dashed border-amber-300 bg-amber-50/60 hover:bg-amber-50 text-amber-800 font-semibold cursor-pointer disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
              파일 고르기 (PDF · HTML · 이미지)
            </button>
          </>
        )}
        {tab === "url" && (
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) void run(() => addUrl(url.trim(), title.trim() || undefined));
            }}
          >
            <div className="flex items-center gap-1 border border-slate-200 rounded px-2 py-1 bg-white focus-within:border-blue-400">
              <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="w-full text-xs bg-transparent focus:outline-none font-mono"
                autoFocus
              />
              <button
                type="submit"
                disabled={busy || !url.trim()}
                className="p-1 rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 cursor-pointer shrink-0"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목 (선택)"
              className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-400"
            />
          </form>
        )}
        {tab === "library" && (
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {unbound.length === 0 ? (
              <div className="py-4 text-center text-slate-400">이 프로젝트에 연결하지 않은 레퍼런스가 없습니다.</div>
            ) : (
              unbound.map((it) => (
                <button
                  key={it.refId}
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => bind(it.refId))}
                  className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-amber-50 text-left cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate flex-1">{it.title}</span>
                  <span className={`text-[9px] font-mono px-1 rounded border ${kindBadge(it).tone}`}>{kindBadge(it).label}</span>
                </button>
              ))
            )}
          </div>
        )}
        {error && <div className="text-[10px] text-rose-600 break-all">{error}</div>}
      </div>
    </div>
  );
};

// --- Reference Manager 위젯 -------------------------------------------------------------------

/**
 * 통합 레퍼런스 매니저 위젯 (좌측 탭 · 독립 스플릿 공용).
 * 위: 연결된 레퍼런스와 핀 / 가운데: 빠른 전환 탭 / 아래: 원본 뷰어
 */
export const ReferenceManagerWidget: React.FC<{ isSplit?: boolean }> = ({ isSplit = false }) => {
  const activeProject = useProjectStore(selectActiveProject);
  const bound = useReferenceStore((s) => s.bound);
  const pins = useReferenceStore((s) => s.pins);
  const checkedPinIds = useReferenceStore((s) => s.checkedPinIds);
  const focusedPin = useReferenceStore((s) => s.focusedPin);
  const activeRefId = useReferenceStore((s) => s.activeRefId);
  const loading = useReferenceStore((s) => s.loading);
  const storeError = useReferenceStore((s) => s.error);
  const store = useReferenceStore.getState;

  const setRefPlacement = useWorkspaceLayoutStore((s) => s.setRefPlacement);
  const setRefSplitCollapsed = useWorkspaceLayoutStore((s) => s.setRefSplitCollapsed);
  const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);
  const viewerOpen = useWorkspaceLayoutStore((s) => s.refViewerOpen);
  const setViewerOpen = useWorkspaceLayoutStore((s) => s.setRefViewerOpen);
  const closeAllReferences = useWorkspaceSessionStore((s) => s.closeAllReferences);

  const [listExpanded, setListExpanded] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const current = bound.find((b) => b.refId === activeRefId) ?? bound[0] ?? null;
  const currentNumber = current ? bound.indexOf(current) + 1 : 0;
  const totalPins = useMemo(() => bound.reduce((acc, b) => acc + (pins[b.refId]?.length ?? 0), 0), [bound, pins]);

  const openViewer = (refId: string) => {
    store().setActiveRefId(refId);
    setViewerOpen(true);
  };

  const attachChecked = () => {
    const checked = new Set(checkedPinIds);
    const refs = bound.flatMap((b) =>
      (pins[b.refId] ?? [])
        .filter((p) => checked.has(p.pinId))
        .map((p) =>
          p.kind === "region" && p.bbox && p.page
            ? referenceRegionRef(b.refId, { page: p.page, box: p.bbox, text: p.text || p.label })
            : referenceTextRef(b.refId, p.text || p.label)
        )
    );
    if (refs.length) attachToComposer(refs);
  };

  return (
    <div data-testid="reference-manager-widget" className="flex-1 flex flex-col h-full bg-white select-none overflow-hidden min-h-0 relative">
      <header className="px-3 py-2 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          {!isSplit ? (
            <button
              type="button"
              data-testid="ref-popout-btn"
              onClick={() => setRefPlacement("split")}
              className="p-1 rounded hover:bg-amber-100 text-slate-500 hover:text-amber-800 transition cursor-pointer"
              title="에디터 옆 독립 스플릿 뷰로 꺼내기"
            >
              <SquareSplitHorizontal className="w-3.5 h-3.5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                data-testid="ref-dockin-btn"
                onClick={() => setRefPlacement("left-tab")}
                className="p-1 rounded hover:bg-amber-100 text-slate-500 hover:text-amber-800 transition cursor-pointer"
                title="좌측 패널 탭으로 다시 넣기"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-testid="ref-collapse-rail-btn"
                onClick={() => setRefSplitCollapsed(true)}
                className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                title="세로 레일로 접기"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <span className="font-bold text-xs text-slate-800 tracking-tight flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Reference Manager
          </span>
          <span
            data-testid="reference-count-badge"
            className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold font-mono"
            title="이 프로젝트에 연결된 레퍼런스 및 핀 수"
          >
            {bound.length}종 참조{totalPins > 0 ? ` · 핀 ${totalPins}개` : ""}
          </span>
          {loading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
        </div>
        <div className="flex items-center gap-0.5 text-slate-500">
          <button
            type="button"
            data-testid="reference-add-btn"
            disabled={!activeProject}
            onClick={() => setAddOpen(!addOpen)}
            className={`p-1 rounded transition cursor-pointer ${addOpen ? "bg-amber-100 text-amber-900" : "hover:bg-slate-200 text-slate-600"}`}
            title="레퍼런스 추가 (파일 · 웹 주소 · 라이브러리)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setListExpanded(!listExpanded)}
            className="p-1 rounded hover:bg-slate-200 text-slate-500 cursor-pointer"
            title={listExpanded ? "목록 접기" : "목록 펼치기"}
          >
            {listExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              if (isSplit) {
                setRefPlacement("closed");
                closeAllReferences();
              } else {
                setLeftSidebarOpen(false);
              }
            }}
            className="p-1 rounded hover:bg-rose-100 hover:text-rose-600 text-slate-500 cursor-pointer"
            title={isSplit ? "스플릿 작업창 닫기" : "좌측 패널 닫기"}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {addOpen && <AddReferencePopover onClose={() => setAddOpen(false)} />}

      {storeError && (
        <div className="px-2.5 py-1 bg-rose-50 border-b border-rose-200 text-[10px] text-rose-700 truncate" title={storeError}>
          {storeError}
        </div>
      )}

      {checkedPinIds.length > 0 && (
        <div className="px-2.5 py-1 bg-amber-50 border-b border-amber-200 flex items-center justify-between text-xs font-semibold text-amber-950 shrink-0">
          <span className="text-[11px] font-mono text-amber-900">핀 {checkedPinIds.length}개 선택 (AI 는 이 핀만 본다)</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={attachChecked} className="p-1 bg-amber-600 hover:bg-amber-500 text-white rounded-xs cursor-pointer" title="선택한 핀을 AI Composer 에 첨부">
              <Sparkles className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => store().clearChecked()} className="p-1 hover:bg-amber-100 text-amber-700 rounded-xs cursor-pointer" title="선택 해제">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {listExpanded && (
        <div className={`border-b border-slate-200 bg-white p-1 overflow-y-auto shrink-0 text-xs ${viewerOpen ? "max-h-[190px]" : "flex-1 min-h-0"}`}>
          {bound.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 select-none">
              <BookOpen className="w-6 h-6 text-slate-300 stroke-[1.2] mb-1.5" />
              <span className="text-[11px] mb-2">연결된 레퍼런스가 없습니다</span>
              <button
                type="button"
                disabled={!activeProject}
                onClick={() => setAddOpen(true)}
                className="p-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white cursor-pointer disabled:opacity-40"
                title="레퍼런스 추가"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            bound.map((entry, idx) => {
              const { refId, item } = entry;
              const refPins = pins[refId] ?? EMPTY_PINS;
              const isSelected = viewerOpen && current?.refId === refId;
              const isOpen = expanded[refId] ?? refPins.length > 0;
              const badge = kindBadge(item);
              return (
                <div key={refId} className="flex flex-col group/node" data-testid={`reference-row-${idx + 1}`}>
                  <div
                    onClick={() => openViewer(refId)}
                    className={`py-1 px-1.5 flex items-center justify-between rounded hover:bg-slate-100 transition cursor-pointer ${
                      isSelected ? "bg-amber-100/60 font-semibold text-amber-950" : "text-slate-700"
                    } ${entry.enabled ? "" : "opacity-50"}`}
                    title="클릭하여 아래 뷰어에서 열기"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                      {refPins.length > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((prev) => ({ ...prev, [refId]: !isOpen }));
                          }}
                          className="p-0.5 rounded hover:bg-slate-200 text-slate-500 cursor-pointer shrink-0"
                        >
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <input
                        type="checkbox"
                        checked={entry.enabled}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => void store().setEnabled(refId, !entry.enabled)}
                        className="rounded-xs border-slate-300 text-amber-600 focus:ring-0 cursor-pointer w-3 h-3 shrink-0"
                        title={entry.enabled ? "AI 에 사용 중 (끄기)" : "AI 에 쓰지 않음 (켜기)"}
                      />
                      <BookOpen className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-amber-600" : "text-amber-500/80"}`} />
                      <span className="text-[11px] font-mono shrink-0 text-amber-800">참조 {idx + 1}</span>
                      <span className="text-xs truncate" title={item.title}>
                        {item.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.status === "failed" && <AlertTriangle className="w-3 h-3 text-amber-500" aria-label="가져오기 실패" />}
                      {refPins.length > 0 && (
                        <span className="text-[10px] font-mono px-1 rounded bg-amber-50 text-amber-800 font-bold">{refPins.length}</span>
                      )}
                      <span className={`text-[9px] font-mono px-1 rounded border uppercase font-medium ${badge.tone}`}>{badge.label}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void store().unbind(refId);
                        }}
                        className="p-0.5 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer opacity-0 group-hover/node:opacity-100"
                        title="이 프로젝트에서 연결 해제 (라이브러리에는 남는다)"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {isOpen && refPins.length > 0 && (
                    <div className="ml-6 pl-2.5 border-l border-slate-200 my-0.5 space-y-0.5">
                      {refPins.map((pin) => {
                        const checked = checkedPinIds.includes(pin.pinId);
                        const focused = focusedPin?.pinId === pin.pinId;
                        return (
                          <div
                            key={pin.pinId}
                            data-testid={`reference-pin-${pin.pinId}`}
                            onClick={() => {
                              openViewer(refId);
                              store().setFocusedPin(pin);
                              if (pin.kind === "region" && pin.bbox && pin.page) {
                                useReferenceRegionStore.getState().setFocus({ refId, page: pin.page, box: pin.bbox });
                              }
                            }}
                            className={`py-0.5 px-1.5 flex items-center justify-between rounded hover:bg-slate-100 transition cursor-pointer group/pin ${
                              focused ? "bg-amber-100 text-amber-950 font-semibold" : checked ? "bg-amber-50/60 text-slate-800" : "text-slate-600"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                              <input
                                type="checkbox"
                                checked={checked}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => store().toggleChecked(pin.pinId)}
                                className="rounded-xs border-slate-300 text-amber-600 focus:ring-0 cursor-pointer w-3 h-3 shrink-0"
                                title="체크한 핀만 AI 에 보낸다 (아무것도 체크하지 않으면 전부)"
                              />
                              {pin.kind === "text" ? (
                                <Type className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              ) : (
                                <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              )}
                              <span className="truncate text-xs">{pin.label}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <select
                                value={pin.layer}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => void store().updatePin(refId, pin.pinId, { layer: e.target.value })}
                                className="text-[10px] font-mono bg-transparent border border-slate-200 rounded px-0.5 cursor-pointer"
                                title="이 핀이 보여 주는 결정의 층위"
                              >
                                <option value="">층위</option>
                                {LAYER_IDS.map((id) => (
                                  <option key={id} value={id}>
                                    {id}
                                  </option>
                                ))}
                              </select>
                              <span className="text-[10px] font-mono text-slate-400">{pin.page ?? 1}p</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void store().removePin(refId, pin.pinId);
                                }}
                                className="p-0.5 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer opacity-0 group-hover/pin:opacity-100"
                                title="핀 삭제"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {!viewerOpen && (
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">뷰어가 닫혀 있습니다 (목록을 클릭하면 열립니다)</span>
          {current && (
            <button type="button" onClick={() => setViewerOpen(true)} className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold cursor-pointer">
              뷰어 열기
            </button>
          )}
        </div>
      )}

      {viewerOpen && bound.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 border-b border-slate-200 overflow-x-auto shrink-0">
          {bound.map((b, idx) => (
            <button
              key={b.refId}
              type="button"
              onClick={() => openViewer(b.refId)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] whitespace-nowrap cursor-pointer ${
                b.refId === current?.refId
                  ? "bg-amber-600 text-white font-bold"
                  : "bg-white text-slate-700 hover:bg-amber-50 hover:text-amber-800 border border-slate-200"
              }`}
            >
              <BookOpen className="w-3 h-3" />
              참조{idx + 1}: {b.item.title.slice(0, 14)}
              {b.item.title.length > 14 ? "…" : ""}
            </button>
          ))}
        </div>
      )}

      {viewerOpen && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-1.5 bg-slate-100/60">
          {current ? (
            <ReferenceCard key={current.refId} entry={current} number={currentNumber} onClose={() => setViewerOpen(false)} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <BookOpen className="w-8 h-8 mb-2 text-slate-300" />
              <p className="font-semibold text-slate-600">연결된 레퍼런스가 없습니다.</p>
              <p className="text-xs text-slate-400 mt-1">+ 버튼으로 남이 만든 완성물을 하나씩 추가하세요.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ReferenceSplitViewport: React.FC = () => {
  const refPlacement = useWorkspaceLayoutStore((s) => s.refPlacement);
  const openReferenceIds = useWorkspaceSessionStore((s) => s.openReferenceIds);
  const splitWidth = useWorkspaceLayoutStore((s) => s.referenceSplitWidth);
  const setSplitWidth = useWorkspaceLayoutStore((s) => s.setReferenceSplitWidth);
  const resetSplitWidth = useWorkspaceLayoutStore((s) => s.resetReferenceSplitWidth);
  const refSplitCollapsed = useWorkspaceLayoutStore((s) => s.refSplitCollapsed);
  const setRefSplitCollapsed = useWorkspaceLayoutStore((s) => s.setRefSplitCollapsed);
  const boundCount = useReferenceStore((s) => s.bound.length);

  const { onResizeStart } = useDragResize({ axis: "x", size: splitWidth, onResize: setSplitWidth });

  const isOpen = refPlacement === "split" || (refPlacement !== "left-tab" && openReferenceIds.length > 0);
  if (!isOpen) return null;

  if (refSplitCollapsed) {
    return (
      <CollapsedPanelRail
        side="left"
        label="Reference Manager"
        badgeCount={boundCount}
        tone="amber"
        onExpand={() => setRefSplitCollapsed(false)}
        testId="reference-split-collapsed-rail"
      />
    );
  }

  return (
    <aside
      data-testid="reference-bento-viewport-container"
      style={{ width: `${splitWidth}px` }}
      className="relative h-full bg-slate-100/90 border-r border-slate-300 flex flex-col overflow-hidden shrink-0 shadow-xs z-10 transition-[width] duration-75 select-text"
    >
      <div
        data-testid="reference-split-resize-handle"
        onMouseDown={onResizeStart}
        onDoubleClick={resetSplitWidth}
        title={`드래그하여 너비 조절 · 더블클릭 시 기본 너비(${REFERENCE_SPLIT_WIDTH.default}px)`}
        className="absolute -right-1 top-0 bottom-0 w-2 hover:w-3 cursor-col-resize hover:bg-amber-400/40 active:bg-amber-600/60 transition-all z-30"
      />
      <ReferenceManagerWidget isSplit={true} />
    </aside>
  );
};
