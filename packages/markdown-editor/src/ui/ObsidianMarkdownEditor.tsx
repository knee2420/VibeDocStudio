import React, { useEffect, useMemo, useRef, useState } from "react";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { foldGutter, foldKeymap } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { BookOpen, Code2, Crosshair, Eye, Plus, X } from "lucide-react";
import { stem, type VaultMetadataCache, type VaultPort } from "@vibe/vault-core";

import {
  parseFrontmatterDocument,
  removeFrontmatterProperty,
  toggleMarkdownCheckboxAtLine,
  upsertFrontmatterProperty,
  type FrontmatterValue,
} from "../core/frontmatter";
import {
  createObsidianLivePreviewExtension,
  type MarkdownHighlightTarget,
} from "../core/livePreview";
import { obsidianEditorTheme } from "../core/theme";
import { createObsidianCompletionExtension } from "../core/wikilinkCompletion";
import { PropertiesPanel } from "./PropertiesPanel";
import { ReadingView } from "./ReadingView";

export type MarkdownEditorMode = "live-preview" | "source" | "reading";

export interface MarkdownSelectionReport {
  readonly text: string;
  readonly lineRange: readonly [number, number];
}

export interface ObsidianMarkdownEditorProps {
  readonly vault: VaultPort;
  readonly path: string;
  readonly metadataCache?: VaultMetadataCache;
  readonly initialMode?: MarkdownEditorMode;
  readonly onOpenLink?: (target: string, mode: "current" | "new-tab") => void;
  readonly onOpenResource?: (rawResourceTag: string) => void;
  readonly highlightRequest?: MarkdownHighlightTarget | null;
  readonly onClearHighlight?: () => void;
  readonly onRenameSelf?: (newName: string) => { ok: boolean; error?: string };
  readonly onSelectionChange?: (selection: MarkdownSelectionReport | null) => void;
}

