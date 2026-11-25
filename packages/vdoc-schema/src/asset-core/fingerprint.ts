/**
 * 구조 지문 — 내용 · 스타일 · 필드 이름을 뺀 구조만으로 만든 결정적 키.
 * 같은 모양의 블록(예: 요구사항 정의 표 4개)은 내용이 달라도 지문이 같다 → 한 에셋.
 */
import { hashOutlineSourceInput } from "../asset-kit/validator";
import { canonicalComponentId } from "./registry";
import { normalizeLabel, type SkelNode } from "./skeleton";

function canon(nodes: readonly SkelNode[]): unknown[] {
  return nodes.map((n) => {
    switch (n.t) {
      case "label":
        return ["L", n.role, normalizeLabel(n.text)];
      case "field":
        return ["F", n.role, n.field.type];
      case "divider":
        return ["D"];
      case "repeat":
        return ["R", canon(n.children)];
      case "container":
        return ["C", canonicalComponentId(n.component), canon(n.children)];
      case "grid":
        return [
          "G",
          canonicalComponentId(n.component),
          n.rows.map((row) => [
            row.repeat ? "*" : "",
            row.cells.map((c) => [
              c.rs ?? 1,
              c.cs ?? 1,
              c.role,
              c.text !== undefined ? ["L", normalizeLabel(c.text)] : c.field ? ["F", c.field.type] : ["N", canon(c.nodes ?? [])],
            ]),
          ]),
        ];
    }
  });
}

export function skeletonFingerprint(nodes: readonly SkelNode[]): string {
  return hashOutlineSourceInput(JSON.stringify(canon(nodes)));
}

/** 모양만 (고정 글도 빼고) — "비슷한 에셋" 후보 찾기용. */
export function skeletonShapeFingerprint(nodes: readonly SkelNode[]): string {
  const strip = (v: unknown): unknown =>
    Array.isArray(v) ? (v[0] === "L" && typeof v[2] === "string" ? ["L", v[1]] : v[0] === "L" && v.length === 2 ? ["L"] : v.map(strip)) : v;
  return hashOutlineSourceInput(JSON.stringify(strip(canon(nodes))));
}
