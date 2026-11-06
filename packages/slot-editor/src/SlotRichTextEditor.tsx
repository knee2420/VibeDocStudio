import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { createDocument, getHTMLFromFragment, getSchema, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
// import FontFamily from "@tiptap/extension-font-family";
import Link from "@tiptap/extension-link";
import { Check, ClipboardCopy, FileText, Languages, MessageSquareShare, MessageSquareText, MoreHorizontal, SpellCheck, Wand2, X } from "lucide-react";

import { VariableChipNode, StampChipNode } from "./variable-node";
import { CitationNode, handleCitationPointer } from "./citation-node";
import { BlockStyle, FontFamily, FontSize, FontWeight, LetterSpacing, LineHeight, Indent, InlineMargin } from "./format-extensions";
import { normalizeLegacyHtml } from "./legacy-html";
import { useActiveSlotEditorStore } from "./active-editor-store";
import { ensureEditorBaseStyles } from "./editor-base-style";

/** Actions of the floating bar shown over a text selection (yesform `AI 제안 · 요약 · 번역 · 문법 수정 · 톤 수정`). */
export type SlotAiAction = "expand" | "summarize" | "translate" | "grammar" | "tone" | "attach";

export const SLOT_AI_ACTIONS: { action: SlotAiAction; label: string; title: string; icon: React.ReactNode }[] = [
  { action: "summarize", label: "요약", title: "텍스트를 간결하게 요약", icon: <FileText className="w-3.5 h-3.5" /> },
  { action: "translate", label: "번역", title: "영어로 번역", icon: <Languages className="w-3.5 h-3.5" /> },
  { action: "grammar", label: "문법 수정", title: "문법과 맞춤법 수정", icon: <SpellCheck className="w-3.5 h-3.5" /> },
  { action: "tone", label: "톤 수정", title: "더 자연스럽고 전문적인 어투로 수정", icon: <MessageSquareText className="w-3.5 h-3.5" /> },
];

export interface SlotRichTextEditorProps {
  slotId: string;
  content: string;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  onSelectSlot?: (slotId: string) => void;
  onChangeContent?: (slotId: string, html: string) => void;
  onAiAction?: (slotId: string, action: SlotAiAction, selectedText: string) => void;
}

interface BubbleState {
  right: number;
  top: number;
  text: string;
}

/** 슬롯 편집기 확장 목록 (정적 렌더와 실제 편집기가 같은 스키마를 쓰도록 한 곳에서 만든다). */
function buildSlotExtensions(placeholder: string): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      dropcursor: { color: "#3b82f6", width: 2 },
      history: { depth: 20, newGroupDelay: 500 },
    }),
    Underline,
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
    Placeholder.configure({ placeholder }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    FontFamily,
    FontSize,
    FontWeight,
    LetterSpacing,
    InlineMargin,
    LineHeight,
    Indent,
    BlockStyle,
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } }),
    VariableChipNode,
    StampChipNode,
    CitationNode,
  ];
}

/** 편집기 루트에 붙는 클래스 (정적 렌더도 같은 클래스를 써서 레이아웃이 같다). */
const EDITOR_CLASS = "vdoc-tiptap-slot focus:outline-none min-h-[1.25rem]";

let staticSchema: ReturnType<typeof getSchema> | null = null;
const staticHtmlCache = new Map<string, string>();

/**
 * 편집기가 그릴 DOM 과 같은 HTML. 편집기와 같은 스키마로 파싱 · 직렬화하고(`editor.getHTML()` 과 동일),
 * ProseMirror 가 화면에 덧붙이는 빈 줄 높이용 `<br class="ProseMirror-trailingBreak">` 를 흉내 낸다
 * (빈 문단 · 줄바꿈으로 끝나는 문단). 노드뷰가 없는 확장만 쓰므로 나머지 DOM 은 그대로 같다.
 */
export function renderStaticSlotHtml(content: string): string {
  const cached = staticHtmlCache.get(content);
  if (cached !== undefined) return cached;
  staticSchema ??= getSchema(buildSlotExtensions(""));
  let html: string;
  try {
    const doc = createDocument(normalizeLegacyHtml(content), staticSchema);
    html = getHTMLFromFragment(doc.content, staticSchema)
      .replace(/<(p|h[1-6])(\s[^>]*)?><\/\1>/g, '<$1$2><br class="ProseMirror-trailingBreak"></$1>')
      .replace(/<br><\/(p|h[1-6])>/g, '<br><br class="ProseMirror-trailingBreak"></$1>');
  } catch {
    html = normalizeLegacyHtml(content);
  }
  if (staticHtmlCache.size > 4000) staticHtmlCache.clear();
  staticHtmlCache.set(content, html);
  return html;
}

