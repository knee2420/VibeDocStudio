/**
 * 에셋 평가 러너 — 실제 Composer 에이전트(agy)로 세 가지를 잰다.
 *   A. 처음 보는 양식 분해: 양식 그림만 주고 "에셋으로" → assets.register 결과를 정답과 채점
 *   B. 유사 데이터 적용: 같은 대화에서 다른 데이터(이름표가 다르고 · 개수가 다르고 · 남는 항목 있음)를 넣게 함
 *   C. 새 작업 설계: 빈 초안에서 반복이 있는 문서를 설계하게 하고 에셋 중심으로 짓는지 (assets.* vs dc_build)
 * 도구는 Composer 와 같은 명세(harness-packs/editor/tools.client.json)를 쓰고, 실행은 이 러너가 메모리에서 한다.
 *
 * 실행:  tsx scripts/asset_eval.ts [--cases a,b] [--skip-design] [--only-design] [--concurrency 3]
 * 결과:  evals/asset-forms/reports/<시각>.json · .md
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { AssistantClient } from "../packages/ai-kernel/src/client";
import type { AssistantEvent, ContextRef, ToolManifestEntry } from "../packages/ai-kernel/src/types";
import {
  collectFields,
  formatAssetIssues,
  instantiateAssetV3,
  mapItemsToAsset,
  scoreSkeleton,
  skeletonFingerprint,
  validateAssetV3,
  type AssetRecords,
  type AssetV3,
  type SourceItem,
} from "../packages/vdoc-schema/src";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CASES = join(ROOT, "evals", "asset-forms", "cases");
const REPORTS = join(ROOT, "evals", "asset-forms", "reports");
const VAULT = join(ROOT, "apps", "playground", "data", "vaults", "default-vault");
const API = process.env.VIBE_API ?? "http://127.0.0.1:8090";

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const only = arg("--cases")?.split(",");
const concurrency = Number(arg("--concurrency") ?? 3);
const skipDesign = argv.includes("--skip-design");
const onlyDesign = argv.includes("--only-design");

const toolsJson = JSON.parse(readFileSync(join(ROOT, "packages", "harness-packs", "editor", "tools.client.json"), "utf8")) as ToolManifestEntry[];
const ASSET_TOOLS = ["assets.register", "assets.list", "assets.instantiate", "assets.capture", "assets.apply"];
const manifest: ToolManifestEntry[] = toolsJson.filter((t) => ASSET_TOOLS.includes(t.name) || t.name === "workspace.getState" || t.name === "document.getOutline");

// --- 메모리 작업 공간 (도구 실행) -----------------------------------------------------------------

interface Workspace {
  assets: Map<string, AssetV3>;
  attempts: { ok: boolean; errors: number; asset: unknown }[];
  instantiations: { assetId: string; filled: number; repeats: Record<string, number>; unmapped: string[]; missing: string[]; items?: SourceItem[] }[];
  blocks: number;
  calls: string[];
}

const newWorkspace = (): Workspace => ({ assets: new Map(), attempts: [], instantiations: [], blocks: 0, calls: [] });

function describe(asset: AssetV3) {
  const fields = collectFields(asset.nodes);
  return {
    assetId: asset.assetId,
    title: asset.title,
    fields: fields.map((f) => ({ id: f.field.id, type: f.field.type, label: f.label ?? f.field.hint ?? null, ...(f.repeat ? { repeat: f.repeat } : {}) })),
    repeats: [...new Set(fields.filter((f) => f.repeat).map((f) => f.repeat!))],
  };
}

function runTool(ws: Workspace, name: string, args: Record<string, unknown>): { ok: boolean; output: unknown } {
  ws.calls.push(name);
  try {
    switch (name) {
      case "workspace.getState":
        return { ok: true, output: { activeDoc: { path: "평가/새 초안.vdoc", title: "새 초안", pages: 1, blocks: ws.blocks, note: "비어 있는 초안 문서가 열려 있다" }, staged: 0 } };
      case "document.getOutline":
        return { ok: true, output: { pages: [{ pageId: "p1", blocks: [] }] } };
      case "assets.list":
        return { ok: true, output: { assets: [...ws.assets.values()].map(describe) } };
      case "assets.register": {
        const input = args.asset as AssetV3;
        const v = validateAssetV3(input);
        ws.attempts.push({ ok: v.ok, errors: v.errors.length, asset: input });
        if (!v.ok) return { ok: false, output: `에셋이 사양에 맞지 않습니다. 고쳐서 다시 등록하세요.\n${formatAssetIssues(v)}` };
        const fp = skeletonFingerprint(input.nodes);
        const same = [...ws.assets.values()].find((a) => skeletonFingerprint(a.nodes) === fp);
        if (same && !args.replaceAssetId) return { ok: true, output: { ok: true, reused: true, ...describe(same) } };
        const id = (args.replaceAssetId as string) || `${(input.title || "asset").replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 24)}-${fp.slice(0, 6)}`;
        const asset = { ...input, assetId: id };
        ws.assets.set(id, asset);
        return { ok: true, output: { ok: true, reused: false, ...describe(asset), ...(v.warnings.length ? { warnings: formatAssetIssues({ ...v, errors: [] }) } : {}) } };
      }
      case "assets.instantiate": {
        const asset = ws.assets.get(String(args.assetId));
        if (!asset) return { ok: false, output: `에셋을 찾지 못했습니다: ${args.assetId}` };
        const items = Array.isArray(args.items) ? (args.items as SourceItem[]) : null;
        const mapped = items ? mapItemsToAsset(items, asset) : null;
        const records = (mapped?.records ?? (args.records as AssetRecords) ?? {}) as AssetRecords;
        const inst = instantiateAssetV3(asset, records);
        ws.blocks += inst.blocks.length;
        const rec = {
          assetId: asset.assetId,
          filled: inst.report.filled,
          repeats: inst.report.repeats,
          unmapped: mapped?.unmapped ?? inst.report.leftover.map((l) => l.key),
          missing: mapped?.missing ?? inst.report.empty,
          ...(items ? { items } : {}),
        };
        ws.instantiations.push(rec);
        return { ok: true, output: { staged: true, filled: rec.filled, empty: inst.report.empty, repeats: rec.repeats, ...(mapped ? { matches: mapped.matches, unmapped: mapped.unmapped, missing: mapped.missing } : {}) } };
      }
      case "assets.capture":
      case "assets.apply":
        return { ok: false, output: "이 평가의 빈 초안에는 블록이 없습니다." };
      default:
        return { ok: false, output: `이 평가에서는 쓸 수 없는 도구: ${name}` };
    }
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) };
  }
}

// --- 대화 한 번 (도구 왕복 포함) -----------------------------------------------------------------

interface TurnLog {
  text: string;
  agentTools: { name: string; state: string; title?: string; output?: string; params?: Record<string, unknown> }[];
  rounds: number;
  ms: number;
  error?: string;
}

async function turn(client: AssistantClient, sid: string, ws: Workspace, text: string, contexts: ContextRef[]): Promise<TurnLog> {
  const started = Date.now();
  const log: TurnLog = { text: "", agentTools: [], rounds: 0, ms: 0 };
  let pending: { id: string; name: string; arguments: Record<string, unknown> }[] = [];
  const onEvent = (e: AssistantEvent) => {
    if (e.type === "text_delta") log.text += e.text;
    else if (e.type === "tool_call" && !e.server) pending.push({ id: e.id, name: e.name, arguments: e.arguments ?? {} });
    else if (e.type === "agent_tool" && e.state !== "running") log.agentTools.push({ name: e.name, state: e.state, title: e.title, output: e.output?.slice(0, 400), params: e.params });
    else if (e.type === "error") log.error = e.message;
  };
  try {
    let done = await client.sendMessage(sid, { text, contexts, tools: manifest, mode: "agent" }, onEvent);
    while (done.stopReason === "tool_calls" && log.rounds < 12) {
      log.rounds++;
      const calls = pending;
      pending = [];
      const results = calls.map((c) => ({ id: c.id, name: c.name, ...runTool(ws, c.name, c.arguments) }));
      done = await client.submitToolResults(sid, results, onEvent);
    }
    // 즉시 실행(비동기) 도구가 남았으면 실행만 해 둔다
    for (const c of pending) runTool(ws, c.name, c.arguments);
  } catch (err) {
    log.error = err instanceof Error ? err.message : String(err);
  }
  log.ms = Date.now() - started;
  return log;
}

// --- 과제 ---------------------------------------------------------------------------------------

interface CaseMeta {
  id: string;
  tags: string[];
  similar?: { text: string; expect: { repeat?: Record<string, number>; filled_min?: number; unmapped_has?: string[] } };
}

function imageContext(path: string): ContextRef {
  const data = readFileSync(path).toString("base64");
  return {
    kind: "image",
    id: `img:${relative(ROOT, path)}`,
    label: "양식.png",
    hint: "첨부 이미지",
    content: "[첨부 이미지] 양식.png (image/png)",
    access: "read",
    role: "reference",
    media: { mimeType: "image/png", dataBase64: data, previewUrl: "", fileName: "양식.png", sizeBytes: statSync(path).size },
  } as ContextRef;
}

async function runCase(client: AssistantClient, id: string) {
  const dir = join(CASES, id);
  const truth = JSON.parse(readFileSync(join(dir, "truth.json"), "utf8")) as AssetV3;
  const meta = JSON.parse(readFileSync(join(dir, "case.json"), "utf8")) as CaseMeta;
  const ws = newWorkspace();
  const { sessionId } = await client.createSession({ label: `asset-eval ${id}` });
  try {
    const a = await turn(client, sessionId, ws, "첨부한 양식을 우리 문서에서 다시 쓸 수 있게 에셋으로 만들어 줘.", [imageContext(join(dir, "form.png"))]);
    const lastOk = [...ws.attempts].reverse().find((x) => x.ok);
    const lastAny = ws.attempts[ws.attempts.length - 1];
    const pred = (lastOk ?? lastAny)?.asset;
    const score = pred ? scoreSkeleton(truth, pred) : null;
    const decompose = {
      registered: Boolean(lastOk),
      attempts: ws.attempts.length,
      firstTryValid: ws.attempts[0]?.ok ?? false,
      score: score?.overall ?? 0,
      metrics: score?.metrics ?? null,
      notes: score?.notes ?? ["등록 시도 없음"],
      ms: a.ms,
      rounds: a.rounds,
      agentTools: a.agentTools.map((t) => t.name),
      error: a.error,
      reply: a.text.slice(0, 600),
      pred,
    };
    let similar: Record<string, unknown> | null = null;
    if (meta.similar && lastOk) {
      const before = ws.instantiations.length;
      const b = await turn(client, sessionId, ws, `이 데이터를 방금 만든 에셋 모양으로 문서에 넣어 줘.\n\n${meta.similar.text}`, []);
      const inst = ws.instantiations.slice(before);
      const last = inst[inst.length - 1];
      const exp = meta.similar.expect;
      const repeatOk = exp.repeat
        ? Object.entries(exp.repeat).every(([, n]) => last && Object.values(last.repeats).some((v) => v === n))
        : true;
      const filledOk = exp.filled_min ? (last?.filled ?? 0) >= exp.filled_min : true;
      const unmappedOk = exp.unmapped_has
        ? exp.unmapped_has.every((k) => (last?.unmapped ?? []).some((u) => u.includes(k)) || b.text.includes(k))
        : true;
      similar = {
        instantiated: Boolean(last),
        filled: last?.filled ?? 0,
        repeats: last?.repeats ?? {},
        unmapped: last?.unmapped ?? [],
        missing: last?.missing ?? [],
        items: last?.items ?? null,
        checks: { repeatOk, filledOk, unmappedOk },
        pass: Boolean(last) && repeatOk && filledOk && unmappedOk,
        ms: b.ms,
        agentTools: b.agentTools.map((t) => t.name),
        reply: b.text.slice(0, 500),
        error: b.error,
      };
    }
    return { id, tags: meta.tags, decompose, similar };
  } finally {
    await client.closeSession(sessionId).catch(() => undefined);
  }
}

const DESIGN_TASKS = [
  { id: "weekly-report", text: "팀원 4명(김하늘, 이도윤, 박서준, 최유나)의 주간 업무 보고서를 이 초안에 새로 만들어 줘. 사람마다 이번 주 한 일, 다음 주 할 일, 이슈를 적는 형식이면 돼.", units: 4 },
  { id: "food-blog", text: "서울 맛집 3곳(을지로 '평양면옥', 성수 '카페 어니언', 연남 '툭툭누들타이')을 소개하는 블로그 글의 틀을 이 초안에 짜 줘. 가게마다 사진, 주소, 영업시간, 한줄평 자리가 있게 — 사실 정보는 아직 없으니 가게 이름만 넣고 나머지는 빈칸으로 둬.", units: 3 },
  { id: "risk-register", text: "신규 프로젝트 3개(모바일 앱 개편, 데이터 센터 이전, ERP 교체)의 위험 관리 대장을 이 초안에 만들어 줘. 프로젝트마다 위험 항목, 발생 가능성, 영향도, 대응 방안을 적게.", units: 3 },
];

function listVault(): Set<string> {
  const out = new Set<string>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out.add(relative(VAULT, p));
    }
  };
  if (existsSync(VAULT)) walk(VAULT);
  return out;
}

async function runDesign(client: AssistantClient, task: (typeof DESIGN_TASKS)[number]) {
  const ws = newWorkspace();
  const { sessionId } = await client.createSession({ label: `asset-eval design ${task.id}` });
  try {
    const t = await turn(client, sessionId, ws, task.text, []);
    const dcBuilds = t.agentTools.filter((x) => /dc_(build|new|import)/.test(x.name));
    // 되풀이 구조(표 · 카드 · 묶음)를 dc_build 로 직접 지었는가 — 흐름 글(제목 · 문단 · 사진)은 규칙상 dc_build 몫이다
    const STRUCT = /^(table|structured-table|gallery|columns-grid|callout|callout-box|link-card|hero)$/;
    const structBuilds = dcBuilds.filter((x) => {
      if (!/dc_build/.test(x.name)) return false;
      const ops = (x.params?.ops ?? x.params?.operations ?? []) as { kind?: string; op?: string; rows?: unknown }[];
      return Array.isArray(ops) && ops.some((o) => (o.kind && STRUCT.test(String(o.kind))) || (o.op === "set" && o.rows));
    });
    const perAsset = new Map<string, number>();
    for (const i of ws.instantiations) perAsset.set(i.assetId, (perAsset.get(i.assetId) ?? 0) + 1);
    const repeatUnits = ws.instantiations.reduce((m, i) => Math.max(m, ...Object.values(i.repeats), 0), 0);
    const reuse = Math.max(0, ...perAsset.values()) >= 2 || repeatUnits >= task.units;
    const usedRepeat = [...ws.assets.values()].some((a) => describe(a).repeats.length > 0);
    return {
      id: task.id,
      assets: ws.assets.size,
      registerAttempts: ws.attempts.length,
      instantiations: ws.instantiations.length,
      repeatUnits,
      usedRepeat,
      reuse,
      dcBuilds: dcBuilds.map((x) => `${x.name.replace(/^mcp_vibefs_[0-9a-f]+_/, "")}(${x.state})`),
      structBuilds: structBuilds.length,
      assetCentric: ws.assets.size >= 1 && ws.instantiations.length >= 1 && structBuilds.length === 0,
      pass: ws.assets.size >= 1 && ws.instantiations.length >= 1 && structBuilds.length === 0 && reuse,
      calls: ws.calls,
      dcOutputs: dcBuilds.map((x) => `${x.title ?? ""}\n${x.output ?? ""}`).join("\n"),
      ms: t.ms,
      reply: t.text.slice(0, 600),
      error: t.error,
    };
  } finally {
    await client.closeSession(sessionId).catch(() => undefined);
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
        process.stdout.write(`  done ${String((items[k] as { id?: string }).id ?? items[k])}\n`);
      }
    })
  );
  return out;
}

async function main() {
  const client = new AssistantClient({ baseUrl: API });
  const ids = readdirSync(CASES).filter((d) => existsSync(join(CASES, d, "truth.json")) && existsSync(join(CASES, d, "form.png")) && (!only || only.includes(d)));
  const started = new Date();
  const results = onlyDesign ? [] : await pool(ids, concurrency, (id) => runCase(client, id));

  let design: Awaited<ReturnType<typeof runDesign>>[] = [];
  const cleaned: string[] = [];
  if (!skipDesign && !only) {
    const before = listVault();
    design = await pool(DESIGN_TASKS, concurrency, (t) => runDesign(client, t));
    // 설계 과제에서 dc_* 가 실제 볼트에 만든 문서만 치운다 (이 실행 전엔 없던 파일 + dc 출력에 이름이 나온 파일)
    const after = listVault();
    const mentioned = design.map((d) => d.dcOutputs).join("\n");
    for (const p of after) {
      if (before.has(p) || !/\.vdoc$/.test(p)) continue;
      const stem = p.replace(/\\/g, "/").split("/").pop()!.replace(/\.vdoc$/, "");
      if (stem && mentioned.includes(stem)) {
        rmSync(join(VAULT, p));
        cleaned.push(p);
      }
    }
  }

  mkdirSync(REPORTS, { recursive: true });
  const stamp = started.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : 0);
  const summary = {
    when: started.toISOString(),
    api: API,
    decompose: {
      n: results.length,
      registered: results.filter((r) => r.decompose.registered).length,
      firstTryValid: results.filter((r) => r.decompose.firstTryValid).length,
      avgScore: avg(results.map((r) => r.decompose.score)),
    },
    similar: { n: results.filter((r) => r.similar).length, pass: results.filter((r) => (r.similar as { pass?: boolean } | null)?.pass).length },
    design: { n: design.length, assetCentric: design.filter((d) => d.assetCentric).length, pass: design.filter((d) => d.pass).length },
    cleanedVaultFiles: cleaned,
  };
  writeFileSync(join(REPORTS, `${stamp}.json`), JSON.stringify({ summary, results, design }, null, 1));

  const md: string[] = [];
  md.push(`# 에셋 평가 ${started.toISOString()}`, "");
  md.push(`- 분해: ${summary.decompose.registered}/${summary.decompose.n} 등록 · 첫 시도 사양 통과 ${summary.decompose.firstTryValid} · 평균 점수 **${summary.decompose.avgScore}**`);
  md.push(`- 유사 데이터: ${summary.similar.pass}/${summary.similar.n} 통과`);
  md.push(`- 새 작업 설계: 에셋 중심 ${summary.design.assetCentric}/${summary.design.n} · 통과(재사용 포함) ${summary.design.pass}/${summary.design.n}`, "");
  md.push("| 사례 | 등록 | 시도 | 점수 | 순서 | 격자 | 칸종류 | 병합 | 역할 | 고정글 | 반복 | 필드 | 유사 데이터 |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const m = r.decompose.metrics;
    const s = r.similar as { pass?: boolean; filled?: number; repeats?: Record<string, number>; unmapped?: string[] } | null;
    md.push(
      `| ${r.id} | ${r.decompose.registered ? "○" : "✕"} | ${r.decompose.attempts} | **${r.decompose.score}** | ${m?.blockSeq ?? "-"} | ${m?.gridShape ?? "-"} | ${m?.cellKind ?? "-"} | ${m?.span ?? "-"} | ${m?.role ?? "-"} | ${m?.labels ?? "-"} | ${m?.repeat ?? "-"} | ${m?.fieldType ?? "-"} | ${s ? `${s.pass ? "○" : "✕"} 채움 ${s.filled} · 반복 ${JSON.stringify(s.repeats)} · 남음 ${(s.unmapped ?? []).join(", ") || "-"}` : "-"} |`
    );
  }
  if (design.length) {
    md.push("", "| 설계 과제 | 에셋 | 인스턴스 | 반복 단위 | 재사용 | dc 호출 | 구조를 dc 로 | 결과 |", "|---|---|---|---|---|---|---|---|");
    for (const d of design) md.push(`| ${d.id} | ${d.assets} | ${d.instantiations} | ${d.repeatUnits} | ${d.reuse ? "○" : "✕"} | ${d.dcBuilds.join(", ") || "-"} | ${d.structBuilds} | ${d.pass ? "통과" : d.assetCentric ? "에셋 중심(재사용 부족)" : "✕"} |`);
  }
  for (const r of results) if (r.decompose.notes.length) md.push("", `- ${r.id}: ${r.decompose.notes.join(" / ")}`);
  if (cleaned.length) md.push("", `정리한 평가용 문서: ${cleaned.join(", ")}`);
  writeFileSync(join(REPORTS, `${stamp}.md`), md.join("\n"));
  console.log(md.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
