/**
 * 패키지 경계 검사 — `tests/architecture/package-layers.json` 의 역할 층을 코드가 지키는지 본다.
 *
 *   node --test tests/architecture
 *
 * 1. 모든 TS 패키지 · 앱이 층 표에 있다 (새 패키지는 역할을 정해야 들어온다).
 * 2. import 방향: 낮은 층 → 높은 층 금지. subpath 입구는 그 층으로 친다.
 * 3. 패키지 안에서 쓰는 @vibe/* 는 package.json 에 선언돼 있고, 선언한 @vibe/* 는 실제로 쓴다.
 * 4. 'ai' 태그 패키지는 ai 가 아닌 화면 · 도메인 패키지가 import 하지 않는다.
 * 5. pure 층(foundation · schema · domain)은 React 를 import 하지 않는다.
 * 6. 패키지 소스는 자기 폴더 밖으로 상대 경로 import 하지 않고, 앱을 import 하지 않는다.
 * 7. 앱은 패키지 내부 경로(`@vibe/x/src/…`)를 import 하지 않는다.
 * 8. 앱 목업은 볼트 파일 형식을 직접 파싱하지 않는다 (appThinness).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/architecture/package-layers.json"), "utf8"));
const LAYER_RANK = Object.fromEntries(SPEC.layers.map((l, i) => [l, i]));
const PURE = new Set(SPEC.pureLayers);

function listWorkspaceProjects() {
  const out = [];
  for (const group of ["packages", "apps"]) {
    for (const name of fs.readdirSync(path.join(ROOT, group))) {
      const dir = path.join(ROOT, group, name);
      const pj = path.join(dir, "package.json");
      if (!fs.existsSync(pj)) continue;
      const json = JSON.parse(fs.readFileSync(pj, "utf8"));
      const spec = SPEC.packages[json.name];
      const srcDirs = (spec?.sourceDirs ?? ["src"]).map((d) => path.join(dir, d)).filter((d) => fs.existsSync(d));
      if (!srcDirs.length) continue; // 파이썬 · 데이터 전용 (소스 없음)
      out.push({ name: json.name, dir, json, srcDirs, spec, isApp: group === "apps" });
    }
  }
  return out;
}

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(ent.name) && !/\.d\.ts$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(file) {
  const src = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out = [];
  for (const m of src.matchAll(IMPORT_RE)) out.push(m[1] ?? m[2]);
  return out;
}

function splitVibe(spec) {
  const m = /^(@vibe\/[a-z0-9-]+)(\/.*)?$/.exec(spec);
  return m ? { pkg: m[1], sub: m[2] ? `.${m[2]}` : "." } : null;
}

function layerOfImport(pkg, sub) {
  const spec = SPEC.packages[pkg];
  if (!spec) return null;
  const subLayer = spec.subpaths?.[sub] ?? Object.entries(spec.subpaths ?? {}).find(([k]) => sub.startsWith(`${k}/`))?.[1];
  return subLayer ?? spec.layer;
}

const projects = listWorkspaceProjects();
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");

describe("package boundaries", () => {
  it("모든 TS 패키지 · 앱이 층 표에 있다", () => {
    const missing = projects.filter((p) => !p.spec).map((p) => p.name);
    assert.deepEqual(missing, [], `층 표(package-layers.json)에 없는 패키지: ${missing.join(", ")}`);
  });

  const violations = { direction: [], undeclared: [], unused: [], ai: [], react: [], escape: [], deep: [] };
  for (const p of projects) {
    if (!p.spec) continue;
    const myRank = LAYER_RANK[p.spec.layer];
    const declared = new Set(Object.keys({ ...p.json.dependencies, ...p.json.peerDependencies, ...p.json.devDependencies }).filter((d) => d.startsWith("@vibe/")));
    const used = new Set();
    const isAi = (p.spec.tags ?? []).includes("ai");
    for (const dir of p.srcDirs) {
      for (const file of walk(dir)) {
        for (const spec of importsOf(file)) {
          const where = `${rel(file)} → ${spec}`;
          const v = splitVibe(spec);
          if (v) {
            if (v.pkg === p.name) continue;
            used.add(v.pkg);
            const target = SPEC.packages[v.pkg];
            const tLayer = layerOfImport(v.pkg, v.sub);
            if (tLayer && LAYER_RANK[tLayer] > myRank) violations.direction.push(`${where} (${p.spec.layer} → ${tLayer})`);
            if (!declared.has(v.pkg)) violations.undeclared.push(`${where} (package.json 에 없음)`);
            if (target && (target.tags ?? []).includes("ai") && !isAi && p.spec.layer !== "adapter" && p.spec.layer !== "app") violations.ai.push(where);
            if (p.isApp && /\/src(\/|$)/.test(v.sub)) violations.deep.push(where);
            continue;
          }
          if (PURE.has(p.spec.layer) && /^(react|react-dom|lucide-react)(\/|$)/.test(spec)) violations.react.push(where);
          if (spec.startsWith(".")) {
            const resolved = path.resolve(path.dirname(file), spec);
            if (!resolved.startsWith(p.dir + path.sep) && resolved !== p.dir) violations.escape.push(where);
          }
          if (!p.isApp && (/^@\//.test(spec) || /(^|\/)apps\//.test(spec))) violations.escape.push(`${where} (앱 import)`);
        }
      }
    }
    if (!p.isApp) {
      for (const d of declared) if (!used.has(d)) violations.unused.push(`${p.name} 이 선언만 하고 쓰지 않는다: ${d}`);
    }
  }

  it("낮은 층은 높은 층을 import 하지 않는다", () => assert.deepEqual(violations.direction, []));
  it("쓰는 @vibe/* 는 package.json 에 선언한다", () => assert.deepEqual(violations.undeclared, []));
  it("선언한 @vibe/* 는 실제로 쓴다", () => assert.deepEqual(violations.unused, []));
  it("AI 패키지는 어댑터 · 앱 · AI 패키지만 import 한다", () => assert.deepEqual(violations.ai, []));
  it("pure 층은 React 를 모른다", () => assert.deepEqual(violations.react, []));
  it("패키지는 자기 폴더 밖 · 앱을 import 하지 않는다", () => assert.deepEqual(violations.escape, []));
  it("앱은 패키지 내부 경로를 import 하지 않는다", () => assert.deepEqual(violations.deep, []));

  it("앱 목업은 볼트 파일 형식을 직접 파싱하지 않는다", () => {
    const rules = SPEC.appThinness;
    const found = [];
    for (const root of rules.roots) {
      for (const file of walk(path.join(ROOT, root))) {
        const r = rel(file);
        if (rules.exclude.some((x) => r.includes(x))) continue;
        const text = fs.readFileSync(file, "utf8");
        for (const f of rules.forbidden) {
          const re = new RegExp(f.pattern, "g");
          for (const m of text.matchAll(re)) {
            const line = text.slice(0, m.index).split("\n").length;
            found.push(`${r}:${line} — ${f.why}`);
          }
        }
      }
    }
    assert.deepEqual(found, []);
  });
});
