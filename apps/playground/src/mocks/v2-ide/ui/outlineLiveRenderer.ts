/**
 * Obsidian-style Live Preview inline renderer for `@vibe/outliner` bullets inside VibeDoc Studio.
 *
 * When a bullet is NOT focused, verbose URLs and markup tokens are collapsed into clean,
 * clickable inline chips/pills while preserving 100% pure plaintext on focus:
 * - `![라벨](url)` / `[img:라벨 -> url]` / `[img:라벨]` -> compact Image Chip (with live thumbnail if URL exists)
 * - `[cta:라벨 -> url]` / `[라벨](url)` -> clickable Link / CTA Chip (hides raw URL)
 * - `[embed:kind | 내용]` -> compact Embed Chip
 * - `[[문서명]]` / `[[경로|별칭]]` -> clickable Obsidian internal link
 * - `<<doc:...>>` / `<<view:...>>` / `<<cell>>` / `<<row>>` / `<<col>>` -> tinted directive badge
 * - `==강조==` -> soft highlight mark
 * - Bare `https://...` / `vault://...` -> shortened clickable link chip
 */

import { parseResourceTag } from "@vibe/vdoc-schema";

export type OutlineInlineToken =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "resource"; readonly raw: string }
  | { readonly kind: "directive"; readonly raw: string }
  | { readonly kind: "image"; readonly label: string; readonly url?: string }
  | { readonly kind: "link"; readonly label: string; readonly url: string; readonly isCta?: boolean }
  | { readonly kind: "embed"; readonly embedKind: string; readonly content: string }
  | { readonly kind: "wikilink"; readonly target: string; readonly alias: string }
  | { readonly kind: "highlight"; readonly value: string }
  | { readonly kind: "tag"; readonly value: string };

