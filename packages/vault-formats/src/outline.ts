import type { OutlineNode, ViewMode } from "@vibe/outliner/core";
import type { EvidenceLocator } from "@vibe/vdoc-schema";
import { type VaultPort, type VaultRenameRewriter } from "@vibe/vault-core";
import { rewriteVaultUriPrefix, toVaultUri } from "./vdoc";

/** 1:N 마스터 `.outline` 안의 특정 지시어 노드(`nodeId`)와 바인딩된 `.vdoc` 포인터. */
export interface OutlineDocBinding {
  /** 바인딩된 `.vdoc` 의 불변 고유 ID (`VDocDocument.docId`). 파일·폴더 이동 시 경로 자가 치유에 사용된다. */
  readonly docId?: string;
  /** 볼트 내 `.vdoc` 포인터 (예: `"vault://워크샵/블로그_후기.vdoc"`). */
  readonly vdocPath: string;
  /** 바인딩 당시 문서 프로파일 ID (예: `"blog"`, `"a4"`, `"web"`). */
  readonly profileId?: string;
  /** 마지막 동기화 시각 (ISO 8601). */
  readonly lastSyncedAt?: string;
}

/** `.outline` 파일 (불릿 트리 문서) 의 저장 형식 */
export interface OutlineFilePayload {
  version: number;
  id: string;
  title: string;
  defaultView: ViewMode;
  createdAt?: string;
  updatedAt?: string;
  /** 불변 `nodeId -> .vdoc 바인딩` 맵 (1개 `.outline` 에 N개 `.vdoc` 문서 연결 가능). */
  docBindings?: Record<string, OutlineDocBinding>;
  /** 불변 `nodeId -> EvidenceLocator[]` 사이드카 맵 (코어 OutlineNode 를 변형하지 않고 근거를 보관). */
  nodeEvidence?: Record<string, EvidenceLocator[]>;
  rootNodes: OutlineNode[];
}

export function parseOutlineJson(raw: string, fallbackTitle: string): OutlineFilePayload {
  try {
    const parsed = JSON.parse(raw) as Partial<OutlineFilePayload>;
    if (Array.isArray(parsed.rootNodes)) {
      const docBindings =
        parsed.docBindings && typeof parsed.docBindings === "object"
          ? parsed.docBindings
          : undefined;
      const nodeEvidence =
        parsed.nodeEvidence && typeof parsed.nodeEvidence === "object"
          ? parsed.nodeEvidence
          : undefined;
      return {
        version: typeof parsed.version === "number" ? parsed.version : 1,
        id: typeof parsed.id === "string" ? parsed.id : `outline-${Date.now()}`,
        title: typeof parsed.title === "string" ? parsed.title : fallbackTitle,
        defaultView: parsed.defaultView === "board" ? "board" : "bullets",
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        ...(docBindings && Object.keys(docBindings).length > 0 ? { docBindings } : {}),
        ...(nodeEvidence && Object.keys(nodeEvidence).length > 0 ? { nodeEvidence } : {}),
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

export function serializeOutlineJson(payload: OutlineFilePayload): string {
  return JSON.stringify(payload, null, 2);
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

/**
 * Vault 내 `.vdoc` 파일 또는 상위 폴더가 이름변경/이동되었을 때 모든 `.outline` 파일의
 * `docBindings[*].vdocPath` (`vault://<oldPath>` 및 하위 경로) 포인터를 자동 갱신한다.
 */
export const rewriteOutlineBindingsOnRename: VaultRenameRewriter = (
  vault: VaultPort,
  oldPath: string,
  newPath: string
) => {
  const oldUri = toVaultUri(oldPath);
  const updatedFiles: string[] = [];
  let totalReplacements = 0;

  for (const node of vault.listAll()) {
    if (node.kind !== "file" || !isOutlinePath(node.path)) continue;
    const raw = vault.read(node.path);
    if (!raw.includes(oldUri)) continue;

    try {
      const payload = parseOutlineJson(raw, node.stem);
      if (!payload.docBindings) continue;
      let fileReplacements = 0;
      const nextBindings: Record<string, OutlineDocBinding> = {};

      for (const [nodeId, binding] of Object.entries(payload.docBindings)) {
        const rewritten = rewriteVaultUriPrefix(binding.vdocPath, oldPath, newPath);
        if (rewritten !== binding.vdocPath) {
          fileReplacements += 1;
          nextBindings[nodeId] = { ...binding, vdocPath: rewritten };
        } else {
          nextBindings[nodeId] = binding;
        }
      }

      if (fileReplacements > 0) {
        vault.write(
          node.path,
          serializeOutlineJson({
            ...payload,
            docBindings: nextBindings,
          })
        );
        updatedFiles.push(node.path);
        totalReplacements += fileReplacements;
      }
    } catch {
      // Skip malformed outline safely
    }
  }

  return { updatedFiles, totalReplacements };
};
