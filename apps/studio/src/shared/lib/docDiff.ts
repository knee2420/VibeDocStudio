/**
 * 문서 비교 — 워드 "문서 비교" · 구글 문서 "변경사항 표시"처럼 문단 단위로 맞춘 뒤 문단 안은 낱말 단위로 빨강/초록.
 * 통계는 글자 수 (공백 제외) — 원고 분량을 글자로 세는 문서 작업 기준.
 */

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

const BLOCK_END = /<\/(p|div|li|h[1-6]|tr|blockquote|pre|section|article|header|footer|ul|ol|table|figure|figcaption)\s*>/gi;
const BLOCK_START = /<(p|div|li|h[1-6]|tr|blockquote|pre|ul|ol|table|figure)(\s[^>]*)?>/gi;

/** 칸 HTML → 문단(줄). 문단 · 제목 · 목록 항목 · 줄바꿈 · 표 행이 각각 하나. 이미지는 `[이미지] alt`. */
export function htmlToDocLines(html: string): string[] {
  if (!html) return [];
  const text = html
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const alt = /\balt\s*=\s*"([^"]*)"/i.exec(tag)?.[1];
      return `\n[이미지]${alt ? ` ${alt}` : ""}\n`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th)\s*>/gi, " | ")
    .replace(BLOCK_END, "\n")
    .replace(BLOCK_START, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m);
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").replace(/\s*\|\s*$/, "").trim())
    .filter((line) => line.length > 0);
}

type Op<T> = { kind: "same" | "del" | "add"; value: T };

/** 이 이상이면 LCS 대신 통째로 삭제 → 추가 (거대한 칸에서 멈추지 않게). */
const MAX_CELLS = 250_000;

/** LCS 정렬. 삭제가 추가보다 먼저 (워드 · git 과 같다). */
function lcsOps<T>(a: T[], b: T[]): Op<T>[] {
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_CELLS) {
    return [...a.map((value) => ({ kind: "del" as const, value })), ...b.map((value) => ({ kind: "add" as const, value }))];
  }
  const t: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  }
  const out: Op<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({ kind: "same", value: a[i] });
      i++;
      j++;
    } else if (j >= m || (i < n && t[i + 1][j] >= t[i][j + 1])) out.push({ kind: "del", value: a[i++] });
    else out.push({ kind: "add", value: b[j++] });
  }
  return out;
}

export interface WordSeg {
  kind: "same" | "del" | "add";
  text: string;
}

/** 문단 안 낱말(어절) 비교. 같은 종류가 이어지면 하나로 합친다. */
export function diffWords(before: string, after: string): WordSeg[] {
  const tok = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];
  const segs: WordSeg[] = [];
  for (const op of lcsOps(tok(before), tok(after))) {
    const last = segs[segs.length - 1];
    if (last && last.kind === op.kind) last.text += op.value;
    else segs.push({ kind: op.kind, text: op.value });
  }
  return joinChangeRuns(segs);
}

/**
 * 바뀐 낱말 사이에 낀 공백만 "같음"으로 남으면 `지움 ␣ 넣음 지움 ␣ 넣음`처럼 잘게 끊겨 읽기 어렵다.
 * 공백뿐인 같은 조각이 양옆 모두 바뀐 조각이면 그 덩어리를 "지운 글 전체 → 넣은 글 전체" 하나로 합친다 (워드 비교와 같다).
 */
function joinChangeRuns(segs: WordSeg[]): WordSeg[] {
  const glue = (i: number) =>
    segs[i].kind === "same" && /^\s+$/.test(segs[i].text) && i > 0 && i < segs.length - 1 && segs[i - 1].kind !== "same" && segs[i + 1].kind !== "same";
  const out: WordSeg[] = [];
  let i = 0;
  while (i < segs.length) {
    if (segs[i].kind === "same" && !glue(i)) {
      out.push(segs[i++]);
      continue;
    }
    let del = "";
    let add = "";
    let hasDel = false;
    let hasAdd = false;
    while (i < segs.length && (segs[i].kind !== "same" || glue(i))) {
      const s = segs[i++];
      if (s.kind === "del") {
        del += s.text;
        hasDel = true;
      } else if (s.kind === "add") {
        add += s.text;
        hasAdd = true;
      } else {
        del += s.text;
        add += s.text;
      }
    }
    if (hasDel) out.push({ kind: "del", text: del });
    if (hasAdd) out.push({ kind: "add", text: add });
  }
  return out.filter((s) => s.text.length > 0);
}

export type ParaDiff =
  | { kind: "same"; text: string }
  | { kind: "changed"; segs: WordSeg[] }
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string };

const visible = (s: string) => s.replace(/\s+/g, "").length;