/** 타이핑을 문서에 반영하기까지 기다리는 시간. 그 사이 입력은 편집기 안에만 있다. */
const COMMIT_DELAY_MS = 300;

/**
 * Isolated rich-text editor mounted inside each `slotId` (WYSIWYG inside WYSIWYM).
 * Carries the yesform formatting set (font, pt size, color, highlight, link, line height, indent).
 *
 * 성능: 글자마다 `onChangeContent` 를 부르면 문서 스토어가 매번 바뀌어 캔버스 · 아웃라인 · 툴바 ·
 * Composer 가 키 입력마다 다시 그려졌다. 그래서 입력이 잠깐 멈출 때(`COMMIT_DELAY_MS`), 포커스가
 * 빠질 때, 언마운트될 때 한 번에 반영한다. 컴포넌트는 메모되어 같은 페이지의 다른 슬롯이 바뀌어도
 * 다시 그려지지 않는다 (콜백은 호출하는 쪽에서 고정 참조로 넘긴다).
 */
interface LiveSlotEditorProps extends SlotRichTextEditorProps {
  /** 정적 화면을 누른 위치(화면 좌표) 또는 끝 — 편집기를 띄우자마자 그 자리에 캐럿을 둔다. */
  initialFocus: { x: number; y: number } | "end" | null;
}

