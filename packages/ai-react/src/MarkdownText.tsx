import React from "react";
import { BookOpen, ChevronDown, ChevronUp, Database, FolderTree, GitPullRequestDraft, Layers } from "lucide-react";

import type { EntityInfo, EntityRegistry } from "@vibe/ai-kernel";

import { useAiSurface } from "./AiSurface";
import { CATEGORY_STYLES, EntityCategory, EntityChip, getEntityCategory } from "./EntityChip";

export interface MarkdownTextProps {
  text: string;
  className?: string;
  /** 맨 하단에 엔티티들을 카테고리별로 Group by 리스트업할지 여부 (기본 true) */
  showGroupByFooter?: boolean;
}

/**
 * 가벼운 마크다운 렌더러 (HTML 을 해석하지 않는다 — 모델 출력은 전부 텍스트로 다룬다).
 * 지원: 제목(#), 목록(-, *, 1.), 코드펜스, 인라인 코드, 굵게, 기울임, 인용(>), 구분선.
 *
 * 위치 링크: `[이름](vdoc:block/id)` 과, 화면에 실제로 있는 id 를 쓴 인라인 코드 · 맨 id(`mm_page_1`)는
 * 클릭할 수 있는 위치 칩이 된다 (AI 표면 안에서만 — `AiSurfaceProvider`).
 *
 * 답변 맨 하단에는 언급된 엔티티들을 리소스, 레퍼런스, 아웃라이너, 에디터 위치, 변경안 그룹으로 묶어 Group by 리스트업합니다.
 */
export const MarkdownText: React.FC<MarkdownTextProps> = ({
  text,
  className,
  showGroupByFooter = true,
}) => {
  const surface = useAiSurface();
  const entities = surface?.runtime.entities ?? null;
  // 해석기가 나중에 등록되거나 바뀌면(HMR · 기능 추가) 칩을 다시 찾는다.
  const resolvers = React.useSyncExternalStore(
    (l) => entities?.subscribe(l) ?? (() => undefined),
    () => entities?.list() ?? null,
    () => entities?.list() ?? null
  );

  const blocks = React.useMemo(() => parseBlocks(text, entities), [text, entities, resolvers]); // eslint-disable-line react-hooks/exhaustive-deps
  const collectedEntities = React.useMemo(() => (showGroupByFooter ? extractEntities(text, entities) : []), [text, entities, resolvers, showGroupByFooter]);

  return (
    <div className={className ?? "space-y-1.5 text-[13px] leading-relaxed text-slate-800"}>
      {blocks}
      {showGroupByFooter && collectedEntities.length > 0 && (
        <CitationGroupByFooter entities={collectedEntities} />
      )}
    </div>
  );
};

// --- Group By 푸터 컴포넌트 -----------------------------------------------------

const GROUP_CONFIG: Record<
  EntityCategory,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    border: string;
    bg: string;
    titleColor: string;
  }
> = {
  // 1. 리소스: 연보라 (Purple) - 사용자 지정 고정
  resource: {
    label: "리소스 (지식 덱 · 카드 · 원천 데이터)",
    icon: Database,
    border: "border-purple-200/80",
    bg: "bg-purple-50/40",
    titleColor: "text-purple-900",
  },
  // 2. 레퍼런스: 앰버 (Amber)
  reference: {
    label: "레퍼런스 (참조 규정 · PDF · 핀)",
    icon: BookOpen,
    border: "border-amber-200/80",
    bg: "bg-amber-50/40",
    titleColor: "text-amber-900",
  },
  // 3. 아웃라이너: 스카이 블루 (Sky Blue)
  outliner: {
    label: "아웃라이너 (문서 구조 · 목차)",
    icon: FolderTree,
    border: "border-sky-200/80",
    bg: "bg-sky-50/40",
    titleColor: "text-sky-900",
  },
  // 4. 에디터 위치: 연두 (Emerald) - 사용자 지정 고정
  editor: {
    label: "에디터 위치 (슬롯 · 표 셀 · 블록)",
    icon: Layers,
    border: "border-emerald-200/80",
    bg: "bg-emerald-50/40",
    titleColor: "text-emerald-900",
  },
  // 5. 변경안: 로즈 (Rose)
  staged: {
    label: "변경안 (Staged 제안)",
    icon: GitPullRequestDraft,
    border: "border-rose-200/80",
    bg: "bg-rose-50/40",
    titleColor: "text-rose-900",
  },
};

