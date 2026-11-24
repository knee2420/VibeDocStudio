import { RangeSetBuilder, type EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  extractFrontmatterBlock,
  parseWikilinkInner,
  resolveVaultLinkTarget,
  type VaultPort,
} from "@vibe/vault-core";

export interface MarkdownHighlightTarget {
  readonly id?: string;
  readonly lines?: readonly [number, number];
  readonly heading?: string;
  readonly quoteText?: string;
}

export interface LivePreviewOptions {
  readonly vault: VaultPort;
  readonly currentPath: string;
  readonly enabled: boolean;
  readonly onOpenLink?: (target: string, mode: "current" | "new-tab") => void;
  /** `<<resource: ...>>` 배지 클릭 시 호스트(페어 탭 하이라이트)로 전달한다. */
  readonly onOpenResource?: (rawResourceTag: string) => void;
  /** 외부 리소스 점프로 전달된 하이라이트 대상 (줄 범위 · 헤딩 · 인용 문구). */
  readonly highlight?: MarkdownHighlightTarget | null;
}

class ResourceTagChipWidget extends WidgetType {
  constructor(
    private readonly raw: string,
    private readonly label: string,
    private readonly onOpenResource?: (raw: string) => void
  ) {
    super();
  }

  eq(other: ResourceTagChipWidget): boolean {
    return other.raw === this.raw && other.label === this.label;
  }

  toDOM(): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cm-obs-resource-chip";
    btn.textContent = this.label;
    btn.title = `클릭 시 페어 탭으로 열고 하이라이트 · ${this.raw}`;
    btn.style.cssText =
      "display:inline-flex;align-items:center;gap:4px;padding:1px 8px;margin:0 2px;border-radius:6px;font-size:12px;line-height:1.45;color:#a5f3fc;background:rgba(6,182,212,0.16);border:1px solid rgba(34,211,238,0.44);cursor:pointer;vertical-align:baseline;font-family:inherit;";
    btn.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.onOpenResource?.(this.raw);
    });
    return btn;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function formatResourceChipLabel(rawTag: string): string {
  const inner = rawTag.replace(/^<<\s*resource\s*:\s*/i, "").replace(/\s*>>$/, "").trim();
  const pipeIdx = inner.indexOf("|");
  const addr = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).trim();
  const quote = pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : "";
  const isWeb = /^https?:\/\//i.test(addr);
  const wikiM = /\[\[([^[\]|]+)(?:\|[^[\]]+)?\]\]/.exec(addr);
  const rawTarget = wikiM ? wikiM[1].split("#")[0].trim() : addr.split(/\s+/)[0] ?? addr;
  let shortTarget = rawTarget;
  if (isWeb) {
    try {
      const u = new URL(rawTarget);
      shortTarget = u.hostname;
    } catch {
      shortTarget = rawTarget.slice(0, 28);
    }
  } else {
    shortTarget = rawTarget.replace(/^vault:\/\//i, "").split("/").pop() || rawTarget;
  }
  const icon = isWeb
    ? "🌐"
    : /\.pdf$/i.test(rawTarget)
      ? "📕"
      : /\.(png|jpe?g|gif|webp|svg)$/i.test(rawTarget)
        ? "🖼"
        : /\.csv$/i.test(rawTarget)
          ? "📊"
          : /\.ref$/i.test(rawTarget)
            ? "🗂"
            : /\.vdoc(\.json)?$/i.test(rawTarget)
              ? "📐"
              : /\.outline$/i.test(rawTarget)
                ? "🌿"
                : "📄";
  const pageM = /#p(\d+)\b/i.exec(addr);
  const lineM = /#L(\d+)(?:-L?(\d+))?\b/i.exec(addr);
  const bboxM = /[@#]bbox\(/i.exec(addr);
  const extra = [
    pageM ? `p.${pageM[1]}` : "",
    lineM ? (lineM[2] ? `L${lineM[1]}-L${lineM[2]}` : `L${lineM[1]}`) : "",
    bboxM ? "영역" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const head = `${icon} ${shortTarget}${extra ? ` · ${extra}` : ""}`;
  if (!quote) return head;
  const clipQuote = quote.length > 40 ? `${quote.slice(0, 39)}…` : quote;
  return `${head}  |  “${clipQuote}”`;
}

class CheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly bracketPos: number
  ) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.bracketPos === this.bracketPos;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-obs-checkbox-widget";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.style.accentColor = "var(--obs-accent, #8a5cf5)";
    input.style.cursor = "pointer";
    input.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const nextChar = this.checked ? " " : "x";
      view.dispatch({
        changes: {
          from: this.bracketPos + 1,
          to: this.bracketPos + 2,
          insert: nextChar,
        },
      });
    });

    wrapper.appendChild(input);
    return wrapper;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class HrWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const hr = document.createElement("hr");
    hr.className = "cm-obs-hr-widget";
    return hr;
  }
}

