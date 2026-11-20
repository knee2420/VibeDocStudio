import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const obsidianHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.65em", fontWeight: "700", color: "var(--obs-text-normal,#dadada)" },
  { tag: t.heading2, fontSize: "1.38em", fontWeight: "700", color: "var(--obs-text-normal,#dadada)" },
  { tag: t.heading3, fontSize: "1.18em", fontWeight: "600", color: "var(--obs-text-normal,#dadada)" },
  { tag: [t.heading4, t.heading5, t.heading6], fontSize: "1.05em", fontWeight: "600", color: "var(--obs-text-normal,#dadada)" },
  { tag: t.strong, fontWeight: "700", color: "var(--obs-text-normal,#dadada)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--obs-text-muted,#b3b3b3)" },
  { tag: [t.link, t.url], color: "var(--obs-accent-hover,#a68af9)", textDecoration: "underline" },
  { tag: [t.monospace, t.atom], fontFamily: "var(--pg-font-mono, ui-monospace, monospace)", color: "#e89b6c" },
  { tag: t.quote, color: "var(--obs-text-muted,#b3b3b3)", fontStyle: "italic" },
  { tag: [t.meta, t.processingInstruction, t.punctuation], color: "var(--obs-text-faint,#666666)" },
  { tag: t.keyword, color: "#c678dd" },
  { tag: t.string, color: "#98c379" },
  { tag: t.number, color: "#d19a66" },
  { tag: t.comment, color: "var(--obs-text-faint,#666666)", fontStyle: "italic" },
]);

