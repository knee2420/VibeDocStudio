import assert from "node:assert/strict";
import { test } from "node:test";

import { buildHistory, changesSince, timeRange } from "../src/features/document-revisions/model/history";

const entry = (rev: number, at: string, slots: [string, string, string][], extra: Record<string, unknown> = {}) => ({
  rev,
  at,
  author: "human" as const,
  label: "편집",
  variables: [],
  slots: slots.map(([slotId, before, after]) => ({ slotId, label: slotId, before, after, author: "human" as const })),
  ...extra,
});

test("buildHistory: 20분 안의 자동 저장은 한 세션, 칸마다 처음 이전 · 마지막 이후", () => {
  const items = buildHistory([
    entry(1, "2026-11-16T05:00:00Z", [["a", "1", "2"]]),
    entry(2, "2026-11-16T05:10:00Z", [["a", "2", "3"], ["b", "x", "y"]]),
    entry(3, "2026-11-16T06:00:00Z", [["a", "3", "4"]]),
  ]);
  assert.equal(items.length, 2);
  const [latest, first] = items;
  assert.equal(latest.type === "session" && latest.fromRev, 3);
  assert.ok(first.type === "session");
  if (first.type !== "session") return;
  assert.deepEqual(first.slotIds, ["a", "b"]);
  assert.equal(first.before.a, "1");
  assert.equal(first.after.a, "3");
  assert.equal(first.saves, 2);
});

test("buildHistory: AI 실행은 실행마다 따로, 이름 붙인 버전은 세션을 끊는다", () => {
  const items = buildHistory(
    [
      entry(1, "2026-11-16T05:00:00Z", [["a", "1", "2"]]),
      entry(2, "2026-11-16T05:01:00Z", [["b", "1", "2"]], { author: "ai", runId: "r1", harnessId: "gemini" }),
      entry(3, "2026-11-16T05:02:00Z", [["c", "1", "2"]]),
      entry(5, "2026-11-16T05:03:00Z", [["c", "2", "3"]]),
    ],
    [{ id: "v", name: "제출본", rev: 4, at: "2026-11-16T05:02:30Z" }],
  );
  assert.deepEqual(
    items.map((i) => (i.type === "version" ? `v:${i.version.name}` : `${i.author}:${i.fromRev}-${i.toRev}`)),
    ["human:5-5", "v:제출본", "human:3-3", "ai:2-2", "human:1-1"],
  );
});

test("changesSince: 버전 이후 바뀐 칸만, 버전 당시 내용 → 마지막 내용", () => {
  const since = changesSince(
    [entry(1, "t", [["a", "0", "1"]]), entry(3, "t", [["a", "1", "2"]]), entry(4, "t", [["a", "2", "3"], ["b", "p", "q"]])],
    2,
  );
  assert.deepEqual(since.slotIds, ["a", "b"]);
  assert.equal(since.before.a, "1");
  assert.equal(since.after.a, "3");
});

test("timeRange: 오전/오후가 같으면 한 번만", () => {
  const r = timeRange("2026-11-16T05:10:00Z", "2026-11-16T05:45:00Z");
  assert.ok(r.includes("–"));
});