const LiveSlotEditor: React.FC<LiveSlotEditorProps> = ({
  slotId,
  content,
  readOnly = false,
  placeholder = "",
  className = "",
  onSelectSlot,
  onChangeContent,
  onAiAction,
  initialFocus,
}) => {
  const setActiveSlotEditor = useActiveSlotEditorStore((s) => s.setActiveSlotEditor);
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [level, setLevel] = useState<"icon" | "menu">("icon");
  const [copied, setCopied] = useState<boolean>(false);
  const commitTimer = useRef<number | null>(null);
  const onChangeRef = useRef(onChangeContent);
  onChangeRef.current = onChangeContent;

  /** 미뤄 둔 입력을 지금 문서에 반영한다. */
  const flushRef = useRef<() => void>(() => undefined);

  const editor = useEditor({
    extensions: buildSlotExtensions(placeholder),
    content: normalizeLegacyHtml(content),
    editable: !readOnly,
    editorProps: {
      attributes: {
        spellcheck: "false",
        class: EDITOR_CLASS,
      },
    },
    onFocus: ({ editor: ed }) => {
      setActiveSlotEditor(slotId, ed);
      onSelectSlot?.(slotId);
    },
    onUpdate: ({ editor: ed }) => {
      if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
      flushRef.current = () => {
        if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
        commitTimer.current = null;
        flushRef.current = () => undefined;
        onChangeRef.current?.(slotId, ed.getHTML());
      };
      commitTimer.current = window.setTimeout(() => flushRef.current(), COMMIT_DELAY_MS);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to, empty } = ed.state.selection;
      if (empty || !ed.isEditable || !onAiAction) {
        setBubble(null);
        setLevel("icon");
        return;
      }
      const end = ed.view.coordsAtPos(to);
      const start = ed.view.coordsAtPos(from);
      const targetRight = Math.max(start.right, end.right);
      const targetTop = Math.min(start.top, end.top);
      const anchorRight = Math.min(window.innerWidth - 8, targetRight + 8);
      const right = Math.max(8, window.innerWidth - anchorRight);
      const top = Math.max(8, targetTop - 26);
      setBubble({ right, top, text: ed.state.doc.textBetween(from, to, " ") });
      setLevel("icon");
    },
    onBlur: () => {
      flushRef.current();
      // Let a click on the bubble land before it disappears.
      window.setTimeout(() => setBubble(null), 150);
    },
  });

  // 언마운트(정적 화면으로 돌아감 · 페이지 창 이동 · 문서 전환) 전에 미뤄 둔 입력을 반영한다.
  useEffect(() => () => flushRef.current(), []);

  // 정적 화면을 눌러 띄운 경우: 누른 자리에 캐럿을 둔다.
  // 편집기 인스턴스 기준으로 한 번만 준다 — 개발 모드 StrictMode 는 편집기를 한 번 파괴하고 다시
  // 만들기 때문에, 첫 인스턴스에만 포커스를 주면 실제로 남는 편집기는 포커스를 받지 못한다.
  const focusedFor = useRef<typeof editor>(null);
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed || focusedFor.current === editor || !initialFocus) return;
    focusedFor.current = editor;
    const pos =
      initialFocus === "end" ? null : editor.view.posAtCoords({ left: initialFocus.x, top: initialFocus.y })?.pos;
    editor.commands.focus(pos ?? "end");
    // Tiptap 의 focus 는 다음 프레임(rAF)에 DOM 포커스를 준다. 정적 화면이 막 바뀐 지금 바로 줘야
    // Tab 이동 · 클릭 직후의 키 입력이 새 편집기로 들어간다 (rAF 가 멈춘 백그라운드 창에서도).
    editor.view.focus();
  }, [editor, initialFocus]);

  // 활성 편집기로 등록돼 있던 채로 내려가면 툴바가 죽은 편집기를 잡지 않게 비운다.
  useEffect(
    () => () => {
      const store = useActiveSlotEditorStore.getState();
      if (editor && store.activeEditor === editor) store.setActiveSlotEditor(null, null);
    },
    [editor]
  );

  useEffect(() => {
    if (!editor) return;
    // 편집 가능 여부만 바꾼다. 기본값(emitUpdate=true)은 내용이 그대로여도 onUpdate 를 쏴서,
    // 마운트만 해도 모든 슬롯이 "편집됨"으로 표시되고 문서 자동 저장이 돌았다.
    editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    const normalized = normalizeLegacyHtml(content);
    // 반영 대기 중인 입력이 있으면 편집기 쪽이 더 최신이다.
    if (commitTimer.current === null && !editor.isFocused && normalized !== editor.getHTML()) {
      editor.commands.setContent(normalized, false);
    }
  }, [content, editor]);

  useEffect(() => {
    if (!bubble) return;
    const hide = () => setBubble(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBubble(null);
      }
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [bubble]);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelectSlot?.(slotId);
        if (editor) setActiveSlotEditor(slotId, editor);
      }}
      className={`vdoc-slot-editor max-w-none focus:outline-none ${className}`}
    >
      <EditorContent editor={editor} />
      {bubble &&
        onAiAction &&
        createPortal(
          <div
            data-keep-table-selection
            onMouseDown={(e) => e.preventDefault()}
            style={{ right: bubble.right, top: bubble.top }}
            className="fixed z-[1000] select-none"
          >
            {level === "icon" ? (
              <button
                type="button"
                data-testid="slot-text-selection-toolbar-icon"
                onClick={() => setLevel("menu")}
                title={`선택 도구 · ${bubble.text.length}자\n클릭: 도구 열기`}
                className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-[#eaeaea] bg-white shadow-[0px_4px_12px_0px_rgba(47,44,44,0.12)] text-[#0472e3] hover:bg-[#eef5fd] cursor-pointer transition-transform hover:scale-105"
              >
                <MoreHorizontal className="w-4 h-4" />
                <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-[#0472e3] text-white text-[9.5px] font-bold leading-4 text-center shadow-xs">
                  1
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-1 rounded-lg border border-[#eaeaea] bg-white p-1 shadow-[0px_4px_12px_0px_rgba(47,44,44,0.15)] text-[12px] text-gray-800 whitespace-nowrap animate-in fade-in zoom-in-95 duration-100">
                <button
                  type="button"
                  title="더 상세하게 확장"
                  onClick={() => {
                    onAiAction(slotId, "expand", bubble.text);
                    setBubble(null);
                    setLevel("icon");
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-[#0472e3] px-2 text-[12px] font-semibold text-white hover:bg-[#0363c7] cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" /> AI 제안
                </button>
                {SLOT_AI_ACTIONS.map((a) => (
                  <button
                    key={a.action}
                    type="button"
                    title={a.title}
                    onClick={() => {
                      onAiAction(slotId, a.action, bubble.text);
                      setBubble(null);
                      setLevel("icon");
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-gray-800 hover:bg-neutral-100 cursor-pointer"
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
                <div className="w-[1px] h-4 bg-slate-200 mx-0.5" />
                <button
                  type="button"
                  title="Composer 에 첨부 (Ctrl+L)"
                  onClick={() => {
                    onAiAction(slotId, "attach", bubble.text);
                    setBubble(null);
                    setLevel("icon");
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-gray-800 hover:bg-neutral-100 cursor-pointer"
                >
                  <MessageSquareShare className="w-3.5 h-3.5 text-gray-500" /> Composer 에 첨부
                </button>
                <button
                  type="button"
                  title="복사 (Ctrl+C)"
                  onClick={() => {
                    void navigator.clipboard?.writeText(bubble.text);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-gray-800 hover:bg-neutral-100 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <ClipboardCopy className="w-3.5 h-3.5 text-gray-500" />}
                  {copied ? "복사됨" : "복사"}
                </button>
                <button
                  type="button"
                  title="도구 접기"
                  onClick={() => setLevel("icon")}
                  className="inline-flex h-7 w-6 items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-neutral-100 cursor-pointer ml-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

/**
 * 슬롯 본문. 평소에는 편집기와 같은 DOM 을 정적으로 그리고(`renderStaticSlotHtml`), 누르거나(포인터) ·
 * 포커스가 들어오면(Tab) 그때 Tiptap 편집기를 띄운다. 다른 슬롯이 활성 편집기가 되면 다시 정적 화면으로
 * 돌아간다 — 그래서 문서 크기와 상관없이 떠 있는 편집기는 한두 개다.
 *
 * 예전에는 슬롯마다 편집기(ProseMirror 뷰 · 플러그인 · 이력 · 리스너)가 상주해, 7쪽 문서에서 258개가
 * 떠 있었고 첫 표시 · 메모리 · 선택 변경 비용을 키웠다.
 */
const SlotRichTextEditorImpl: React.FC<SlotRichTextEditorProps> = (props) => {
  const { slotId, content, readOnly = false, className = "", onSelectSlot } = props;
  const [live, setLive] = useState<LiveSlotEditorProps["initialFocus"] | false>(false);

  // 다른 슬롯이 활성 편집기가 되면 정적 화면으로 돌아간다 (활성인 동안만 구독한다).
  useEffect(() => {
    if (live === false) return;
    return useActiveSlotEditorStore.subscribe((st) => {
      if (st.activeSlotId !== null && st.activeSlotId !== slotId) setLive(false);
    });
  }, [live, slotId]);

  // 인용 표식은 편집기를 띄우거나 캐럿을 옮기지 않고 원본 위치를 연다 (정적 · 편집 화면 공통)
  const onCitationPointer = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (handleCitationPointer(slotId, e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  if (live !== false)
    return (
      <div onPointerDownCapture={onCitationPointer}>
        <LiveSlotEditor {...props} initialFocus={live} />
      </div>
    );
  return (
    <div onPointerDownCapture={onCitationPointer}>
      <StaticSlotView
        slotId={slotId}
        content={content}
        editable={!readOnly}
        className={className}
        onSelectSlot={onSelectSlot}
        onActivate={setLive}
      />
    </div>
  );
};

interface StaticSlotViewProps {
  slotId: string;
  content: string;
  editable: boolean;
  className: string;
  onSelectSlot?: (slotId: string) => void;
  onActivate: (focus: { x: number; y: number } | "end") => void;
}

const StaticSlotView: React.FC<StaticSlotViewProps> = ({ slotId, content, editable, className, onSelectSlot, onActivate }) => {
  ensureEditorBaseStyles();
  const html = useMemo(() => renderStaticSlotHtml(content), [content]);
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelectSlot?.(slotId);
      }}
      className={`vdoc-slot-editor max-w-none focus:outline-none ${className}`}
    >
      <div>
        <div
          className={`tiptap ProseMirror ${EDITOR_CLASS}`}
          data-lazy-slot-editor=""
          spellCheck={false}
          translate="no"
          tabIndex={editable ? 0 : undefined}
          onMouseDown={(e) => {
            // 기본 동작(이 요소로 포커스)은 곧 사라질 정적 요소로 간다 — 캐럿은 편집기가 직접 둔다.
            if (editable && e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey) e.preventDefault();
          }}
          onPointerDown={(e) => {
            if (!editable || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
            onActivate({ x: e.clientX, y: e.clientY });
          }}
          onFocus={() => {
            if (editable) onActivate("end");
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
};

export const SlotRichTextEditor = React.memo(SlotRichTextEditorImpl);
SlotRichTextEditor.displayName = "SlotRichTextEditor";
