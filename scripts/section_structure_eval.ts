/**
 * 섹션 · 컨테이너 중심 구조 채점기 (측정만 — 실행은 화면에서).
 * docs/specs/v2-section-container-structure.md §P4 CP4 기준을 잰다.
 *
 * usage: tsx scripts/section_structure_eval.ts <vaultRoot> <outlineRel> <originalOutlineFile> <userRootNodeId>
 *   - 사용자 불릿(원본 스냅샷의 userRoot 서브트리)이 그대로인지
 *   - userRoot 아래 새 <<doc>> 가지의 계층 문법 · 섹션 · 컨테이너 · 인용
 *   - 묶인 .vdoc 의 섹션 단위 · 동형 · evidenceLinks · 본문+그림 다단
 */
import fs from "node:fs";
import path from "node:path";

import {
  createElementSyntaxRegistry,
  measureOutlineVDocIsomorphism,
  parseOutlineDirective,
  validateOutlineHierarchy,
  validateVDocHierarchy,
  type LayoutBlock,
  type OutlineSyntaxNode,
  type VDocDocument,
} from "../packages/vdoc-schema/src/index";

const [vaultRoot, outlineRel, originalFile, userRootId] = process.argv.slice(2);
if (!vaultRoot || !outlineRel || !originalFile || !userRootId) {
  console.error("usage: tsx scripts/section_structure_eval.ts <vaultRoot> <outlineRel> <originalOutlineFile> <userRootNodeId>");
  process.exit(2);
}

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf-8"));
const outline = readJson(path.join(vaultRoot, outlineRel));
const original = readJson(originalFile);

const find = (nodes: OutlineSyntaxNode[], id: string): OutlineSyntaxNode | null => {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = find(n.children ?? [], id);
    if (hit) return hit;
  }
  return null;
};
const flat = (n: OutlineSyntaxNode, skipDoc: boolean): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (x: OutlineSyntaxNode) => {
    if (skipDoc && parseOutlineDirective(x.text)?.kind === "doc") return;
    out[x.id] = x.text;
    (x.children ?? []).forEach(walk);
  };
  walk(n);
  return out;
};

const origRoot = find(original.rootNodes, userRootId)!;
const curRoot = find(outline.rootNodes, userRootId);
const before = flat(origRoot, true);
const after = curRoot ? flat(curRoot, true) : {};
const changedUserBullets = Object.keys(before).filter((id) => after[id] !== before[id]);
const addedPlainBullets = Object.keys(after).filter((id) => !(id in before));

const docNodes: OutlineSyntaxNode[] = [];
const collectDocs = (n: OutlineSyntaxNode) => {
  if (parseOutlineDirective(n.text)?.kind === "doc") docNodes.push(n);
  (n.children ?? []).forEach(collectDocs);
};
if (curRoot) collectDocs(curRoot);

let registry = createElementSyntaxRegistry();
const vsyntax = path.join(vaultRoot, ".vibedoc/element-registry.vsyntax");
if (fs.existsSync(vsyntax)) registry = createElementSyntaxRegistry(fs.readFileSync(vsyntax, "utf-8"));

const results = docNodes.map((docNode) => {
  const h = validateOutlineHierarchy(outline.rootNodes, docNode.id, registry);
  const binding = outline.docBindings?.[docNode.id];
  let vdoc: Record<string, unknown> | null = null;
  if (binding?.vdocPath) {
    const rel = String(binding.vdocPath).replace(/^vault:\/\//, "");
    const full = path.join(vaultRoot, rel);
    if (fs.existsSync(full)) {
      const doc = readJson(full) as VDocDocument;
      const vr = validateVDocHierarchy(doc);
      const iso = measureOutlineVDocIsomorphism(h, doc);
      let mixedColumns = 0;
      const walk = (blocks: readonly LayoutBlock[]) => {
        for (const b of blocks) {
          const cols = (b as { columns?: { blocks?: LayoutBlock[]; image?: unknown }[] }).columns;
          if (b.kind === "columns-grid" && cols) {
            const kinds = cols.map((c) => new Set((c.blocks ?? []).map((x) => x.kind).concat(c.image ? ["image"] : [])));
            const hasImg = kinds.some((k) => k.has("image"));
            const hasText = kinds.some((k) => [...k].some((x) => x !== "image"));
            if (hasImg && hasText) mixedColumns += 1;
            for (const c of cols) if (c.blocks) walk(c.blocks);
          }
        }
      };
      for (const p of doc.pages) walk(p.blocks);
      vdoc = {
        path: rel,
        units: vr.unitCount,
        sectionUnits: vr.sectionUnitCount,
        boundUnits: vr.boundUnitCount,
        vdocErrors: vr.issues.filter((i) => i.severity === "error").map((i) => i.code),
        isomorphism: `${iso.matched}/${iso.expected}`,
        evidenceLinks: doc.evidenceLinks?.length ?? 0,
        mixedTextImageColumns: mixedColumns,
      };
    }
  }
  return {
    docNodeId: docNode.id,
    directive: docNode.text.slice(0, 80),
    hierarchyOk: h.ok,
    hierarchyErrors: h.issues.filter((i) => i.severity === "error").map((i) => `${i.code}@${i.nodeId}`),
    sections: h.sectionNodeIds.length,
    columnSections: h.columnSectionNodeIds.length,
    blocks: h.blockCount,
    citations: h.citationCount,
    vdoc,
  };
});

console.log(
  JSON.stringify(
    {
      outline: outlineRel,
      userBullets: Object.keys(before).length,
      changedUserBullets,
      addedPlainBulletsOutsideDoc: addedPlainBullets,
      docBranches: results,
    },
    null,
    2
  )
);