export const ObsidianMarkdownEditor: React.FC<ObsidianMarkdownEditorProps> = ({
  vault,
  path,
  metadataCache,
  initialMode = "live-preview",
  onOpenLink,
  onOpenResource,
  highlightRequest,
  onClearHighlight,
  onRenameSelf,
  onSelectionChange,
}) => {
  const [mode, setMode] = useState<MarkdownEditorMode>(initialMode);
  const [content, setContent] = useState<string>(() => {
    try {
      return vault.exists(path) ? vault.read(path) : "";
    } catch {
      return "";
    }
  });
  const [titleDraft, setTitleDraft] = useState<string>(() => stem(path));
  const [titleError, setTitleError] = useState<string | null>(null);
  const [showEmptyProperties, setShowEmptyProperties] = useState(false);

  const cmHostRef = useRef<HTMLDivElement>(null);
  const cmViewRef = useRef<EditorView | null>(null);
  const livePreviewCompartmentRef = useRef(new Compartment());
  const isLocalWriteRef = useRef(false);
  const openLinkRef = useRef(onOpenLink);
  const openResourceRef = useRef(onOpenResource);
  const selectionCbRef = useRef(onSelectionChange);

  useEffect(() => {
    openLinkRef.current = onOpenLink;
    openResourceRef.current = onOpenResource;
    selectionCbRef.current = onSelectionChange;
  }, [onOpenLink, onOpenResource, onSelectionChange]);

  // Keep title synced when path changes (e.g. external rename)
  useEffect(() => {
    setTitleDraft(stem(path));
    setTitleError(null);
  }, [path]);

  // Keep content synced with Vault (cross-split pane live updates!)
  useEffect(() => {
    const syncFromVault = () => {
      if (!vault.exists(path)) return;
      try {
        const next = vault.read(path);
        setContent(next);
        const view = cmViewRef.current;
        if (view && view.state.doc.toString() !== next) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: next },
          });
        }
      } catch {
        // Ignore transient read errors
      }
    };

    syncFromVault();
    return vault.subscribe((ev) => {
      if (isLocalWriteRef.current) return;
      if ((ev.type === "modify" && ev.path === path) || ev.type === "vault-reset") {
        syncFromVault();
      }
    });
  }, [vault, path]);

  const writeContent = (next: string) => {
    setContent(next);
    isLocalWriteRef.current = true;
    try {
      vault.write(path, next);
    } finally {
      isLocalWriteRef.current = false;
    }
  };

  const isReading = mode === "reading";
  const initialLivePreviewEnabledRef = useRef(mode === "live-preview");

  useEffect(() => {
    initialLivePreviewEnabledRef.current = mode === "live-preview";
  }, [mode]);

  // Mount / re-mount CodeMirror 6 when switching into editing modes or changing file
  useEffect(() => {
    if (isReading) {
      cmViewRef.current?.destroy();
      cmViewRef.current = null;
      return;
    }
    const host = cmHostRef.current;
    if (!host) return;

    const initialDoc = vault.exists(path) ? vault.read(path) : "";
    const lpCompartment = livePreviewCompartmentRef.current;

    const state = EditorState.create({
      doc: initialDoc,
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        drawSelection(),
        history(),
        closeBrackets(),
        foldGutter(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage }),
        obsidianEditorTheme,
        createObsidianCompletionExtension(vault, metadataCache),
        lpCompartment.of(
          createObsidianLivePreviewExtension({
            vault,
            currentPath: path,
            enabled: initialLivePreviewEnabledRef.current,
            onOpenLink: (target, openMode) => openLinkRef.current?.(target, openMode),
            onOpenResource: (raw) => openResourceRef.current?.(raw),
            highlight: highlightRequest,
          })
        ),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const nextDoc = update.state.doc.toString();
            setContent(nextDoc);
            isLocalWriteRef.current = true;
            try {
              vault.write(path, nextDoc);
            } finally {
              isLocalWriteRef.current = false;
            }
          }
          if (update.selectionSet && selectionCbRef.current) {
            const main = update.state.selection.main;
            if (main.empty) {
              selectionCbRef.current(null);
            } else {
              const selectedText = update.state.sliceDoc(main.from, main.to);
              const startLine = update.state.doc.lineAt(main.from).number;
              const endLine = update.state.doc.lineAt(main.to).number;
              selectionCbRef.current({
                text: selectedText,
                lineRange: [startLine, endLine],
              });
            }
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    cmViewRef.current = view;

    return () => {
      view.destroy();
      cmViewRef.current = null;
    };
  }, [vault, path, metadataCache, isReading]);

  // Live Preview <-> Source Mode & incoming resource highlight reconfigure
  useEffect(() => {
    const view = cmViewRef.current;
    if (!view || mode === "reading") return;
    view.dispatch({
      effects: livePreviewCompartmentRef.current.reconfigure(
        createObsidianLivePreviewExtension({
          vault,
          currentPath: path,
          enabled: mode === "live-preview",
          onOpenLink: (target, openMode) => openLinkRef.current?.(target, openMode),
          onOpenResource: (raw) => openResourceRef.current?.(raw),
          highlight: highlightRequest,
        })
      ),
    });

    if (highlightRequest) {
      let targetPos: number | null = null;
      if (highlightRequest.quoteText?.trim()) {
        const idx = view.state.doc
          .toString()
          .toLowerCase()
          .indexOf(highlightRequest.quoteText.trim().toLowerCase());
        if (idx >= 0) targetPos = idx;
      }
      if (targetPos === null && highlightRequest.lines && highlightRequest.lines[0] >= 1) {
        const safeLine = Math.max(1, Math.min(view.state.doc.lines, highlightRequest.lines[0]));
        targetPos = view.state.doc.line(safeLine).from;
      }
      if (targetPos !== null) {
        view.dispatch({
          effects: EditorView.scrollIntoView(targetPos, { y: "center" }),
        });
      }
    }
  }, [mode, vault, path, highlightRequest]);

  // Ctrl+E toggles Reading <-> Live Preview (Obsidian exact shortcut!)
  const handleContainerKeyDown = (ev: React.KeyboardEvent) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "e") {
      ev.preventDefault();
      setMode((cur) => (cur === "reading" ? "live-preview" : "reading"));
    }
  };

  const parsedFm = useMemo(() => parseFrontmatterDocument(content), [content]);

  const handleUpsertProperty = (key: string, value: FrontmatterValue) => {
    const next = upsertFrontmatterProperty(content, key, value);
    writeContent(next);
    const view = cmViewRef.current;
    if (view && view.state.doc.toString() !== next) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    }
  };

  const handleRemoveProperty = (key: string) => {
    const next = removeFrontmatterProperty(content, key);
    writeContent(next);
    const view = cmViewRef.current;
    if (view && view.state.doc.toString() !== next) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    }
  };

  const handleCommitInlineTitle = () => {
    const trimmed = titleDraft.trim();
    const currentStem = stem(path);
    if (!trimmed || trimmed === currentStem) {
      setTitleDraft(currentStem);
      setTitleError(null);
      return;
    }
    if (!onRenameSelf) return;
    const res = onRenameSelf(`${trimmed}.md`);
    if (!res.ok) {
      setTitleError(res.error ?? "Rename failed");
      setTitleDraft(currentStem);
    } else {
      setTitleError(null);
    }
  };

  const wordCount = useMemo(() => {
    const clean = parsedFm.body.trim();
    return clean ? clean.split(/\s+/).length : 0;
  }, [parsedFm.body]);

  return (
    <div
      onKeyDown={handleContainerKeyDown}
      className="flex h-full w-full flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)] text-[var(--obs-text-normal,#dadada)]"
    >
      {/* Mode Switcher Sub-bar (Live Preview / Source / Reading + Ctrl+E) */}
      <div className="flex h-8 shrink-0 select-none items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] px-6 text-[11px]">
        <div className="flex items-center gap-1">
          {(
            [
              { id: "live-preview", label: "Live Preview", Icon: Eye },
              { id: "source", label: "Source", Icon: Code2 },
              { id: "reading", label: "Reading", Icon: BookOpen },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 transition-colors"
                style={{
                  backgroundColor: active
                    ? "var(--obs-bg-selected,rgba(138,92,245,0.22))"
                    : "transparent",
                  color: active
                    ? "var(--obs-accent-hover,#a68af9)"
                    : "var(--obs-text-muted,#b3b3b3)",
                }}
              >
                <Icon className="h-3 w-3" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-[var(--obs-text-faint,#666666)]">
          {!parsedFm.hasFrontmatter && !showEmptyProperties && (
            <button
              type="button"
              onClick={() => setShowEmptyProperties(true)}
              className="flex items-center gap-0.5 hover:text-[var(--obs-text-normal,#dadada)]"
            >
              <Plus className="h-3 w-3" />
              <span>Add properties</span>
            </button>
          )}
          <span className="font-code">{wordCount} words</span>
          <span className="font-code opacity-75">Ctrl+E · CM6</span>
        </div>
      </div>

      {highlightRequest && (
        <div
          data-testid="md-resource-highlight-banner"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-6 py-1.5 text-[11.5px] text-amber-100"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Crosshair className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="font-semibold text-amber-200">
              {highlightRequest.lines
                ? highlightRequest.lines[0] === highlightRequest.lines[1]
                  ? `L${highlightRequest.lines[0]} 하이라이트`
                  : `L${highlightRequest.lines[0]}-L${highlightRequest.lines[1]} 하이라이트`
                : "리소스 인용 하이라이트"}
            </span>
            {highlightRequest.quoteText && (
              <span className="truncate text-amber-100/85">“{highlightRequest.quoteText}”</span>
            )}
          </div>
          {onClearHighlight && (
            <button
              type="button"
              onClick={onClearHighlight}
              className="shrink-0 rounded p-0.5 text-amber-200/80 hover:bg-amber-500/20 hover:text-white"
              title="하이라이트 해제"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Scrollable Obsidian Document Column */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto w-full max-w-3xl">
          {/* Obsidian Inline Title (H1 -> Vault Rename!) */}
          <div className="mb-3">
            <input
              type="text"
              value={titleDraft}
              onChange={(ev) => {
                setTitleDraft(ev.target.value);
                setTitleError(null);
              }}
              onBlur={handleCommitInlineTitle}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  ev.currentTarget.blur();
                } else if (ev.key === "Escape") {
                  setTitleDraft(stem(path));
                  setTitleError(null);
                  ev.currentTarget.blur();
                }
              }}
              aria-label="Document inline title"
              className="w-full bg-transparent text-[28px] font-bold tracking-tight text-[var(--obs-text-normal,#dadada)] outline-none"
            />
            {titleError && (
              <div className="mt-0.5 text-[11px] text-[var(--obs-danger,#fb464c)]">
                {titleError}
              </div>
            )}
          </div>

          {/* Obsidian YAML Frontmatter Properties Panel */}
          {(parsedFm.hasFrontmatter || showEmptyProperties) && (
            <PropertiesPanel
              properties={parsedFm.properties}
              onUpsert={handleUpsertProperty}
              onRemove={handleRemoveProperty}
            />
          )}

          {/* CodeMirror 6 Surface or Reading View */}
          {mode === "reading" ? (
            <ReadingView
              vault={vault}
              path={path}
              content={content}
              onToggleCheckbox={(lineNo) => {
                const next = toggleMarkdownCheckboxAtLine(content, lineNo);
                writeContent(next);
              }}
              onOpenLink={onOpenLink}
            />
          ) : (
            <div ref={cmHostRef} className="min-h-[420px] w-full" />
          )}
        </div>
      </div>
    </div>
  );
};
