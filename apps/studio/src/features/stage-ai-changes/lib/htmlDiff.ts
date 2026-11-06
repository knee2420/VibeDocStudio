/**
 * 슬롯 HTML diff — 문단(블록) 단위로 짝을 맞추고, 바뀐 문단 안은 단어 단위로 보인다.
 *
 * 부분 승인의 단위는 "덩어리(hunk)" = 연속해서 바뀐 블록들. 덩어리마다 새 것 · 옛 것을 골라
 * 다시 이어 붙이면 서식(<ul>, <strong>, 인용 <sup>)이 깨지지 않는다 (블록 HTML 을 그대로 쓰므로).
 */

export interface HtmlBlock {
  html: string;
  text: string;
}

export type BlockOp =
  | { kind: "equal"; block: HtmlBlock }
  | { kind: "hunk"; index: number; before: HtmlBlock[]; after: HtmlBlock[] };

export interface WordSegment {
  type: "eq" | "del" | "ins";
  text: string;
}

const MAX_LCS_CELLS = 400_000;

export function splitBlocks(html: string): HtmlBlock[] {
  const source = (html ?? "").trim();
  if (!source) return [];
  if (typeof DOMParser === "undefined") return [{ html: source, text: source.replace(/<[^>]+>/g, "") }];
  const body = new DOMParser().parseFromString(`<body>${source}</body>`, "text/html").body;
  const blocks: HtmlBlock[] = [];
  let loose = "";
  const flushLoose = () => {
    if (loose.trim()) blocks.push({ html: `<p>${loose.trim()}</p>`, text: loose.replace(/<[^>]+>/g, "").trim() });
    loose = "";
  };
  body.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && /^(P|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TABLE|DIV|HR)$/.test((node as Element).tagName)) {
      flushLoose();
      const el = node as Element;
      blocks.push({ html: el.outerHTML, text: (el.textContent ?? "").replace(/\s+/g, " ").trim() });
    } else {
      loose += node.nodeType === Node.TEXT_NODE ? node.textContent ?? "" : (node as Element).outerHTML;
    }
  });
  flushLoose();
  return blocks;
}

/** 같은 길이 두 열의 최장 공통 부분열 표 (작은 입력 전용). */
function lcsTable<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): number[][] {
  const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i][j] = eq(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  return t;
}

export function diffBlocks(beforeHtml: string, afterHtml: string): BlockOp[] {
  const a = splitBlocks(beforeHtml);
  const b = splitBlocks(afterHtml);
  const ops: BlockOp[] = [];
  let pendingBefore: HtmlBlock[] = [];
  let pendingAfter: HtmlBlock[] = [];
  let hunk = 0;
  const flush = () => {
    if (pendingBefore.length || pendingAfter.length) {
      ops.push({ kind: "hunk", index: hunk++, before: pendingBefore, after: pendingAfter });
      pendingBefore = [];
      pendingAfter = [];
    }
  };
  if (a.length * b.length > MAX_LCS_CELLS) {
    return [{ kind: "hunk", index: 0, before: a, after: b }];
  }
  const same = (x: HtmlBlock, y: HtmlBlock) => x.html === y.html;
  const t = lcsTable(a, b, same);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (same(a[i], b[j])) {
      flush();
      ops.push({ kind: "equal", block: b[j] });
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) {
      pendingBefore.push(a[i++]);
    } else {
      pendingAfter.push(b[j++]);
    }
  }
  while (i < a.length) pendingBefore.push(a[i++]);
  while (j < b.length) pendingAfter.push(b[j++]);
  flush();
  return ops;
}

const TOKEN = /\s+|[0-9A-Za-z가-힣_]+|[^\s0-9A-Za-z가-힣_]/g;

export function diffWords(before: string, after: string): WordSegment[] {
  const a = before.match(TOKEN) ?? [];
  const b = after.match(TOKEN) ?? [];
  if (a.length * b.length > MAX_LCS_CELLS) {
    return [
      ...(before ? [{ type: "del" as const, text: before }] : []),
      ...(after ? [{ type: "ins" as const, text: after }] : []),
    ];
  }
  const t = lcsTable(a, b, (x, y) => x === y);
  const out: WordSegment[] = [];
  const push = (type: WordSegment["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("eq", b[j]);
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) push("del", a[i++]);
    else push("ins", b[j++]);
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("ins", b[j++]);
  return out;
}

/** 덩어리마다 고른 쪽으로 다시 잇는다 (`accepted[hunk] === true` 면 새 것). */
export function mergeHunks(ops: BlockOp[], accepted: Record<number, boolean>): string {
  return ops
    .flatMap((op) => (op.kind === "equal" ? [op.block.html] : (accepted[op.index] ? op.after : op.before).map((b) => b.html)))
    .join("");
}

export function hunkCount(ops: BlockOp[]): number {
  return ops.filter((o) => o.kind === "hunk").length;
}