/** 고친 문단으로 짝지을 만큼 비슷한가 (남은 글자 비율). */
function similar(segs: WordSeg[], before: string, after: string): boolean {
  const same = segs.filter((s) => s.kind === "same").reduce((n, s) => n + visible(s.text), 0);
  return same / Math.max(1, Math.max(visible(before), visible(after))) >= 0.3;
}

/**
 * 같은 칸 두 판의 비교는 여러 곳(사이드바 · 기록 · 검토 화면 · 변경 위치 막대)에서, 글자 하나 칠 때마다 다시 묻는다.
 * 결과를 기억해 두고 같은 쌍이면 다시 계산하지 않는다 (오래된 것부터 버린다).
 */
const PARA_CACHE_MAX = 600;
const paraCache = new Map<string, ParaDiff[]>();

/** 칸 HTML 두 판 → 문단 비교. 지운 문단 묶음과 넣은 문단 묶음은 위에서부터 짝지어 비슷하면 "고친 문단". */
export function diffParagraphs(beforeHtml: string, afterHtml: string): ParaDiff[] {
  const key = `${beforeHtml.length}:${beforeHtml}\u0000${afterHtml}`;
  const hit = paraCache.get(key);
  if (hit) {
    paraCache.delete(key);
    paraCache.set(key, hit);
    return hit;
  }
  const result = computeParagraphs(beforeHtml, afterHtml);
  paraCache.set(key, result);
  if (paraCache.size > PARA_CACHE_MAX) paraCache.delete(paraCache.keys().next().value!);
  return result;
}

function computeParagraphs(beforeHtml: string, afterHtml: string): ParaDiff[] {
  const ops = lcsOps(htmlToDocLines(beforeHtml), htmlToDocLines(afterHtml));
  const out: ParaDiff[] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].kind === "same") {
      out.push({ kind: "same", text: ops[k++].value });
      continue;
    }
    const dels: string[] = [];
    const adds: string[] = [];
    while (k < ops.length && ops[k].kind === "del") dels.push(ops[k++].value);
    while (k < ops.length && ops[k].kind === "add") adds.push(ops[k++].value);
    for (let r = 0; r < Math.max(dels.length, adds.length); r++) {
      const d = dels[r];
      const a = adds[r];
      if (d !== undefined && a !== undefined) {
        const segs = diffWords(d, a);
        if (similar(segs, d, a)) out.push({ kind: "changed", segs });
        else out.push({ kind: "removed", text: d }, { kind: "added", text: a });
      } else if (d !== undefined) out.push({ kind: "removed", text: d });
      else if (a !== undefined) out.push({ kind: "added", text: a });
    }
  }
  return out;
}

export interface CharStat {
  /** 넣은 글자 수 (공백 제외) */
  added: number;
  /** 지운 글자 수 (공백 제외) */
  removed: number;
}

export function paraStat(paras: ParaDiff[]): CharStat {
  let added = 0;
  let removed = 0;
  for (const p of paras) {
    if (p.kind === "added") added += visible(p.text);
    else if (p.kind === "removed") removed += visible(p.text);
    else if (p.kind === "changed") {
      for (const s of p.segs) {
        if (s.kind === "add") added += visible(s.text);
        else if (s.kind === "del") removed += visible(s.text);
      }
    }
  }
  return { added, removed };
}

export function sumStats(stats: Iterable<CharStat>): CharStat {
  let added = 0;
  let removed = 0;
  for (const s of stats) {
    added += s.added;
    removed += s.removed;
  }
  return { added, removed };
}

/**
 * 목록 한 줄용 요약: 첫 바뀐 문단에서 바뀐 곳 앞뒤만 남긴다 ("…상금 [확인 필요] → 10,000,000 (일 천만원)").
 * 앞뒤 같은 글은 `context` 글자까지만.
 */
export function changeSnippet(paras: ParaDiff[], context = 14): WordSeg[] {
  const at = paras.findIndex((x) => x.kind !== "same");
  const p = paras[at];
  if (!p) return [];
  if (p.kind === "added") return [{ kind: "add", text: p.text }];
  if (p.kind === "removed") {
    // 문단을 통째로 바꿔 쓴 경우: 지운 글 → 넣은 글을 한 줄에.
    const next = paras[at + 1];
    return next?.kind === "added"
      ? [{ kind: "del", text: p.text }, { kind: "same", text: " " }, { kind: "add", text: next.text }]
      : [{ kind: "del", text: p.text }];
  }
  if (p.kind !== "changed") return [];
  const segs = p.segs.map((s) => ({ ...s }));
  const first = segs[0];
  if (first?.kind === "same" && first.text.length > context) first.text = `…${first.text.slice(-context).trimStart()}`;
  const last = segs[segs.length - 1];
  if (segs.length > 1 && last?.kind === "same" && last.text.length > context) last.text = `${last.text.slice(0, context).trimEnd()}…`;
  return segs;
}
