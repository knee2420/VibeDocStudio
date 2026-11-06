import { createStyleTag } from "@tiptap/core";

/**
 * Tiptap 이 첫 편집기를 만들 때 주입하는 기본 CSS (`@tiptap/core` 2.x 의 `style` 과 같은 내용).
 *
 * 슬롯은 평소 편집기 없이 정적으로 그리므로(`SlotRichTextEditor`), 편집기가 하나도 없을 때도
 * 줄바꿈 · 공백 처리(`white-space: pre-wrap`)가 편집기와 같아야 레이아웃이 어긋나지 않는다.
 * 같은 `data-tiptap-style` 태그를 쓰므로 나중에 편집기가 뜨면 이 태그를 그대로 재사용한다.
 */
const TIPTAP_BASE_CSS = `.ProseMirror {
  position: relative;
}

/* 인용 표식 (<sup data-cite="1">) — 번호는 CSS 가 그리고, 누르면 원본 위치가 열린다 */
sup[data-cite] {
  cursor: pointer;
  font-size: 0.7em;
  line-height: 0;
  vertical-align: super;
  color: #6d28d9;
  font-weight: 700;
  padding: 0 1px;
  border-radius: 3px;
  user-select: none;
}
sup[data-cite]::before {
  content: "[" attr(data-cite) "]";
}
sup[data-cite]:hover {
  background: #ede9fe;
}

.ProseMirror {
  word-wrap: break-word;
  white-space: pre-wrap;
  white-space: break-spaces;
  -webkit-font-variant-ligatures: none;
  font-variant-ligatures: none;
  font-feature-settings: "liga" 0; /* the above doesn't seem to work in Edge */
}

.ProseMirror [contenteditable="false"] {
  white-space: normal;
}

.ProseMirror [contenteditable="false"] [contenteditable="true"] {
  white-space: pre-wrap;
}

.ProseMirror pre {
  white-space: pre-wrap;
}

img.ProseMirror-separator {
  display: inline !important;
  border: none !important;
  margin: 0 !important;
  width: 0 !important;
  height: 0 !important;
}

.ProseMirror-gapcursor {
  display: none;
  pointer-events: none;
  position: absolute;
  margin: 0;
}

.ProseMirror-gapcursor:after {
  content: "";
  display: block;
  position: absolute;
  top: -2px;
  width: 20px;
  border-top: 1px solid black;
  animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
}

@keyframes ProseMirror-cursor-blink {
  to {
    visibility: hidden;
  }
}

.ProseMirror-hideselection *::selection {
  background: transparent;
}

.ProseMirror-hideselection *::-moz-selection {
  background: transparent;
}

.ProseMirror-hideselection * {
  caret-color: transparent;
}

.ProseMirror-focused .ProseMirror-gapcursor {
  display: block;
}

.tippy-box[data-animation=fade][data-state=hidden] {
  opacity: 0
}`;

let injected = false;

export function ensureEditorBaseStyles(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  createStyleTag(TIPTAP_BASE_CSS);
}
