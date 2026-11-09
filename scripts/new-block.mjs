#!/usr/bin/env node
/**
 * 새 블록 종류 뼈대 만들기 — 모델 정의 · 타입 · 뷰 파일을 만들고 목록 · 레지스트리에 등록한다.
 *
 *   node scripts/new-block.mjs <kind> "<이름>"      예) node scripts/new-block.mjs quote-box "인용 상자"
 *
 * 만든 뒤: 정의(`kinds/<kind>.ts`)의 슬롯 · 단위 · 아웃라인 · AI 부분과 뷰를 채우고 `pnpm test` 로 규격 검사를 통과시킨다.
 * 자세한 규칙은 packages/vdoc-schema/BLOCKS.md.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [kind, label = kind] = process.argv.slice(2);

if (!kind || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(kind)) {
  console.error('사용법: node scripts/new-block.mjs <kind(kebab-case)> "<이름>"');
  process.exit(1);
}

const pascal = kind.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const camel = pascal[0].toLowerCase() + pascal.slice(1);
const p = (...parts) => join(root, ...parts);
const files = {
  baseBlock: p("packages", "vdoc-schema", "src", "base-block.ts"),
  blocksIndex: p("packages", "vdoc-schema", "src", "blocks", "index.ts"),
  type: p("packages", "vdoc-schema", "src", "blocks", `${kind}-block.ts`),
  kitIndex: p("packages", "vdoc-schema", "src", "block-kit", "index.ts"),
  model: p("packages", "vdoc-schema", "src", "block-kit", "kinds", `${kind}.ts`),
  viewsIndex: p("packages", "slot-canvas", "src", "block-views", "index.ts"),
  view: p("packages", "slot-canvas", "src", "block-views", "views", `${pascal}BlockView.tsx`),
};

if (readFileSync(files.baseBlock, "utf-8").includes(`"${kind}",`) || existsSync(files.model)) {
  console.error(`이미 있는 블록 종류입니다: ${kind}`);
  process.exit(1);
}

/** 문자열 안의 표식 앞에 끼워 넣는다 (표식이 없으면 실패). */
function insertBefore(path, marker, text, { from } = {}) {
  const source = readFileSync(path, "utf-8");
  const start = from ? source.indexOf(from) : 0;
  const at = source.indexOf(marker, Math.max(start, 0));
  if (start === -1 || at === -1) throw new Error(`${path}: '${marker}' 를 찾지 못했습니다`);
  writeFileSync(path, source.slice(0, at) + text + source.slice(at));
}

function insertAfterLast(path, pattern, text) {
  const source = readFileSync(path, "utf-8");
  const matches = [...source.matchAll(pattern)];
  if (matches.length === 0) throw new Error(`${path}: ${pattern} 를 찾지 못했습니다`);
  const last = matches[matches.length - 1];
  const at = last.index + last[0].length;
  writeFileSync(path, source.slice(0, at) + text + source.slice(at));
}

// 1) 타입
writeFileSync(
  files.type,
  `import type { BaseLayoutBlock } from "../base-block";

/** ${label} */
export interface ${pascal}BlockDef extends BaseLayoutBlock {
  kind: "${kind}";
  slotId: string;
}
`
);

// 2) 모델 정의
writeFileSync(
  files.model,
  `import type { ${pascal}BlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { makeSlot, outlineSingleSlot } from "./shared";

/** ${label} — TODO: 슬롯 · 선택 단위 · 아웃라인 · AI 부분을 블록 모양에 맞게 채운다 (BLOCKS.md). */
export const ${camel}Block = defineBlockKind<${pascal}BlockDef>({
  kinds: ["${kind}"],
  label: "${label}",
  category: "layout",
  icon: "square",
  slotIds: (b) => (b.slotId ? [b.slotId] : []),
  outline: (b, ctx) => outlineSingleSlot(b.slotId, ctx),
  insertable: {
    label: "${label}",
    description: "${label} 블록",
    create: ({ suffix, defaultBackdataRefs = [] }) => {
      const slots = {};
      const body = makeSlot(slots, \`slot_${kind.replace(/-/g, "_")}_\${suffix}\`, "${label} 본문", "<p></p>", defaultBackdataRefs);
      return { block: { blockId: \`blk_${kind.replace(/-/g, "_")}_\${suffix}\`, kind: "${kind}", title: "${label}", slotId: body }, slots, focusSlotId: body };
    },
  },
  ai: { editableProps: {} },
});
`
);

// 3) 뷰
writeFileSync(
  files.view,
  `import type { ${pascal}BlockDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

/** ${label} — 슬롯은 ctx.renderSlot, 슬롯이 아닌 요소는 ctx.unitAttrs(unitId, "media") 를 붙여 그린다. */
export const ${camel}View = defineBlockView<${pascal}BlockDef>({
  kinds: ["${kind}"],
  View: ({ block, ctx }) => <div className="rounded-md border border-slate-200 p-3">{ctx.renderSlot(block.slotId)}</div>,
});
`
);

// 4) 목록 · 레지스트리 등록
insertBefore(files.baseBlock, "] as const;", `  "${kind}",\n`, { from: "LAYOUT_BLOCK_KINDS" });
insertAfterLast(files.blocksIndex, /^import type .*;$/gm, `\nimport type { ${pascal}BlockDef } from "./${kind}-block";`);
insertAfterLast(files.blocksIndex, /^export \* from .*;$/gm, `\nexport * from "./${kind}-block";`);
insertBefore(files.blocksIndex, ";", `\n  | ${pascal}BlockDef`, { from: "export type LayoutBlock =" });
insertAfterLast(files.kitIndex, /^import \{ \w+ \} from "\.\/kinds\/.*";$/gm, `\nimport { ${camel}Block } from "./kinds/${kind}";`);
insertBefore(files.kitIndex, "] as const;", `  ${camel}Block,\n`, { from: "BUILTIN_BLOCK_KINDS" });
insertAfterLast(files.viewsIndex, /^import \{ \w+ \} from "\.\/views\/.*";$/gm, `\nimport { ${camel}View } from "./views/${pascal}BlockView";`);
insertBefore(files.viewsIndex, "] as const;", `  ${camel}View,\n`, { from: "BUILTIN_BLOCK_VIEWS" });

console.log(`블록 종류 '${kind}' (${label}) 뼈대를 만들었습니다:
  - ${files.type}
  - ${files.model}
  - ${files.view}
  + LAYOUT_BLOCK_KINDS · LayoutBlock 합 타입 · 모델/뷰 레지스트리 등록
다음: 정의와 뷰를 채우고 'pnpm test' (블록 규격 검사) 를 통과시키세요.`);