const INLINE_TOKEN_RE =
  /(<<\s*resource\s*:[^>\n]+\s*>>)|(<<\s*(?:doc|view|cite|asset|template|cell|row|col|document|page|section|title|list|table|callout|quote|block)(?::[^>\n]+)?(?:\s+[^>\n]+)?\s*>>)|(!\[([^\]\n]*)\]\(([^)\s]+)\))|(\[img(?::([^\]\n]*))?\])|(\[cta:([^\]\n]+)\])|(\[embed:([^\]\n]+)\])|(\[([^\]\n]+)\]\(([^)\s]+)\))|(\[\[([^[\]\n]+)\]\])|(==([^=\n]+)==)|((?:https?:\/\/|vault:\/\/)[^\s)\]]+)|((?:^|\s)#[\p{L}\p{N}_/-]*[\p{L}_/-])/giu;

function shortenUrlLabel(url: string): string {
  if (/^vault:\/\//i.test(url)) {
    const stripped = url.replace(/^vault:\/\//i, "");
    const parts = stripped.split("/").filter(Boolean);
    return parts[parts.length - 1] || stripped;
  }
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname.split("/").filter(Boolean).pop();
    if (tail && tail.length <= 28) return `${parsed.hostname}/${tail}`;
    return `${parsed.hostname}/…`;
  } catch {
    return url.length > 32 ? `${url.slice(0, 29)}…` : url;
  }
}

function parseImgInner(rawInner: string): { label: string; url?: string } {
  const cleaned = rawInner.replace(/^\d+:/, "").trim();
  const arrowIdx = cleaned.indexOf("->");
  if (arrowIdx >= 0) {
    const label = cleaned.slice(0, arrowIdx).trim() || "이미지";
    const url = cleaned.slice(arrowIdx + 2).trim() || undefined;
    return { label, url };
  }
  return { label: cleaned || "이미지" };
}

function parseCtaInner(rawInner: string): { label: string; url: string } {
  const arrowIdx = rawInner.indexOf("->");
  if (arrowIdx >= 0) {
    return {
      label: rawInner.slice(0, arrowIdx).trim() || "링크",
      url: rawInner.slice(arrowIdx + 2).trim(),
    };
  }
  return { label: rawInner.trim() || "링크", url: "" };
}

/** Reverses `toInlineMarkdown`'s leading-line escape (`\>`, `\-`, `1\.`, `\#`) for display text. */
function unescapeLeadingInlineMarkdown(text: string): string {
  return text.replace(/^(\s*)(?:(\d+)\\\.|\\([-*+]|#{1,6}|>+))/, (_m, ws: string, num?: string, sym?: string) =>
    num ? `${ws}${num}.` : `${ws}${sym ?? ""}`
  );
}

/** Splits an outline bullet string into structured inline tokens (pure & unit-testable). */
export function tokenizeOutlineInline(rawText: string): OutlineInlineToken[] {
  const text = unescapeLeadingInlineMarkdown(rawText);
  const tokens: OutlineInlineToken[] = [];
  let cursor = 0;

  INLINE_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_TOKEN_RE.exec(text)) !== null) {
    const start = match.index;
    const full = match[0];

    // Tag capture may include a leading whitespace character — keep whitespace as plain text
    if (match[20] && /^\s/.test(full)) {
      const wsLen = full.length - full.trimStart().length;
      if (start + wsLen > cursor) {
        tokens.push({ kind: "text", value: text.slice(cursor, start + wsLen) });
      }
      tokens.push({ kind: "tag", value: full.trimStart() });
      cursor = start + full.length;
      continue;
    }

    if (start > cursor) {
      tokens.push({ kind: "text", value: text.slice(cursor, start) });
    }

    if (match[1]) {
      tokens.push({ kind: "resource", raw: match[1] });
    } else if (match[2]) {
      tokens.push({ kind: "directive", raw: match[2] });
    } else if (match[3]) {
      tokens.push({ kind: "image", label: match[4].trim() || "이미지", url: match[5].trim() });
    } else if (match[6]) {
      const parsed = parseImgInner(match[7] ?? "");
      tokens.push({ kind: "image", label: parsed.label, url: parsed.url });
    } else if (match[8]) {
      const parsed = parseCtaInner(match[9] ?? "");
      tokens.push({ kind: "link", label: parsed.label, url: parsed.url, isCta: true });
    } else if (match[10]) {
      const inner = match[11] ?? "";
      const pipeIdx = inner.indexOf("|");
      tokens.push({
        kind: "embed",
        embedKind: pipeIdx >= 0 ? inner.slice(0, pipeIdx).trim() : "embed",
        content: pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : inner.trim(),
      });
    } else if (match[12]) {
      tokens.push({ kind: "link", label: match[13].trim(), url: match[14].trim() });
    } else if (match[15]) {
      const rawWiki = match[16] ?? "";
      const pipeIdx = rawWiki.indexOf("|");
      const target = pipeIdx >= 0 ? rawWiki.slice(0, pipeIdx).trim() : rawWiki.trim();
      const alias = pipeIdx >= 0 ? rawWiki.slice(pipeIdx + 1).trim() : target;
      tokens.push({ kind: "wikilink", target, alias });
    } else if (match[17]) {
      tokens.push({ kind: "highlight", value: match[18] ?? "" });
    } else if (match[19]) {
      const url = match[19];
      tokens.push({ kind: "link", label: shortenUrlLabel(url), url });
    } else if (match[20]) {
      tokens.push({ kind: "tag", value: match[20].trim() });
    }

    cursor = start + full.length;
  }

  if (cursor < text.length) {
    tokens.push({ kind: "text", value: text.slice(cursor) });
  }

  return tokens;
}

/**
 * XSS-safe DOM renderer passed to `OutlineHost.renderMarkdown`.
 * Uses `document.createElement` + `textContent` exclusively (zero `innerHTML`).
 */
export function renderOutlineInlineMarkdown(markdown: string, containerEl: HTMLElement): void {
  const doc = containerEl.ownerDocument;
  const tokens = tokenizeOutlineInline(markdown);
  const frag = doc.createDocumentFragment();

  for (const tok of tokens) {
    if (tok.kind === "text") {
      frag.appendChild(doc.createTextNode(tok.value));
      continue;
    }

    if (tok.kind === "resource") {
      const parsed = parseResourceTag(tok.raw);
      const anchor = doc.createElement("a");
      anchor.href = "#";
      anchor.setAttribute("data-href", `resource-tag:${tok.raw}`);
      anchor.className = "internal-link vibe-ol-resource-chip";
      const icon = !parsed
        ? "📎"
        : parsed.isWebUrl
          ? "🌐"
          : /\.pdf$/i.test(parsed.target)
            ? "📕"
            : /\.(png|jpe?g|gif|webp|svg)$/i.test(parsed.target)
              ? "🖼"
              : /\.csv$/i.test(parsed.target)
                ? "📊"
                : /\.ref$/i.test(parsed.target)
                  ? "🗂"
                  : /\.vdoc(\.json)?$/i.test(parsed.target)
                    ? "📐"
                    : /\.outline$/i.test(parsed.target)
                      ? "🌿"
                      : "📄";
      const locBits: string[] = [];
      if (parsed?.page) locBits.push(`p.${parsed.page}`);
      if (parsed?.lines) {
        locBits.push(
          parsed.lines[0] === parsed.lines[1]
            ? `L${parsed.lines[0]}`
            : `L${parsed.lines[0]}-L${parsed.lines[1]}`
        );
      }
      if (parsed?.bbox) locBits.push("영역");
      if (parsed?.nodeId) locBits.push(`#${parsed.nodeId}`);
      if (parsed?.slotId) locBits.push(`#${parsed.slotId}`);
      if (parsed?.blockId) locBits.push(`#${parsed.blockId}`);
      const headLabel = parsed
        ? `${icon} ${parsed.label}${locBits.length ? ` · ${locBits.join(" ")}` : ""}`
        : tok.raw;
      const quotePreview = parsed?.quote
        ? parsed.quote.length > 48
          ? `${parsed.quote.slice(0, 47)}…`
          : parsed.quote
        : "";
      anchor.textContent = quotePreview ? `${headLabel}  |  “${quotePreview}”` : headLabel;
      anchor.title = `클릭 시 페어 탭으로 열고 하이라이트 · ${tok.raw}`;
      anchor.style.cssText =
        "display:inline-flex;align-items:center;gap:4px;padding:1px 8px;margin:0 2px;border-radius:6px;font-size:12px;line-height:1.5;color:#a5f3fc;background:rgba(6,182,212,0.16);border:1px solid rgba(34,211,238,0.42);text-decoration:none;cursor:pointer;max-width:100%;vertical-align:baseline;";
      frag.appendChild(anchor);
      continue;
    }

    if (tok.kind === "directive") {
      const badge = doc.createElement("span");
      badge.textContent = tok.raw;
      badge.className = "vibe-ol-directive";
      const low = tok.raw.toLowerCase();
      let colorCss = "color:#c4b5fd;background:rgba(138,92,245,0.16);border:1px solid rgba(138,92,245,0.32);";
      if (low.startsWith("<<cite:rationale") || low.startsWith("<<cite:산출근거")) {
        colorCss = "color:#fde68a;background:rgba(245,158,11,0.18);border:1px solid rgba(251,191,36,0.42);";
      } else if (low.startsWith("<<cite:sidenote") || low.startsWith("<<cite:여백")) {
        colorCss = "color:#99f6e4;background:rgba(20,184,166,0.18);border:1px solid rgba(45,212,191,0.42);";
      } else if (low.startsWith("<<cite:quote") || low.startsWith("<<cite:인용")) {
        colorCss = "color:#ddd6fe;background:rgba(139,92,246,0.2);border:1px solid rgba(167,139,250,0.45);";
      } else if (low.startsWith("<<cite:matrix") || low.startsWith("<<cite:추적")) {
        colorCss = "color:#fecdd3;background:rgba(244,63,94,0.18);border:1px solid rgba(251,113,133,0.42);";
      } else if (low.startsWith("<<cite:bound") || low.startsWith("<<cite:바인딩")) {
        colorCss = "color:#a5f3fc;background:rgba(6,182,212,0.18);border:1px solid rgba(34,211,238,0.42);";
      } else if (low.startsWith("<<cite")) {
        colorCss = "color:#c7d2fe;background:rgba(99,102,241,0.2);border:1px solid rgba(129,140,248,0.45);";
      }
      badge.style.cssText =
        `display:inline-flex;align-items:center;padding:0 5px;margin:0 2px;border-radius:4px;font-family:var(--pg-font-mono,monospace);font-size:11px;line-height:1.45;${colorCss}vertical-align:baseline;`;
      frag.appendChild(badge);
      continue;
    }

    if (tok.kind === "image") {
      const chip = doc.createElement("span");
      chip.className = "vibe-ol-img-chip";
      chip.title = tok.url ? `${tok.label} (${tok.url})` : tok.label;
      chip.style.cssText =
        "display:inline-flex;align-items:center;gap:5px;padding:1px 7px 1px 4px;margin:0 2px;border-radius:5px;font-size:12px;line-height:1.45;color:#bae6fd;background:rgba(14,165,233,0.14);border:1px solid rgba(56,189,248,0.32);vertical-align:middle;max-width:100%;";

      if (tok.url && /^https?:\/\//i.test(tok.url)) {
        const thumb = doc.createElement("img");
        thumb.src = tok.url;
        thumb.alt = tok.label;
        thumb.referrerPolicy = "no-referrer";
        thumb.loading = "lazy";
        thumb.style.cssText =
          "display:inline-block;width:18px;height:18px;border-radius:3px;object-fit:cover;flex-shrink:0;";
        chip.appendChild(thumb);
      } else {
        const glyph = doc.createElement("span");
        glyph.textContent = "🖼";
        glyph.style.cssText = "font-size:11px;line-height:1;";
        chip.appendChild(glyph);
      }

      const labelSpan = doc.createElement("span");
      labelSpan.textContent = tok.label;
      labelSpan.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      chip.appendChild(labelSpan);

      if (tok.url) {
        const openAnchor = doc.createElement("a");
        openAnchor.href = tok.url;
        openAnchor.setAttribute("data-href", tok.url);
        openAnchor.className = "external-link";
        openAnchor.textContent = "↗";
        openAnchor.title = tok.url;
        openAnchor.style.cssText =
          "color:#7dd3fc;text-decoration:none;font-size:11px;margin-left:2px;cursor:pointer;";
        chip.appendChild(openAnchor);
      }
      frag.appendChild(chip);
      continue;
    }

    if (tok.kind === "link") {
      const isVault = /^vault:\/\//i.test(tok.url);
      const anchor = doc.createElement("a");
      anchor.href = tok.url || "#";
      if (tok.url) anchor.setAttribute("data-href", tok.url);
      anchor.className = isVault ? "internal-link" : "external-link";
      anchor.title = tok.url || tok.label;
      anchor.textContent = `${isVault ? "📄 " : tok.isCta ? "↗ " : "🔗 "}${tok.label}`;
      anchor.style.cssText = tok.isCta
        ? "display:inline-flex;align-items:center;gap:3px;padding:0 7px;margin:0 2px;border-radius:5px;font-size:12px;line-height:1.5;color:#6ee7b7;background:rgba(16,185,129,0.14);border:1px solid rgba(52,211,153,0.32);text-decoration:none;cursor:pointer;"
        : "display:inline-flex;align-items:center;gap:3px;padding:0 5px;margin:0 1px;border-radius:4px;font-size:12.5px;line-height:1.45;color:#93c5fd;background:rgba(59,130,246,0.12);border:1px solid rgba(96,165,250,0.28);text-decoration:none;cursor:pointer;";
      frag.appendChild(anchor);
      continue;
    }

    if (tok.kind === "embed") {
      const chip = doc.createElement("span");
      chip.textContent = `⊞ ${tok.embedKind}${tok.content ? ` · ${tok.content}` : ""}`;
      chip.style.cssText =
        "display:inline-flex;align-items:center;padding:0 6px;margin:0 2px;border-radius:4px;font-size:11.5px;line-height:1.45;color:#fcd34d;background:rgba(245,158,11,0.12);border:1px solid rgba(251,191,36,0.28);";
      frag.appendChild(chip);
      continue;
    }

    if (tok.kind === "wikilink") {
      const anchor = doc.createElement("a");
      anchor.href = tok.target;
      anchor.setAttribute("data-href", tok.target);
      anchor.className = "internal-link";
      anchor.textContent = tok.alias;
      anchor.title = `[[${tok.target}]]`;
      anchor.style.cssText =
        "color:#c4b5fd;text-decoration:underline;text-decoration-color:rgba(196,181,253,0.45);text-underline-offset:2px;cursor:pointer;";
      frag.appendChild(anchor);
      continue;
    }

    if (tok.kind === "highlight") {
      const mark = doc.createElement("mark");
      mark.textContent = tok.value;
      mark.style.cssText =
        "padding:0 3px;border-radius:3px;background:rgba(250,204,21,0.24);color:#fef08a;";
      frag.appendChild(mark);
      continue;
    }

    if (tok.kind === "tag") {
      const tag = doc.createElement("a");
      tag.href = tok.value;
      tag.className = "tag";
      tag.textContent = tok.value;
      tag.style.cssText =
        "padding:0 5px;border-radius:999px;font-size:11.5px;color:#a5b4fc;background:rgba(99,102,241,0.16);text-decoration:none;";
      frag.appendChild(tag);
    }
  }

  containerEl.replaceChildren(frag);
}
