import React, { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Lightbulb,
  OctagonAlert,
} from "lucide-react";
import {
  extractFrontmatterBlock,
  parseWikilinkInner,
  resolveVaultLinkTarget,
  type VaultPort,
} from "@vibe/vault-core";

import { extractEmbedPreviewLines } from "../core/livePreview";

export interface ReadingViewProps {
  readonly vault: VaultPort;
  readonly path: string;
  readonly content: string;
  readonly onToggleCheckbox: (lineNumber1Based: number) => void;
  readonly onOpenLink?: (target: string, mode: "current" | "new-tab") => void;
}

interface CalloutBlockProps {
  readonly kind: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly defaultCollapsed: boolean;
  readonly onOpenLink?: (target: string, mode: "current" | "new-tab") => void;
}

const CalloutBlock: React.FC<CalloutBlockProps> = ({
  kind,
  title,
  lines,
  defaultCollapsed,
  onOpenLink,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const lower = kind.toLowerCase();

  const accent =
    lower === "warning" || lower === "caution"
      ? { border: "#e9973f", bg: "rgba(233,151,63,0.10)", Icon: AlertTriangle }
      : lower === "tip" || lower === "success"
        ? { border: "#3fb950", bg: "rgba(63,185,80,0.10)", Icon: Lightbulb }
        : lower === "danger" || lower === "bug"
          ? { border: "#fb464c", bg: "rgba(251,70,76,0.10)", Icon: OctagonAlert }
          : { border: "var(--obs-accent,#8a5cf5)", bg: "rgba(138,92,245,0.10)", Icon: Info };

  const Icon = accent.Icon;

  return (
    <div
      className="my-3 rounded-md border-l-[3px] px-3.5 py-2.5 text-[14px]"
      style={{ borderLeftColor: accent.border, backgroundColor: accent.bg }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left font-semibold text-[var(--obs-text-normal,#dadada)]"
      >
        <Icon className="h-4 w-4 shrink-0" style={{ color: accent.border }} />
        <span className="flex-1">{title || kind.toUpperCase()}</span>
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 opacity-70" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        )}
      </button>
      {!collapsed && lines.length > 0 && (
        <div className="mt-1.5 space-y-1 text-[13.5px] leading-6 text-[var(--obs-text-muted,#b3b3b3)]">
          {lines.map((line, idx) => (
            <div key={idx}>{renderInlineNodes(line, onOpenLink)}</div>
          ))}
        </div>
      )}
    </div>
  );
};

const CodeFenceBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="group relative my-3 overflow-hidden rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary-alt,#242424)]">
      <div className="flex items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] px-3 py-1 font-code text-[11px] text-[var(--obs-text-faint,#666666)]">
        <span>{language || "text"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
        >
          {copied ? <Check className="h-3 w-3 text-[#3fb950]" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-code text-[12.5px] leading-6 text-[var(--obs-text-normal,#dadada)]">
        <code>{code}</code>
      </pre>
    </div>
  );
};

function renderInlineNodes(
  text: string,
  onOpenLink?: (target: string, mode: "current" | "new-tab") => void
): React.ReactNode {
  const tokenRe =
    /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|==[^=\n]+==|\[\[[^\]\n]+\]\]|#[a-zA-Z0-9_\-/\uAC00-\uD7A3]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let keySeq = 0;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    keySeq += 1;

    if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={keySeq}
          className="rounded bg-[var(--obs-bg-hover,rgba(255,255,255,0.08))] px-1.5 py-0.5 font-code text-[0.86em] text-[#e89b6c]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={keySeq} className="font-bold text-[var(--obs-text-normal,#dadada)]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      parts.push(
        <del key={keySeq} className="opacity-70">
          {token.slice(2, -2)}
        </del>
      );
    } else if (token.startsWith("==") && token.endsWith("==")) {
      parts.push(
        <mark key={keySeq} className="rounded bg-[rgba(255,208,0,0.28)] px-0.5 text-inherit">
          {token.slice(2, -2)}
        </mark>
      );
    } else if (token.startsWith("[[") && token.endsWith("]]")) {
      const parsed = parseWikilinkInner(token.slice(2, -2));
      const label = parsed.alias ?? parsed.target;
      parts.push(
        <button
          key={keySeq}
          type="button"
          onClick={(ev) =>
            onOpenLink?.(parsed.target, ev.ctrlKey || ev.metaKey ? "new-tab" : "current")
          }
          className="cursor-pointer text-[var(--obs-accent-hover,#a68af9)] underline decoration-[rgba(138,92,245,0.45)] underline-offset-2 hover:decoration-[var(--obs-accent,#8a5cf5)]"
        >
          {label}
        </button>
      );
    } else if (token.startsWith("#")) {
      parts.push(
        <span
          key={keySeq}
          className="inline-block rounded-full bg-[rgba(138,92,245,0.16)] px-2 py-0 text-[0.85em] text-[var(--obs-accent-hover,#a68af9)]"
        >
          {token}
        </span>
      );
    }

    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts;
}

export const ReadingView: React.FC<ReadingViewProps> = ({
  vault,
  path,
  content,
  onToggleCheckbox,
  onOpenLink,
}) => {
  const normalized = content.replace(/\r\n/g, "\n");
  const { bodyStartLine } = extractFrontmatterBlock(normalized);
  const allLines = normalized.split("\n");

  const blocks: React.ReactNode[] = [];
  let i = bodyStartLine;

  while (i < allLines.length) {
    const line = allLines[i];
    const lineNum1 = i + 1;

    // Fenced code block
    const fenceStart = /^\s*```([^\s`]*)/.exec(line);
    if (fenceStart) {
      const lang = fenceStart[1] ?? "";
      const codeLines: string[] = [];
      i += 1;
      while (i < allLines.length && !/^\s*```/.test(allLines[i])) {
        codeLines.push(allLines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push(<CodeFenceBlock key={`code-${lineNum1}`} language={lang} code={codeLines.join("\n")} />);
      continue;
    }

    // Obsidian Callout
    const calloutStart = /^\s*>\s*\[!([a-zA-Z]+)\]([+-])?(?:\s+(.*))?$/.exec(line);
    if (calloutStart) {
      const kind = calloutStart[1];
      const defaultCollapsed = calloutStart[2] === "-";
      const title = calloutStart[3]?.trim() ?? "";
      const bodyLines: string[] = [];
      i += 1;
      while (i < allLines.length && /^\s*>/.test(allLines[i])) {
        bodyLines.push(allLines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <CalloutBlock
          key={`callout-${lineNum1}`}
          kind={kind}
          title={title}
          lines={bodyLines}
          defaultCollapsed={defaultCollapsed}
          onOpenLink={onOpenLink}
        />
      );
      continue;
    }

    // Markdown table
    if (
      line.includes("|") &&
      i + 1 < allLines.length &&
      /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(allLines[i + 1])
    ) {
      const splitRow = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < allLines.length && allLines[i].includes("|") && allLines[i].trim() !== "") {
        rows.push(splitRow(allLines[i]));
        i += 1;
      }
      blocks.push(
        <div key={`tbl-${lineNum1}`} className="my-3 overflow-x-auto rounded-md border border-[var(--obs-border-subtle,#2d2d2d)]">
          <table className="w-full border-collapse text-left text-[13.5px]">
            <thead className="bg-[var(--obs-bg-primary-alt,#242424)]">
              <tr>
                {headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    className="border-b border-[var(--obs-border-subtle,#2d2d2d)] px-3 py-1.5 font-semibold text-[var(--obs-text-normal,#dadada)]"
                  >
                    {renderInlineNodes(h, onOpenLink)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rIdx) => (
                <tr key={rIdx} className="border-b border-[var(--obs-border-subtle,#2d2d2d)] last:border-b-0">
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-3 py-1.5 text-[var(--obs-text-muted,#b3b3b3)]">
                      {renderInlineNodes(r[cIdx] ?? "", onOpenLink)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Standalone embed ![[target]]
    const embedMatch = /^\s*!\[\[([^\]\n]+)\]\]\s*$/.exec(line);
    if (embedMatch) {
      const parsed = parseWikilinkInner(embedMatch[1]);
      const resolved = resolveVaultLinkTarget(vault, parsed.target, path);
      const previewLines = resolved ? extractEmbedPreviewLines(vault, resolved) : [];
      blocks.push(
        <div key={`embed-${lineNum1}`} className="cm-obs-embed-card my-3">
          <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold">
            <span className={resolved ? "text-[var(--obs-accent-hover,#a68af9)]" : "text-[var(--obs-danger,#fb464c)]"}>
              {resolved ?? `${parsed.target} (not found)`}
            </span>
            {resolved && onOpenLink && (
              <button
                type="button"
                onClick={(ev) =>
                  onOpenLink(parsed.target, ev.ctrlKey || ev.metaKey ? "new-tab" : "current")
                }
                className="text-[11px] font-normal text-[var(--obs-text-muted,#b3b3b3)] hover:text-[var(--obs-text-normal,#dadada)]"
              >
                Open ↗
              </button>
            )}
          </div>
          <div className="whitespace-pre-wrap text-[13px] leading-6 text-[var(--obs-text-muted,#b3b3b3)]">
            {previewLines.length > 0 ? previewLines.join("\n") : "(empty document)"}
          </div>
        </div>
      );
      i += 1;
      continue;
    }

    // Horizontal Rule
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${lineNum1}`} className="my-4 border-[var(--obs-border,#363636)]" />);
      i += 1;
      continue;
    }

    // Headings
    const hMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (hMatch) {
      const level = hMatch[1].length;
      const cls =
        level === 1
          ? "mt-4 mb-2 text-[24px] font-bold"
          : level === 2
            ? "mt-5 mb-2 border-b border-[var(--obs-border-subtle,#2d2d2d)] pb-1 text-[20px] font-bold"
            : level === 3
              ? "mt-4 mb-1.5 text-[17px] font-semibold"
              : "mt-3 mb-1 text-[15px] font-semibold";
      blocks.push(
        <div key={`h-${lineNum1}`} className={`${cls} text-[var(--obs-text-normal,#dadada)]`}>
          {renderInlineNodes(hMatch[2], onOpenLink)}
        </div>
      );
      i += 1;
      continue;
    }

    // Task checkbox
    const taskMatch = /^(\s*)(?:[-*+]|\d+\.)\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (taskMatch) {
      const indentPx = Math.floor(taskMatch[1].length / 2) * 18;
      const checked = taskMatch[2].toLowerCase() === "x";
      blocks.push(
        <label
          key={`task-${lineNum1}`}
          style={{ paddingLeft: `${indentPx}px` }}
          className="my-1 flex cursor-pointer items-start gap-2 text-[14.5px] leading-6"
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggleCheckbox(lineNum1)}
            className="mt-1 shrink-0"
            style={{ accentColor: "var(--obs-accent,#8a5cf5)" }}
          />
          <span className={checked ? "line-through opacity-60" : ""}>
            {renderInlineNodes(taskMatch[3], onOpenLink)}
          </span>
        </label>
      );
      i += 1;
      continue;
    }

    // Unordered list
    const ulMatch = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (ulMatch) {
      const indentPx = Math.floor(ulMatch[1].length / 2) * 18;
      blocks.push(
        <div
          key={`ul-${lineNum1}`}
          style={{ paddingLeft: `${12 + indentPx}px` }}
          className="my-0.5 flex items-start gap-2 text-[14.5px] leading-7"
        >
          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--obs-text-faint,#666666)]" />
          <span className="flex-1">{renderInlineNodes(ulMatch[2], onOpenLink)}</span>
        </div>
      );
      i += 1;
      continue;
    }

    // Ordered list
    const olMatch = /^(\s*)(\d+\.)\s+(.*)$/.exec(line);
    if (olMatch) {
      const indentPx = Math.floor(olMatch[1].length / 2) * 18;
      blocks.push(
        <div
          key={`ol-${lineNum1}`}
          style={{ paddingLeft: `${8 + indentPx}px` }}
          className="my-0.5 flex items-start gap-2 text-[14.5px] leading-7"
        >
          <span className="shrink-0 font-code text-[13px] text-[var(--obs-text-muted,#b3b3b3)]">
            {olMatch[2]}
          </span>
          <span className="flex-1">{renderInlineNodes(olMatch[3], onOpenLink)}</span>
        </div>
      );
      i += 1;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      blocks.push(
        <blockquote
          key={`bq-${lineNum1}`}
          className="my-1 border-l-2 border-[var(--obs-accent,#8a5cf5)] pl-3 text-[14.5px] leading-7 text-[var(--obs-text-muted,#b3b3b3)] italic"
        >
          {renderInlineNodes(line.replace(/^\s*>\s?/, ""), onOpenLink)}
        </blockquote>
      );
      i += 1;
      continue;
    }

    if (!line.trim()) {
      blocks.push(<div key={`sp-${lineNum1}`} className="h-3" />);
      i += 1;
      continue;
    }

    blocks.push(
      <p key={`p-${lineNum1}`} className="my-1 text-[14.5px] leading-7 text-[var(--obs-text-normal,#dadada)]">
        {renderInlineNodes(line, onOpenLink)}
      </p>
    );
    i += 1;
  }

  return <article className="pb-16">{blocks}</article>;
};
