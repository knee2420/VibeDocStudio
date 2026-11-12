#!/usr/bin/env node
/**
 * 고아 export 탐지: 슬라이스 public API(`<layer>/<slice>/index.ts`)가 내보내는 값 중
 * 그 슬라이스 밖 어디에서도 쓰이지 않는 이름을 찾는다.
 * (예: 진입 버튼을 지우면 다이얼로그 컴포넌트가 export 만 남고 아무도 열지 않게 된다.)
 *
 * 사용: node tests/baseline/sidebar/orphanExports.mjs [srcDir] > out.json   (apps/studio 에서)
 * 타입 전용 export(`export type`)는 제외한다. `export *` 는 따라가지 않고 목록에 표시만 한다.
 */
import fs from "node:fs";
import path from "node:path";

const srcDir = path.resolve(process.argv[2] ?? "src");
const LAYERS = ["entities", "features", "widgets"];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function exportedValueNames(indexSource) {
  const names = new Set();
  const starExports = [];
  // export { a, b as c } from "./x";   (export type { ... } 는 건너뛴다)
  for (const m of indexSource.matchAll(/export\s+(type\s+)?\{([^}]*)\}/g)) {
    if (m[1]) continue;
    for (const part of m[2].split(",")) {
      const p = part.trim();
      if (!p || p.startsWith("type ")) continue;
      const alias = p.split(/\s+as\s+/).pop().trim();
      if (alias) names.add(alias);
    }
  }
  for (const m of indexSource.matchAll(/export\s+(?:const|function|class|let)\s+(\w+)/g)) names.add(m[1]);
  for (const m of indexSource.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) starExports.push(m[1]);
  return { names: [...names], starExports };
}

const files = walk(srcDir);
const contents = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

const result = { srcDir: path.relative(process.cwd(), srcDir) || ".", orphans: [], starExports: [] };
for (const layer of LAYERS) {
  const layerDir = path.join(srcDir, layer);
  if (!fs.existsSync(layerDir)) continue;
  for (const slice of fs.readdirSync(layerDir)) {
    const sliceDir = path.join(layerDir, slice);
    const index = path.join(sliceDir, "index.ts");
    if (!fs.existsSync(index)) continue;
    const { names, starExports } = exportedValueNames(contents.get(index) ?? fs.readFileSync(index, "utf8"));
    for (const s of starExports) result.starExports.push(`${layer}/${slice} -> ${s}`);
    for (const name of names) {
      const re = new RegExp(`\\b${name}\\b`);
      let used = false;
      for (const [file, text] of contents) {
        if (file.startsWith(sliceDir + path.sep)) continue;
        if (re.test(text)) {
          used = true;
          break;
        }
      }
      if (!used) result.orphans.push(`${layer}/${slice}:${name}`);
    }
  }
}
result.orphans.sort();
result.starExports.sort();
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
