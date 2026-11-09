/** 블록 뷰 레지스트리 — `kind` → 화면 컴포넌트. 기본 뷰는 `index.ts` 가 등록한다. */
import type { LayoutBlock } from "@vibe/vdoc-schema";

import type { BlockViewDefinition } from "./contract";
import { GenericBlockView } from "./views/GenericBlockView";

const views = new Map<string, BlockViewDefinition>();

export function registerBlockView<B extends LayoutBlock>(definition: BlockViewDefinition<B>): void {
  for (const kind of definition.kinds) views.set(kind, definition as unknown as BlockViewDefinition);
}

export function getBlockView(kind: string): BlockViewDefinition {
  return views.get(kind) ?? { kinds: [kind], View: GenericBlockView };
}

export function hasBlockView(kind: string): boolean {
  return views.has(kind);
}

export function registeredBlockViewKinds(): string[] {
  return [...views.keys()];
}
