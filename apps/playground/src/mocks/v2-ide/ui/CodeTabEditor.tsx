import React, { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, X } from "lucide-react";
import type { VaultPort } from "@vibe/vault-core";

import {
  clearResourceHighlight,
  subscribeResourceHighlight,
  type ResourceHighlightRequest,
} from "../model/resourceHighlightBus";

export interface CodeTabEditorProps {
  readonly vault: VaultPort;
  readonly path: string;
}

const LINE_HEIGHT_PX = 24;

function findHighlightedLineRange(
  lines: readonly string[],
  req: ResourceHighlightRequest | null
): { readonly start: number; readonly end: number } | null {
  if (!req) return null;
  if (req.lines && req.lines[0] >= 1) {
    const start = Math.max(1, Math.min(lines.length, req.lines[0]));
    const end = Math.max(start, Math.min(lines.length, req.lines[1] ?? req.lines[0]));
    return { start, end };
  }
  if (req.quoteText) {
    const needle = req.quoteText.trim().toLowerCase();
    if (needle) {
      const idx = lines.findIndex((l) => l.toLowerCase().includes(needle));
      if (idx >= 0) return { start: idx + 1, end: idx + 1 };
      const firstToken = needle.split(/\s+/).find((t) => t.length >= 2);
      if (firstToken) {
        const idx2 = lines.findIndex((l) => l.toLowerCase().includes(firstToken));
        if (idx2 >= 0) return { start: idx2 + 1, end: idx2 + 1 };
      }
    }
  }
  return null;
}

export const CodeTabEditor: React.FC<CodeTabEditorProps> = ({ vault, path }) => {
  const [content, setContent] = useState<string>(() => {
    try {
      return vault.read(path);
    } catch {
      return "";
    }
  });
  const [highlight, setHighlight] = useState<ResourceHighlightRequest | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      if (!vault.exists(path)) return;
      try {
        setContent(vault.read(path));
      } catch {
        // Ignore
      }
    };
    sync();
    return vault.subscribe((ev) => {
      if ((ev.type === "modify" && ev.path === path) || ev.type === "vault-reset") {
        sync();
      }
    });
  }, [vault, path]);

  useEffect(() => {
    return subscribeResourceHighlight(path, (req) => {
      setHighlight(req);
    });
  }, [path]);

  const lines = useMemo(() => content.split("\n"), [content]);
  const highlightedRange = useMemo(
    () => findHighlightedLineRange(lines, highlight),
    [lines, highlight]
  );

  useEffect(() => {
    if (!highlightedRange || !scrollRef.current) return;
    const targetTop = Math.max(0, (highlightedRange.start - 4) * LINE_HEIGHT_PX);
    scrollRef.current.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [highlightedRange, highlight?.id]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)]">
      {highlight && (
        <div
          data-testid="code-resource-highlight-banner"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11.5px] text-amber-100"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Crosshair className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="font-semibold text-amber-200">
              {highlightedRange
                ? highlightedRange.start === highlightedRange.end
                  ? `L${highlightedRange.start} 하이라이트`
                  : `L${highlightedRange.start}-L${highlightedRange.end} 하이라이트`
                : "리소스 참조"}
            </span>
            {highlight.quoteText && (
              <span className="truncate text-amber-100/85">“{highlight.quoteText}”</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => clearResourceHighlight(path)}
            className="shrink-0 rounded p-0.5 text-amber-200/80 hover:bg-amber-500/20 hover:text-white"
            title="하이라이트 해제"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="relative flex min-h-0 flex-1 overflow-auto font-code text-[12.5px] leading-6"
      >
        <div className="shrink-0 select-none border-r border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary-alt,#242424)] py-4 text-right text-[var(--obs-text-faint,#666666)]">
          {lines.map((_, idx) => {
            const lineNo = idx + 1;
            const isHit =
              highlightedRange !== null &&
              lineNo >= highlightedRange.start &&
              lineNo <= highlightedRange.end;
            return (
              <div
                key={idx}
                data-line-number={lineNo}
                data-highlighted={isHit ? "true" : undefined}
                className={`px-3 ${
                  isHit
                    ? "bg-amber-400/25 font-bold text-amber-200 border-r-2 border-amber-400"
                    : ""
                }`}
              >
                {lineNo}
              </div>
            );
          })}
        </div>

        <div className="relative min-h-full flex-1">
          {highlightedRange && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-0 left-0 border-y border-amber-400/60 bg-amber-400/18 transition-all"
              style={{
                top: `${16 + (highlightedRange.start - 1) * LINE_HEIGHT_PX}px`,
                height: `${(highlightedRange.end - highlightedRange.start + 1) * LINE_HEIGHT_PX}px`,
              }}
            />
          )}
          <textarea
            value={content}
            onChange={(ev) => {
              setContent(ev.target.value);
              vault.write(path, ev.target.value);
            }}
            spellCheck={false}
            style={{ minHeight: `${Math.max(lines.length * LINE_HEIGHT_PX + 48, 320)}px` }}
            className="relative z-10 h-full w-full resize-none bg-transparent p-4 text-[var(--obs-text-normal,#dadada)] outline-none"
          />
        </div>
      </div>
    </div>
  );
};
