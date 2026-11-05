import React from "react";

import type { EntityRegistry } from "@vibe/ai-kernel";

import { useAiSurface } from "./AiSurface";
import { EntityChip } from "./EntityChip";

/**
 * 가벼운 마크다운 렌더러 (HTML 을 해석하지 않는다 — 모델 출력은 전부 텍스트로 다룬다).
 * 지원: 제목(#), 목록(-, *, 1.), 코드펜스, 인라인 코드, 굵게, 기울임, 인용(>), 구분선.
 *
 * 위치 링크: `[이름](vdoc:block/id)` 과, 화면에 실제로 있는 id 를 쓴 인라인 코드 · 맨 id(`mm_page_1`)는
 * 클릭할 수 있는 위치 칩이 된다 (AI 표면 안에서만 — `AiSurfaceProvider`).
 */
export const MarkdownText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const surface = useAiSurface();
  const entities = surface?.runtime.entities ?? null;
  // 해석기가 나중에 등록되거나 바뀌면(HMR · 기능 추가) 칩을 다시 찾는다.
  const resolvers = React.useSyncExternalStore(
    (l) => entities?.subscribe(l) ?? (() => undefined),
    () => entities?.list() ?? null,
    () => entities?.list() ?? null
  );
  const blocks = React.useMemo(() => parseBlocks(text, entities), [text, entities, resolvers]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={className ?? "space-y-1.5 text-[13px] leading-relaxed text-slate-800"}>{blocks}</div>;
};

function parseBlocks(text: string, entities: EntityRegistry | null): React.ReactNode[] {
  const inline = (value: string) => inlineNodes(value, entities);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++;
      out.push(
        <pre key={key++} className="rounded-lg bg-slate-900 text-slate-100 text-[11.5px] p-2.5 overflow-x-auto font-mono">
          {lang && <div className="text-[10px] text-slate-400 mb-1">{lang}</div>}
          <code>{body.join("\n")}</code>
        </pre>
      );
      continue;
    }
    if (/^\s*([-*])\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*([-*])\s+/).test(lines[i])) {
        items.push(lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*([-*])\s+/, ""));
        i++;
      }
      const ListTag = ordered ? "ol" : "ul";
      out.push(
        <ListTag key={key++} className={`${ordered ? "list-decimal" : "list-disc"} pl-5 space-y-0.5`}>
          {items.map((item, idx) => (
            <li key={idx}>{inline(item)}</li>
          ))}
        </ListTag>
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const size = heading[1].length <= 2 ? "text-[14px]" : "text-[13px]";
      out.push(
        <div key={key++} className={`${size} font-bold text-slate-900 pt-1`}>
          {inline(heading[2])}
        </div>
      );
      i++;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(
        <blockquote key={key++} className="border-l-2 border-slate-300 pl-2.5 text-slate-600">
          {inline(quote.join(" "))}
        </blockquote>
      );
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      out.push(<hr key={key++} className="border-slate-200" />);
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*[-*]\s|\s*\d+[.)]\s|\s*>)/.test(lines[i])) {
      para.push(lines[i++]);
    }
    out.push(
      <p key={key++} className="whitespace-pre-wrap break-words">
        {inline(para.join("\n"))}
      </p>
    );
  }
  return out;
}

/** 위치 링크 `vdoc:종류/id` (종류 생략 가능). */
const VDOC_LINK = /^vdoc:(?:([a-z-]+)\/)?(.+)$/;
/** 맨 id 후보: 밑줄이 들어간 영숫자 토큰 (`mm_page_1`, `blk_bs_composite_frame`). */
const BARE_ID = /\b[A-Za-z][A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)*_[A-Za-z0-9]+\b/g;

function inlineNodes(text: string, entities: EntityRegistry | null): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let key = 0;
  const pushText = (value: string) => {
    if (!value) return;
    if (!entities) {
      parts.push(value);
      return;
    }
    let cursor = 0;
    for (const m of value.matchAll(BARE_ID)) {
      if (!entities.lookup(m[0])) continue;
      if (m.index! > cursor) parts.push(value.slice(cursor, m.index));
      parts.push(<EntityChip key={`e${key++}`} id={m[0]} />);
      cursor = m.index! + m[0].length;
    }
    if (cursor < value.length) parts.push(value.slice(cursor));
  };
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    if (match.index! > last) pushText(text.slice(last, match.index));
    if (token.startsWith("`")) {
      const body = token.slice(1, -1);
      const code = (
        <code key={key++} className="px-1 py-0.5 rounded bg-slate-100 text-[12px] font-mono text-rose-700">
          {body}
        </code>
      );
      parts.push(entities && entities.lookup(body.trim()) ? <EntityChip key={key++} id={body.trim()} fallback={code} /> : code);
    } else if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{inlineNodes(token.slice(2, -2), entities)}</strong>);
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("](") + 2, -1).trim();
      const link = VDOC_LINK.exec(href);
      if (link) {
        parts.push(
          <EntityChip
            key={key++}
            id={decodeURIComponent(link[2])}
            kind={link[1]}
            label={label}
            fallback={<span className="text-slate-500">{label}</span>}
          />
        );
      } else {
        parts.push(
          <span key={key++} className="text-blue-700 underline decoration-dotted" title={href}>
            {label}
          </span>
        );
      }
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = match.index! + token.length;
  }
  if (last < text.length) pushText(text.slice(last));
  return parts;
}
