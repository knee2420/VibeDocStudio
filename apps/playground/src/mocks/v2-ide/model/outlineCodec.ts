import type { OutlineNode, ViewMode } from "@vibe/outliner";

/** `.outline` 파일 (불릿 트리 문서) 의 저장 형식 */
export interface OutlineFilePayload {
  version: number;
  id: string;
  title: string;
  defaultView: ViewMode;
  createdAt?: string;
  updatedAt?: string;
  rootNodes: OutlineNode[];
}

export function parseOutlineJson(raw: string, fallbackTitle: string): OutlineFilePayload {
  try {
    const parsed = JSON.parse(raw) as Partial<OutlineFilePayload>;
    if (Array.isArray(parsed.rootNodes)) {
      return {
        version: typeof parsed.version === "number" ? parsed.version : 1,
        id: typeof parsed.id === "string" ? parsed.id : `outline-${Date.now()}`,
        title: typeof parsed.title === "string" ? parsed.title : fallbackTitle,
        defaultView: parsed.defaultView === "board" ? "board" : "bullets",
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        rootNodes: parsed.rootNodes,
      };
    }
  } catch {
    // Fallback to single-bullet outline if file is empty or malformed
  }
  return {
    version: 1,
    id: `outline-${Date.now()}`,
    title: fallbackTitle,
    defaultView: "bullets",
    rootNodes: [
      {
        id: "node-1",
        text: raw.trim() || "",
        isFolded: false,
        children: [],
      },
    ],
  };
}

function randomNodeId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/**
 * 새 `.outline` 파일의 처음 내용: 제목은 파일 이름, 불릿은 빈 것 하나.
 * (제목을 첫 불릿에 한 번 더 넣거나 안내 문구를 실제 내용으로 넣지 않는다 — 지우는 일만 늘어난다.)
 */
export function createDefaultOutlineJson(title: string): string {
  const now = new Date().toISOString();
  const payload: OutlineFilePayload = {
    version: 1,
    id: `outline-${Date.now().toString(36)}`,
    title,
    defaultView: "bullets",
    createdAt: now,
    updatedAt: now,
    rootNodes: [{ id: randomNodeId(), text: "", isFolded: false, children: [] }],
  };
  return JSON.stringify(payload, null, 2);
}

export function isOutlinePath(path: string): boolean {
  return /\.outline$/i.test(path);
}
