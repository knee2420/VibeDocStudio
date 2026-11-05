import type { AiRuntime } from "./runtime";
import type { ContextRef } from "./types";

/** 워크스페이스 요소를 Composer · 인라인 AI 로 끌어 놓을 때 쓰는 드래그 데이터 형식. */
export const AI_CONTEXT_MIME = "application/x-vibe-ai-context";

/** 드래그 시작 시 첨부 정보를 싣는다 (다른 앱에 놓으면 이름만 텍스트로 간다). */
export function writeContextDrag(dataTransfer: DataTransfer, refs: ContextRef[]): void {
  if (refs.length === 0) return;
  dataTransfer.setData(AI_CONTEXT_MIME, JSON.stringify(refs));
  dataTransfer.setData("text/plain", refs.map((r) => r.label).join(", "));
  dataTransfer.effectAllowed = dataTransfer.effectAllowed === "move" ? "copyMove" : "copy";
}

/** dragover 단계에서는 내용을 못 읽으므로 형식만 본다. */
export function isAttachableDrag(dataTransfer: DataTransfer | null, runtime: AiRuntime): boolean {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types);
  return types.includes(AI_CONTEXT_MIME) || runtime.drops.list().some((t) => types.includes(t.mime));
}

/** drop 에서 첨부 목록을 꺼낸다 — 전용 형식이 우선, 없으면 등록된 번역기. */
export function readContextDrag(dataTransfer: DataTransfer, runtime: AiRuntime): ContextRef[] {
  const raw = dataTransfer.getData(AI_CONTEXT_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ContextRef[];
      if (Array.isArray(parsed)) return parsed.filter((r) => r && typeof r.id === "string" && typeof r.kind === "string");
    } catch {
      /* 손상된 데이터는 번역기로 */
    }
  }
  for (const translator of runtime.drops.list()) {
    const data = dataTransfer.getData(translator.mime);
    if (!data) continue;
    try {
      const refs = translator.translate(data);
      if (refs.length) return refs;
    } catch {
      /* 다음 번역기 */
    }
  }
  return [];
}

const HANDLE_PREFIX: Record<string, string> = {
  block: "블록",
  slot: "슬롯",
  selection: "선택",
  "text-range": "선택",
  "slot-range": "선택",
  page: "페이지",
  node: "노드",
  reference: "참조",
  "ref-region": "영역",
  "ref-text": "발췌",
  backdata: "근거",
  variable: "변수",
  staged: "변경안",
  template: "서식",
  message: "답변",
  image: "이미지",
  document: "문서",
};

/** 입력창에 들어갈 짧은 이름: 종류별 번호 (`@블록1`, `@영역2`). */
export function assignHandle(ref: ContextRef, existing: ContextRef[]): string {
  const prefix = HANDLE_PREFIX[ref.kind] ?? "첨부";
  const used = new Set(existing.map((r) => r.handle).filter(Boolean));
  for (let n = 1; ; n++) {
    const handle = `@${prefix}${n}`;
    if (!used.has(handle)) return handle;
  }
}

export function sameContext(a: ContextRef, b: ContextRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}
