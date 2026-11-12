#!/usr/bin/env node
/**
 * 기준선과 새 캡처를 비교해 Markdown 보고서를 낸다.
 *
 * 사용 (apps/studio 에서):
 *   node tests/baseline/sidebar/diffContract.mjs <baseline.contract.json> <next.contract.json> \
 *        [baseline.orphans.json next.orphans.json]
 *
 * 줄어든 것(사라진 동작 · 진입점 · 새 고아)은 "제거"로, 늘어난 것은 "추가"로 적는다.
 * 제거가 의도된 것이면 PR 에 그 목록을 그대로 옮겨 적고 기준선을 갱신한다.
 */
import fs from "node:fs";

const [baseFile, nextFile, baseOrphansFile, nextOrphansFile] = process.argv.slice(2);
if (!baseFile || !nextFile) {
  console.error("usage: diffContract.mjs <baseline.json> <next.json> [baseline.orphans.json next.orphans.json]");
  process.exit(2);
}
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const base = read(baseFile);
const next = read(nextFile);

const lines = [];
let removedCount = 0;
const setDiff = (a, b) => [...a].filter((x) => !b.has(x));

lines.push("## 행 종류별 동작");
const kinds = [...new Set([...Object.keys(base.rowKinds), ...Object.keys(next.rowKinds)])].sort();
lines.push("| 행 종류 | 제거된 동작 | 추가된 동작 | 행 수 (기준 → 새) |", "|---|---|---|---|");
for (const kind of kinds) {
  const a = new Set(Object.keys(base.rowKinds[kind]?.actions ?? {}));
  const b = new Set(Object.keys(next.rowKinds[kind]?.actions ?? {}));
  const removed = setDiff(a, b);
  const added = setDiff(b, a);
  removedCount += removed.length;
  if (!base.rowKinds[kind]) lines.push(`| ${kind} | (기준선에 없던 행 종류) | ${added.join(", ") || "—"} | — → ${next.rowKinds[kind].rows} |`);
  else if (!next.rowKinds[kind]) lines.push(`| ${kind} | **행 종류 자체가 사라짐** (${[...a].join(", ")}) | — | ${base.rowKinds[kind].rows} → 0 |`);
  else lines.push(`| ${kind} | ${removed.map((x) => `**${x}**`).join(", ") || "—"} | ${added.join(", ") || "—"} | ${base.rowKinds[kind].rows} → ${next.rowKinds[kind].rows} |`);
}

for (const [key, label] of [
  ["sidebarTestIds", "사이드바 test id"],
  ["sidebarButtonTitles", "사이드바 버튼 툴팁 (행 밖)"],
]) {
  const a = new Set(base[key]);
  const b = new Set(next[key]);
  const removed = setDiff(a, b);
  const added = setDiff(b, a);
  removedCount += removed.length;
  lines.push("", `## ${label}`, `- 제거 (${removed.length}): ${removed.map((x) => `\`${x}\``).join(", ") || "없음"}`, `- 추가 (${added.length}): ${added.map((x) => `\`${x}\``).join(", ") || "없음"}`);
}

if (baseOrphansFile && nextOrphansFile) {
  const a = new Set(read(baseOrphansFile).orphans);
  const b = new Set(read(nextOrphansFile).orphans);
  const newOrphans = setDiff(b, a);
  const resolved = setDiff(a, b);
  removedCount += newOrphans.length;
  lines.push("", "## 고아 export (슬라이스 밖 사용처 0)", `- 새로 생긴 고아 (${newOrphans.length}): ${newOrphans.map((x) => `**\`${x}\`**`).join(", ") || "없음"}`, `- 해소되거나 삭제됨 (${resolved.length}): ${resolved.map((x) => `\`${x}\``).join(", ") || "없음"}`);
}

lines.unshift(`# 사이드바 계약 비교`, ``, `- 기준: \`${baseFile}\` (${base.meta?.capturedAt ?? "?"})`, `- 대상: \`${nextFile}\` (${next.meta?.capturedAt ?? "?"})`, `- 줄어든 항목 합계: **${removedCount}**`, ``);
process.stdout.write(lines.join("\n") + "\n");
process.exit(removedCount > 0 ? 1 : 0);
