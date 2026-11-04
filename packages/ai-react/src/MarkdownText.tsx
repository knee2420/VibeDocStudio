import React from "react";

/**
 * 가벼운 마크다운 렌더러 (HTML 을 해석하지 않는다 — 모델 출력은 전부 텍스트로 다룬다).
 * 지원: 제목(#), 목록(-, *, 1.), 코드펜스, 인라인 코드, 굵게, 기울임, 인용(>), 구분선.
 */
export const MarkdownText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const blocks = React.useMemo(() => parseBlocks(text), [text]);
  return <div className={className ?? "space-y-1.5 text-[13px] leading-relaxed text-slate-800"}>{blocks}</div>;
};

function parseBlocks(text: string): React.ReactNode[] {
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

function inline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    if (match.index! > last) parts.push(text.slice(last, match.index));
    if (token.startsWith("`")) {
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-slate-100 text-[12px] font-mono text-rose-700">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      parts.push(
        <span key={key++} className="text-blue-700 underline decoration-dotted">
          {label}
        </span>
      );
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = match.index! + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