export const obsidianEditorTheme: Extension = [
  syntaxHighlighting(obsidianHighlightStyle),
  EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      color: "var(--obs-text-normal, #dadada)",
      fontSize: "15px",
      lineHeight: "1.7",
      fontFamily: "var(--pg-font-sans, system-ui, sans-serif)",
      height: "100%",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      lineHeight: "1.7",
      overflow: "auto",
    },
    ".cm-content": {
      caretColor: "var(--obs-accent, #8a5cf5)",
      padding: "4px 0 96px 0",
    },
    ".cm-line": {
      padding: "1px 2px",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--obs-accent, #8a5cf5)",
      borderLeftWidth: "2px",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--obs-bg-selected, rgba(138, 92, 245, 0.25))",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      borderRight: "none",
      color: "var(--obs-text-faint, #666666)",
      minWidth: "20px",
    },
    ".cm-foldGutter .cm-gutterElement": {
      padding: "0 4px",
      cursor: "pointer",
      opacity: "0.45",
      transition: "opacity 120ms",
    },
    ".cm-foldGutter .cm-gutterElement:hover": {
      opacity: "1",
      color: "var(--obs-text-normal, #dadada)",
    },
    ".cm-panels": {
      backgroundColor: "var(--obs-bg-secondary, #262626)",
      color: "var(--obs-text-normal, #dadada)",
      borderColor: "var(--obs-border, #363636)",
    },
    ".cm-tooltip": {
      border: "1px solid var(--obs-border, #363636)",
      backgroundColor: "var(--obs-bg-primary, #1e1e1e)",
      color: "var(--obs-text-normal, #dadada)",
      borderRadius: "6px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete > ul > li": {
      padding: "5px 10px",
      fontSize: "12.5px",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--obs-bg-selected, rgba(138, 92, 245, 0.24))",
      color: "var(--obs-text-normal, #dadada)",
    },
    /* Live Preview Obsidian Decorations */
    ".cm-obs-h1": {
      fontSize: "1.65em",
      fontWeight: "700",
      lineHeight: "1.35",
      paddingTop: "8px",
      paddingBottom: "4px",
    },
    ".cm-obs-h2": {
      fontSize: "1.38em",
      fontWeight: "700",
      lineHeight: "1.4",
      paddingTop: "6px",
      paddingBottom: "2px",
      borderBottom: "1px solid var(--obs-border-subtle, #2d2d2d)",
    },
    ".cm-obs-h3": {
      fontSize: "1.18em",
      fontWeight: "600",
      lineHeight: "1.45",
      paddingTop: "4px",
    },
    ".cm-obs-h4, .cm-obs-h5, .cm-obs-h6": {
      fontSize: "1.05em",
      fontWeight: "600",
    },
    ".cm-obs-bold": {
      fontWeight: "700",
    },
    ".cm-obs-italic": {
      fontStyle: "italic",
    },
    ".cm-obs-strike": {
      textDecoration: "line-through",
      opacity: "0.7",
    },
    ".cm-obs-highlight": {
      backgroundColor: "rgba(255, 208, 0, 0.28)",
      borderRadius: "2px",
      padding: "0 2px",
    },
    ".cm-obs-inline-code": {
      fontFamily: "var(--pg-font-mono, ui-monospace, monospace)",
      fontSize: "0.87em",
      backgroundColor: "var(--obs-bg-hover, rgba(255,255,255,0.08))",
      borderRadius: "4px",
      padding: "1px 5px",
      color: "#e89b6c",
    },
    ".cm-obs-wikilink": {
      color: "var(--obs-accent-hover, #a68af9)",
      textDecoration: "underline",
      textDecorationColor: "rgba(138, 92, 245, 0.45)",
      textUnderlineOffset: "3px",
      cursor: "pointer",
    },
    ".cm-obs-wikilink:hover": {
      textDecorationColor: "var(--obs-accent, #8a5cf5)",
    },
    ".cm-obs-tag": {
      display: "inline-block",
      borderRadius: "999px",
      backgroundColor: "rgba(138, 92, 245, 0.16)",
      color: "var(--obs-accent-hover, #a68af9)",
      padding: "0 7px",
      fontSize: "0.86em",
      lineHeight: "1.5",
    },
    ".cm-obs-blockquote": {
      borderLeft: "2px solid var(--obs-accent, #8a5cf5)",
      paddingLeft: "12px",
      color: "var(--obs-text-muted, #b3b3b3)",
    },
    ".cm-obs-codeblock-line": {
      backgroundColor: "var(--obs-bg-primary-alt, #242424)",
      fontFamily: "var(--pg-font-mono, ui-monospace, monospace)",
      fontSize: "0.88em",
      paddingLeft: "12px",
      paddingRight: "12px",
    },
    ".cm-obs-callout-line": {
      borderLeft: "3px solid var(--obs-accent, #8a5cf5)",
      backgroundColor: "rgba(138, 92, 245, 0.08)",
      paddingLeft: "12px",
      paddingRight: "10px",
    },
    ".cm-obs-callout-warn": {
      borderLeftColor: "#e9973f",
      backgroundColor: "rgba(233, 151, 63, 0.10)",
    },
    ".cm-obs-callout-tip": {
      borderLeftColor: "#3fb950",
      backgroundColor: "rgba(63, 185, 80, 0.10)",
    },
    ".cm-obs-callout-danger": {
      borderLeftColor: "#fb464c",
      backgroundColor: "rgba(251, 70, 76, 0.10)",
    },
    ".cm-obs-checkbox-widget": {
      display: "inline-flex",
      alignItems: "center",
      verticalAlign: "middle",
      marginRight: "6px",
      cursor: "pointer",
    },
    ".cm-obs-hr-widget": {
      display: "block",
      border: "none",
      borderTop: "1px solid var(--obs-border, #363636)",
      margin: "10px 0",
    },
    ".cm-obs-embed-card": {
      margin: "6px 0",
      borderRadius: "6px",
      border: "1px solid var(--obs-border, #363636)",
      borderLeft: "3px solid var(--obs-accent, #8a5cf5)",
      backgroundColor: "var(--obs-bg-primary-alt, #242424)",
      padding: "10px 12px",
      fontSize: "13px",
    },
  }),
];
