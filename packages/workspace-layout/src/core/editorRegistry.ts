import type React from "react";
import type { OpenResourceMode } from "./types";

export interface EditorSelectionSnapshot {
  readonly resourceId: string;
  readonly kind: "text" | "outline-nodes" | "canvas-nodes" | "custom";
  readonly summary: string;
  readonly text?: string;
  readonly nodeIds?: readonly string[];
  readonly lineRange?: readonly [number, number];
  /** 2D Canvas selection metadata */
  readonly pageId?: string;
  readonly blockIds?: readonly string[];
  readonly slotIds?: readonly string[];
  readonly linkedPaths?: readonly string[];
}

export interface EditorAiDirective {
  readonly resourceId: string;
  readonly prompt: string;
  readonly action?: "extract-md" | "extract-outline" | "enhance-slot" | "custom";
  readonly selection?: EditorSelectionSnapshot | null;
}

export type DocumentStructureNodeKind =
  | "page"
  | "section"
  | "block"
  | "slot"
  | "heading"
  | "branch"
  | "asset";

/**
 * 스키마 비의존 문서 내부 구조 프로젝션 (하단 Document Structure 패널 공용 계약).
 * `.vdoc` 스키마가 v1 → v2로 개편되어도 이 인터페이스만 맞추면 셸 UI는 무수정 유지된다.
 */
export interface DocumentStructureNode {
  readonly id: string;
  readonly kind: DocumentStructureNodeKind;
  readonly label: string;
  readonly badge?: string;
  readonly locked?: boolean;
  readonly hidden?: boolean;
  readonly active?: boolean;
  readonly children?: readonly DocumentStructureNode[];
}

export interface EditorAdapterCapabilities {
  readonly canEdit?: boolean;
  readonly supportsSourceToggle?: boolean;
  readonly supportsAiSelection?: boolean;
  /** true이면 패널 중앙 70% 드롭을 탭 도킹이 가로채지 않고 2D 캔버스로 통과시킨다. */
  readonly acceptsCanvasDrop?: boolean;
}

export interface EditorHostContext<TEnv = unknown> {
  readonly env: TEnv;
  readonly path: string;
  readonly tabId: string;
  readonly groupId: string;
  readonly viewType: string;
  readonly openLink: (target: string, mode?: OpenResourceMode) => void;
  readonly renameSelf: (newName: string) => { ok: boolean; newPath?: string; error?: string };
  readonly notifyDirty: (dirty: boolean) => void;
  readonly switchViewType: (nextViewType: string) => void;
  readonly reportSelection?: (selection: EditorSelectionSnapshot | null) => void;
  readonly dispatchAiDirective?: (directive: EditorAiDirective) => void;
}

export interface EditorOutlineHostContext<TEnv = unknown> {
  readonly env: TEnv;
  readonly path: string;
  readonly viewType: string;
  readonly openLink: (target: string, mode?: OpenResourceMode) => void;
}

export interface EditorSidePanelDef<TEnv = unknown> {
  readonly id: string;
  readonly label: string;
  readonly icon?: React.ComponentType<{ className?: string }>;
  readonly Component: React.ComponentType<{ host: EditorOutlineHostContext<TEnv> }>;
}

export interface DocumentEditorAdapter<TEnv = unknown> {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** File extensions without leading dot (supports compound like `"vdoc.json"` or `"*"`). */
  readonly extensions: readonly string[];
  /** Reserved slot for future suffix-based typed folders (e.g. `["collection", "skill"]`). */
  readonly folderKinds?: readonly string[];
  /** Optional content-aware matcher for schema version coexistence (e.g. vdoc-v1 vs vdoc-v2). */
  readonly match?: (path: string, contentPreview?: string) => boolean;
  /** Higher priority wins when selecting the default editor for an extension. Default: 0. */
  readonly priority?: number;
  readonly icon?: React.ComponentType<{ className?: string }>;
  readonly capabilities?: EditorAdapterCapabilities;
  readonly Component: React.ComponentType<{ host: EditorHostContext<TEnv> }>;
  /** Optional left-bottom Document Structure panel (e.g. Figma Pages & Elements / MD Outline). */
  readonly OutlineComponent?: React.ComponentType<{ host: EditorOutlineHostContext<TEnv> }>;
  /** Optional right-dock auxiliary panels (e.g. 2D Asset Hub / Block Inspector). */
  readonly sidePanels?: readonly EditorSidePanelDef<TEnv>[];
}

function matchSpecificity(path: string, extensions: readonly string[]): number {
  const leaf = (path.split("/").pop() ?? path).toLowerCase();
  let best = -1;
  for (const rawExt of extensions) {
    const clean = rawExt.replace(/^\./, "").toLowerCase();
    if (!clean) continue;
    if (clean === "*") {
      if (best < 0) best = 0;
      continue;
    }
    if (leaf.length > clean.length + 1 && leaf.endsWith(`.${clean}`)) {
      best = Math.max(best, clean.length);
    }
  }
  return best;
}

export class EditorRegistry<TEnv = unknown> {
  private readonly adapters = new Map<string, DocumentEditorAdapter<TEnv>>();

  register(adapter: DocumentEditorAdapter<TEnv>): () => void {
    this.adapters.set(adapter.id, adapter);
    return () => {
      if (this.adapters.get(adapter.id) === adapter) {
        this.adapters.delete(adapter.id);
      }
    };
  }

  getById(id: string): DocumentEditorAdapter<TEnv> | null {
    return this.adapters.get(id) ?? null;
  }

  listAll(): DocumentEditorAdapter<TEnv>[] {
    return Array.from(this.adapters.values()).sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    );
  }

  /**
   * Lists all compatible editors for a file path.
   * Specificity order: compound/longer extension > shorter extension > wildcard (`*`), then priority desc.
   */
  listForPath(path: string, contentPreview?: string): DocumentEditorAdapter<TEnv>[] {
    const scored: Array<{ adapter: DocumentEditorAdapter<TEnv>; specificity: number }> = [];

    for (const adapter of this.adapters.values()) {
      const spec = matchSpecificity(path, adapter.extensions);
      if (spec < 0) continue;
      if (adapter.match && !adapter.match(path, contentPreview)) continue;
      scored.push({ adapter, specificity: spec });
    }

    scored.sort((a, b) => {
      // Exact extensions (>0) always outrank wildcard (0); longer compound ext (vdoc.json) outranks shorter (json)
      if (a.specificity !== b.specificity) return b.specificity - a.specificity;
      return (b.adapter.priority ?? 0) - (a.adapter.priority ?? 0);
    });

    return scored.map((item) => item.adapter);
  }

  resolveDefault(path: string, contentPreview?: string): DocumentEditorAdapter<TEnv> | null {
    return this.listForPath(path, contentPreview)[0] ?? null;
  }

  resolveForTab(
    path: string,
    viewType?: string | null,
    contentPreview?: string
  ): DocumentEditorAdapter<TEnv> | null {
    if (viewType) {
      const explicit = this.getById(viewType);
      if (explicit) return explicit;
    }
    return this.resolveDefault(path, contentPreview);
  }
}

export function createEditorRegistry<TEnv = unknown>(
  initialAdapters: readonly DocumentEditorAdapter<TEnv>[] = []
): EditorRegistry<TEnv> {
  const registry = new EditorRegistry<TEnv>();
  for (const adapter of initialAdapters) {
    registry.register(adapter);
  }
  return registry;
}