class EmbedPreviewWidget extends WidgetType {
  constructor(
    private readonly rawTarget: string,
    private readonly resolvedPath: string | null,
    private readonly previewLines: readonly string[],
    private readonly onOpenLink?: (target: string, mode: "current" | "new-tab") => void
  ) {
    super();
  }

  eq(other: EmbedPreviewWidget): boolean {
    return (
      other.rawTarget === this.rawTarget &&
      other.resolvedPath === this.resolvedPath &&
      other.previewLines.join("\n") === this.previewLines.join("\n")
    );
  }

  toDOM(): HTMLElement {
    const card = document.createElement("div");
    card.className = "cm-obs-embed-card";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.marginBottom = "6px";
    header.style.fontSize = "12px";
    header.style.fontWeight = "600";

    const title = document.createElement("span");
    title.textContent = this.resolvedPath ?? `${this.rawTarget} (not found)`;
    title.style.color = this.resolvedPath
      ? "var(--obs-accent-hover, #a68af9)"
      : "var(--obs-danger, #fb464c)";

    header.appendChild(title);

    if (this.resolvedPath && this.onOpenLink) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Open ↗";
      btn.style.fontSize = "11px";
      btn.style.color = "var(--obs-text-muted, #b3b3b3)";
      btn.style.cursor = "pointer";
      btn.style.background = "transparent";
      btn.style.border = "none";
      btn.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.onOpenLink?.(this.rawTarget, ev.ctrlKey || ev.metaKey ? "new-tab" : "current");
      });
      header.appendChild(btn);
    }

    card.appendChild(header);

    const body = document.createElement("div");
    body.style.color = "var(--obs-text-muted, #b3b3b3)";
    body.style.whiteSpace = "pre-wrap";
    body.style.lineHeight = "1.55";
    body.textContent =
      this.previewLines.length > 0
        ? this.previewLines.join("\n")
        : this.resolvedPath
          ? "(empty document)"
          : "Linked file does not exist in Vault.";
    card.appendChild(body);

    return card;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export function extractEmbedPreviewLines(vault: VaultPort, resolvedPath: string): string[] {
  try {
    const raw = vault.read(resolvedPath);
    if (resolvedPath.toLowerCase().endsWith(".outline")) {
      const parsed = JSON.parse(raw) as {
        rootNodes?: Array<{ text?: string; children?: Array<{ text?: string }> }>;
      };
      if (Array.isArray(parsed.rootNodes)) {
        const out: string[] = [];
        for (const root of parsed.rootNodes.slice(0, 4)) {
          if (root.text) out.push(`• ${root.text}`);
          for (const child of (root.children ?? []).slice(0, 3)) {
            if (child.text) out.push(`    • ${child.text}`);
          }
        }
        return out.slice(0, 8);
      }
    }
    const { bodyStartOffset } = extractFrontmatterBlock(raw);
    const body = raw.slice(bodyStartOffset).trim();
    return body
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function isLineTouchedBySelection(state: EditorState, lineFrom: number, lineTo: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= lineTo && range.to >= lineFrom) return true;
  }
  return false;
}

function isRangeTouchedBySelection(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
}

interface PendingDecoration {
  from: number;
  to: number;
  deco: Decoration;
}