const ORDERED_CATEGORIES: EntityCategory[] = ["resource", "reference", "outliner", "editor", "staged"];

export const CitationGroupByFooter: React.FC<{ entities: EntityInfo[] }> = ({ entities }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  if (entities.length === 0) return null;

  const grouped: Record<EntityCategory, EntityInfo[]> = {
    resource: [],
    reference: [],
    outliner: [],
    editor: [],
    staged: [],
  };

  const seenIds = new Set<string>();
  for (const ent of entities) {
    if (seenIds.has(ent.id)) continue;
    seenIds.add(ent.id);
    const cat = getEntityCategory(ent.kind);
    grouped[cat].push(ent);
  }

  const activeCategories = ORDERED_CATEGORIES.filter((cat) => grouped[cat].length > 0);
  if (activeCategories.length === 0) return null;

  return (
    <div
      data-testid="citation-group-by-footer"
      className="mt-3.5 pt-2 border-t border-slate-200 select-none text-[11px]"
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between py-1 px-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 cursor-pointer transition text-left"
        title={isOpen ? "인용 및 참조 목록 접기" : "인용 및 참조 목록 펼치기"}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5 font-bold">
          <span>📌 인용 및 참조 목록 (Group by)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-500 font-mono">
            {seenIds.size}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10.5px] text-slate-400 font-normal">
          <span>{isOpen ? "접기" : "펼치기"}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {isOpen && (
        <div className="space-y-1.5 mt-2">
          {activeCategories.map((cat) => {
            const items = grouped[cat];
            const cfg = GROUP_CONFIG[cat];
            const Icon = cfg.icon;
            return (
              <div
                key={cat}
                className={`p-1.5 rounded-lg border ${cfg.border} ${cfg.bg} flex flex-col gap-1`}
              >
                <div className="flex items-center gap-1 font-bold text-[10.5px]">
                  <Icon className={`w-3 h-3 shrink-0 ${cfg.titleColor}`} />
                  <span className={cfg.titleColor}>{cfg.label}</span>
                  <span className="text-[9.5px] opacity-60 font-mono">({items.length})</span>
                </div>
                <div className="flex flex-wrap gap-1 items-center pl-4">
                  {items.map((item) => (
                    <EntityChip key={item.id} id={item.id} kind={item.kind} label={item.label} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- 엔티티 추출 로직 -------------------------------------------------------------

function extractEntities(text: string, entities: EntityRegistry | null): EntityInfo[] {
  if (!entities) return [];
  const result: EntityInfo[] = [];
  const seen = new Set<string>();

  const add = (info: EntityInfo | null) => {
    if (info && !seen.has(info.id)) {
      seen.add(info.id);
      result.push(info);
    }
  };

  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[(?:\[[^\]]*\]|[^\]])+\]\([^)]+\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! < last) continue;
    const token = match[0];
    const tail = text.slice(match.index! + token.length);
    if (token.startsWith("`")) {
      const body = token.slice(1, -1).trim();
      const attached = attachTrailingLines(body, tail);
      add(entities.lookup(attached.id) ?? entities.lookup(body));
      last = match.index! + token.length + (entities.lookup(body) ? attached.consumed : 0);
      continue;
    } else if (token.startsWith("[")) {
      const sepIdx = token.lastIndexOf("](");
      const href = sepIdx !== -1 ? token.slice(sepIdx + 2, -1).trim() : "";
      const link = VDOC_LINK.exec(href);
      if (link) {
        const rawTarget = decodeURIComponent(link[2]);
        const attached = attachTrailingLines(rawTarget, tail);
        add(entities.lookup(attached.id, link[1]));
        last = match.index! + token.length + attached.consumed;
        continue;
      }
    }
    last = match.index! + token.length;
  }

  // Bare ID 스캔
  for (const m of text.matchAll(BARE_ID)) {
    const tail = text.slice(m.index! + m[0].length);
    const attached = attachTrailingLines(m[0], tail);
    add(entities.lookup(attached.id) ?? entities.lookup(m[0]));
  }

  return result;
}

// --- 블록 및 인라인 파싱 -----------------------------------------------------------

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
/** 맨 id 후보: 밑줄이 들어간 영숫자/한글 토큰 (`mm_page_1`, `1.1_수렴을_...`), 의사결정/카드 키워드 (`Decision 03`, `C-03-05`). */
const BARE_ID = /\b[A-Za-z0-9가-힣.]+(?:[_-][A-Za-z0-9가-힣.]+)+|\bDecision\s+\d+\b|\bC-\d{2}-\d{2}\b/gi;
/** 뒤따르는 `(L32-47)` 또는 `(L32)` 줄 번호 괄호 표기 */
const TRAILING_LINES = /^\s*\(L(\d+)(?:\s*[-–~]\s*L?(\d+))?\)/i;

export function attachTrailingLines(baseId: string, tail: string): { id: string; consumed: number } {
  if (baseId.includes("#L")) return { id: baseId, consumed: 0 };
  const m = TRAILING_LINES.exec(tail);
  if (!m) return { id: baseId, consumed: 0 };
  const start = m[1];
  const end = m[2] || start;
  return { id: `${baseId}#L${start}-L${end}`, consumed: m[0].length };
}

function inlineNodes(text: string, entities: EntityRegistry | null): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[(?:\[[^\]]*\]|[^\]])+\]\([^)]+\))/g;
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
      if (m.index! < cursor) continue;
      const tail = value.slice(m.index! + m[0].length);
      const attached = attachTrailingLines(m[0], tail);
      const resolved = entities.lookup(attached.id) ?? entities.lookup(m[0]);
      if (!resolved) continue;

      if (m.index! > cursor) parts.push(value.slice(cursor, m.index));
      parts.push(<EntityChip key={`e${key++}`} id={attached.consumed > 0 ? attached.id : m[0]} />);
      cursor = m.index! + m[0].length + attached.consumed;
    }
    if (cursor < value.length) parts.push(value.slice(cursor));
  };
  for (const match of text.matchAll(pattern)) {
    if (match.index! < last) continue;
    const token = match[0];
    const tail = text.slice(match.index! + token.length);

    if (match.index! > last) pushText(text.slice(last, match.index));
    if (token.startsWith("`")) {
      const body = token.slice(1, -1);
      const code = (
        <code key={key++} className="px-1 py-0.5 rounded bg-slate-100 text-[12px] font-mono text-rose-700">
          {body}
        </code>
      );
      const attached = attachTrailingLines(body.trim(), tail);
      const resolved = entities && (entities.lookup(attached.id) ?? entities.lookup(body.trim()));
      if (resolved) {
        parts.push(<EntityChip key={key++} id={attached.consumed > 0 ? attached.id : body.trim()} fallback={code} />);
        last = match.index! + token.length + attached.consumed;
      } else {
        parts.push(code);
        last = match.index! + token.length;
      }
    } else if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{inlineNodes(token.slice(2, -2), entities)}</strong>);
      last = match.index! + token.length;
    } else if (token.startsWith("[")) {
      const sepIdx = token.lastIndexOf("](");
      const label = sepIdx !== -1 ? token.slice(1, sepIdx) : token.slice(1, -1);
      const href = sepIdx !== -1 ? token.slice(sepIdx + 2, -1).trim() : "";
      const link = VDOC_LINK.exec(href);
      if (link) {
        const rawTarget = decodeURIComponent(link[2]);
        const attached = attachTrailingLines(rawTarget, tail);
        const finalId = attached.consumed > 0 ? attached.id : rawTarget;
        parts.push(
          <EntityChip
            key={key++}
            id={finalId}
            kind={link[1]}
            label={label}
            fallback={<span className="text-slate-500">{label}</span>}
          />
        );
        last = match.index! + token.length + attached.consumed;
      } else {
        parts.push(
          <span key={key++} className="text-blue-700 underline decoration-dotted" title={href}>
            {label}
          </span>
        );
        last = match.index! + token.length;
      }
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
      last = match.index! + token.length;
    }
  }
  if (last < text.length) pushText(text.slice(last));
  return parts;
}