function buildLivePreviewDecorations(
  view: EditorView,
  options: LivePreviewOptions
): DecorationSet {
  const { state } = view;
  const docText = state.doc.toString();
  const pending: PendingDecoration[] = [];

  // Incoming resource highlight (works in BOTH Live Preview and Source mode!)
  if (options.highlight) {
    const hl = options.highlight;
    let matchedStartLine: number | null = null;
    let matchedEndLine: number | null = null;
    if (hl.lines && hl.lines[0] >= 1) {
      matchedStartLine = Math.max(1, Math.min(state.doc.lines, hl.lines[0]));
      matchedEndLine = Math.max(
        matchedStartLine,
        Math.min(state.doc.lines, hl.lines[1] ?? hl.lines[0])
      );
    }
    if (hl.quoteText && hl.quoteText.trim().length > 0) {
      const needle = hl.quoteText.trim().toLowerCase();
      const idx = docText.toLowerCase().indexOf(needle);
      if (idx >= 0) {
        pending.push({
          from: idx,
          to: idx + needle.length,
          deco: Decoration.mark({
            attributes: {
              style:
                "background:rgba(251,191,36,0.34);color:#fef3c7;border-bottom:2px solid #fbbf24;border-radius:3px;padding:0 2px;",
            },
          }),
        });
        const hitLine = state.doc.lineAt(idx).number;
        if (matchedStartLine === null) {
          matchedStartLine = hitLine;
          matchedEndLine = state.doc.lineAt(idx + needle.length).number;
        }
      }
    }
    if (matchedStartLine !== null && matchedEndLine !== null) {
      for (let ln = matchedStartLine; ln <= matchedEndLine; ln += 1) {
        const lineObj = state.doc.line(ln);
        pending.push({
          from: lineObj.from,
          to: lineObj.from,
          deco: Decoration.line({
            attributes: {
              style:
                "background:rgba(245,158,11,0.14);box-shadow:inset 3px 0 0 #fbbf24;",
            },
          }),
        });
      }
    }
  }

  if (!options.enabled) {
    if (pending.length === 0) return Decoration.none;
    pending.sort((a, b) => a.from - b.from || a.to - b.to);
    const b = new RangeSetBuilder<Decoration>();
    for (const item of pending) {
      try {
        b.add(item.from, item.to, item.deco);
      } catch {
        // ignore
      }
    }
    return b.finish();
  }

  const { bodyStartLine } = extractFrontmatterBlock(docText);
  const hiddenMark = Decoration.replace({});

  let inFence = false;
  let activeCalloutTone: string | null = null;

  for (let lineNo = 1; lineNo <= state.doc.lines; lineNo += 1) {
    const line = state.doc.line(lineNo);
    const text = line.text;

    // Skip frontmatter lines in live preview (handled cleanly by PropertiesPanel or visible on edit)
    if (lineNo <= bodyStartLine) {
      pending.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ class: "cm-obs-codeblock-line" }),
      });
      continue;
    }

    if (/^\s*```/.test(text)) {
      inFence = !inFence;
      pending.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ class: "cm-obs-codeblock-line" }),
      });
      continue;
    }

    if (inFence) {
      pending.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ class: "cm-obs-codeblock-line" }),
      });
      continue;
    }

    const lineTouched = isLineTouchedBySelection(state, line.from, line.to);

    // 1. Horizontal Rule
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(text) && !lineTouched) {
      pending.push({
        from: line.from,
        to: line.to,
        deco: Decoration.replace({ widget: new HrWidget() }),
      });
      continue;
    }

    // 2. Obsidian Callout (> [!note] Title ...)
    const calloutStart = /^\s*>\s*\[!([a-zA-Z]+)\]([+-])?(?:\s+(.*))?$/.exec(text);
    if (calloutStart) {
      const kind = calloutStart[1].toLowerCase();
      activeCalloutTone =
        kind === "warning" || kind === "caution"
          ? "cm-obs-callout-warn"
          : kind === "tip" || kind === "success"
            ? "cm-obs-callout-tip"
            : kind === "danger" || kind === "bug"
              ? "cm-obs-callout-danger"
              : "";
      pending.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({
          class: `cm-obs-callout-line ${activeCalloutTone}`.trim(),
        }),
      });
      continue;
    }

    if (activeCalloutTone !== null) {
      if (/^\s*>/.test(text)) {
        pending.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({
            class: `cm-obs-callout-line ${activeCalloutTone}`.trim(),
          }),
        });
      } else {
        activeCalloutTone = null;
      }
    }

    // 3. Blockquote (non-callout)
    if (activeCalloutTone === null && /^\s*>\s?/.test(text)) {
      pending.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ class: "cm-obs-blockquote" }),
      });
      if (!lineTouched) {
        const quotePrefix = /^\s*>\s?/.exec(text);
        if (quotePrefix) {
          pending.push({
            from: line.from,
            to: line.from + quotePrefix[0].length,
            deco: hiddenMark,
          });
        }
      }
    }

    // 4. Headings (# .. ######)
    const headingMatch = /^(#{1,6})(\s+)/.exec(text);
    if (headingMatch) {
      const level = headingMatch[1].length;
      pending.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ class: `cm-obs-h${level}` }),
      });
      if (!lineTouched) {
        pending.push({
          from: line.from,
          to: line.from + headingMatch[0].length,
          deco: hiddenMark,
        });
      }
    }

    // 5. Task List Checkbox (- [ ] / - [x])
    const taskMatch = /^(\s*(?:[-*+]|\d+\.)\s+)(\[[ xX]\])(\s+)/.exec(text);
    if (taskMatch && !lineTouched) {
      const bracketStart = line.from + taskMatch[1].length;
      const bracketEnd = bracketStart + taskMatch[2].length;
      const checked = taskMatch[2].toLowerCase() === "[x]";
      pending.push({
        from: line.from,
        to: bracketEnd + taskMatch[3].length,
        deco: Decoration.replace({
          widget: new CheckboxWidget(checked, bracketStart),
        }),
      });
    }

    // 6. Standalone Transclusion Embed (![[target]])
    const embedSolo = /^\s*!\[\[([^\]\n]+)\]\]\s*$/.exec(text);
    if (embedSolo && !lineTouched) {
      const parsed = parseWikilinkInner(embedSolo[1]);
      const resolved = resolveVaultLinkTarget(options.vault, parsed.target, options.currentPath);
      const previewLines = resolved ? extractEmbedPreviewLines(options.vault, resolved) : [];
      pending.push({
        from: line.from,
        to: line.to,
        deco: Decoration.replace({
          widget: new EmbedPreviewWidget(
            parsed.target,
            resolved,
            previewLines,
            options.onOpenLink
          ),
        }),
      });
      continue;
    }

    // 7. Inline patterns (only hide delimiters when cursor is NOT inside that span)
    // Inline code
    const codeRe = /`([^`\n]+)`/g;
    let m: RegExpExecArray | null;
    while ((m = codeRe.exec(text)) !== null) {
      const start = line.from + m.index;
      const end = start + m[0].length;
      pending.push({
        from: start,
        to: end,
        deco: Decoration.mark({ class: "cm-obs-inline-code" }),
      });
      if (!isRangeTouchedBySelection(state, start, end)) {
        pending.push({ from: start, to: start + 1, deco: hiddenMark });
        pending.push({ from: end - 1, to: end, deco: hiddenMark });
      }
    }

    // Bold **text**
    const boldRe = /\*\*([^*\n]+)\*\*/g;
    while ((m = boldRe.exec(text)) !== null) {
      const start = line.from + m.index;
      const end = start + m[0].length;
      pending.push({
        from: start,
        to: end,
        deco: Decoration.mark({ class: "cm-obs-bold" }),
      });
      if (!isRangeTouchedBySelection(state, start, end)) {
        pending.push({ from: start, to: start + 2, deco: hiddenMark });
        pending.push({ from: end - 2, to: end, deco: hiddenMark });
      }
    }

    // Strikethrough ~~text~~
    const strikeRe = /~~([^~\n]+)~~/g;
    while ((m = strikeRe.exec(text)) !== null) {
      const start = line.from + m.index;
      const end = start + m[0].length;
      pending.push({
        from: start,
        to: end,
        deco: Decoration.mark({ class: "cm-obs-strike" }),
      });
      if (!isRangeTouchedBySelection(state, start, end)) {
        pending.push({ from: start, to: start + 2, deco: hiddenMark });
        pending.push({ from: end - 2, to: end, deco: hiddenMark });
      }
    }

    // Highlight ==text==
    const markRe = /==([^=\n]+)==/g;
    while ((m = markRe.exec(text)) !== null) {
      const start = line.from + m.index;
      const end = start + m[0].length;
      pending.push({
        from: start,
        to: end,
        deco: Decoration.mark({ class: "cm-obs-highlight" }),
      });
      if (!isRangeTouchedBySelection(state, start, end)) {
        pending.push({ from: start, to: start + 2, deco: hiddenMark });
        pending.push({ from: end - 2, to: end, deco: hiddenMark });
      }
    }

    // Unified Resource tags <<resource: target [anchor] | quote>>
    const resourceRanges: Array<{ from: number; to: number }> = [];
    const resourceRe = /<<\s*resource\s*:[^>\n]+\s*>>/gi;
    while ((m = resourceRe.exec(text)) !== null) {
      const start = line.from + m.index;
      const end = start + m[0].length;
      resourceRanges.push({ from: start, to: end });
      if (!isRangeTouchedBySelection(state, start, end)) {
        pending.push({
          from: start,
          to: end,
          deco: Decoration.replace({
            widget: new ResourceTagChipWidget(
              m[0],
              formatResourceChipLabel(m[0]),
              options.onOpenResource
            ),
          }),
        });
      } else {
        pending.push({
          from: start,
          to: end,
          deco: Decoration.mark({
            attributes: {
              style: "color:#67e8f9;background:rgba(6,182,212,0.14);border-radius:3px;",
            },
          }),
        });
      }
    }

    // Wikilinks [[target]] or [[target|alias]] (skip links already inside a collapsed <<resource:...>> tag)
    const wikiRe = /(?<!!)\[\[([^\]\n]+)\]\]/g;
    while ((m = wikiRe.exec(text)) !== null) {
      const start = line.from + m.index;
      const end = start + m[0].length;
      if (resourceRanges.some((r) => start >= r.from && end <= r.to)) continue;
      const inner = m[1];
      const parsed = parseWikilinkInner(inner);
      const pipeIdx = inner.indexOf("|");

      pending.push({
        from: start,
        to: end,
        deco: Decoration.mark({
          class: "cm-obs-wikilink",
          attributes: { "data-wikilink": parsed.target },
        }),
      });
      if (!isRangeTouchedBySelection(state, start, end)) {
        if (pipeIdx !== -1) {
          // Hide `[[target|` and trailing `]]` so only alias is shown
          pending.push({ from: start, to: start + 2 + pipeIdx + 1, deco: hiddenMark });
        } else {
          pending.push({ from: start, to: start + 2, deco: hiddenMark });
        }
        pending.push({ from: end - 2, to: end, deco: hiddenMark });
      }
    }

    // Tags #tag
    const tagRe = /(?:^|[\s(])(#([a-zA-Z0-9_\-/\uAC00-\uD7A3]+))/g;
    while ((m = tagRe.exec(text)) !== null) {
      const hashOffset = m[0].indexOf("#");
      const start = line.from + m.index + hashOffset;
      const end = start + m[1].length;
      pending.push({
        from: start,
        to: end,
        deco: Decoration.mark({ class: "cm-obs-tag" }),
      });
    }
  }

  // RangeSetBuilder requires strictly sorted ranges (from asc, then to asc, line decos before marks)
  pending.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const item of pending) {
    try {
      builder.add(item.from, item.to, item.deco);
    } catch {
      // Skip overlapping replace edge-cases gracefully
    }
  }
  return builder.finish();
}

export function createObsidianLivePreviewExtension(options: LivePreviewOptions): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildLivePreviewDecorations(view, options);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildLivePreviewDecorations(update.view, options);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );

  const clickHandler = EditorView.domEventHandlers({
    mousedown(ev) {
      const target = ev.target as HTMLElement | null;
      const wikiEl = target?.closest<HTMLElement>("[data-wikilink]");
      if (!wikiEl || !options.onOpenLink) return false;
      const linkTarget = wikiEl.getAttribute("data-wikilink");
      if (!linkTarget) return false;
      // Click in Live Preview opens link directly (or Ctrl/Cmd+Click in new tab)
      if (options.enabled || ev.ctrlKey || ev.metaKey) {
        ev.preventDefault();
        options.onOpenLink(linkTarget, ev.ctrlKey || ev.metaKey ? "new-tab" : "current");
        return true;
      }
      return false;
    },
  });

  return [plugin, clickHandler];
}
