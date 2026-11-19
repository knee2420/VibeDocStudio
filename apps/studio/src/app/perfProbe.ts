import type { VDocDocument } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { getOutlineProjection, outlineCommands } from "@/features/zoom-hierarchy";

/**
 * 화면 성능 측정 프로브 (`window.__studioPerf`). 개발 서버이거나 URL 에 `?perf` 가 있을 때만 붙는다.
 *
 * 두 가지 시간을 잰다.
 * - `total`: 명령 → React 렌더 · 커밋 → 강제 레이아웃 (MessageChannel 한 틱 뒤 `offsetHeight` 를 읽는다). 창이 가려져도 잰다.
 * - `paint`: 명령 → 다음 화면이 그려진 프레임 (rAF 두 번). 사용자가 느끼는 시간. 창이 가려져 rAF 가 멈추면 null.
 * 문서는 하드코딩하지 않고 크기 순위로 고른다 (작은 · 중간 · 큰 문서).
 * 슬롯 커밋 시나리오는 스토어 `setState` 로 문서 객체만 바꿔 끼워 자동 저장 · 이력에 남기지 않고 원래대로 돌린다.
 */
const tick = () =>
  new Promise<void>((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(0);
  });
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const round = (n: number) => Math.round(n * 10) / 10;

type Sample = { sync: number; total: number; paint: number | null };

/** 다음 화면이 그려진 시점 (rAF 두 번 — 첫 rAF 뒤 그 프레임을 그린다). 500ms 안에 오지 않으면 null. */
function nextPaint(): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 500);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.clearTimeout(timer);
        resolve(performance.now());
      })
    );
  });
}

async function measure(fn: () => void): Promise<Sample> {
  const t0 = performance.now();
  const painted = nextPaint();
  fn();
  const t1 = performance.now();
  await tick();
  void document.body.offsetHeight; // 스타일 · 레이아웃까지 포함
  const t2 = performance.now();
  const tp = await painted;
  return { sync: round(t1 - t0), total: round(t2 - t0), paint: tp === null ? null : round(Math.max(tp, t2) - t0) };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function docSize(d: VDocDocument): number {
  return Object.keys(d.slots).length + d.pages.length * 20;
}

function pickDocs(): { small: VDocDocument; mid: VDocDocument; large: VDocDocument } | null {
  const docs = [...useStudioDocumentStore.getState().docs].sort((a, b) => docSize(a) - docSize(b));
  if (docs.length < 2) return null;
  return { small: docs[0], mid: docs[Math.floor(docs.length / 2)], large: docs[docs.length - 1] };
}

const domCount = () => document.getElementsByTagName("*").length;

async function switchDoc(docId: string) {
  return measure(() => useStudioDocumentStore.getState().setActiveDocId(docId));
}

/** 문서 전환: 처음 방문(cold)은 따로, 이후 왕복(warm)은 중앙값. */
async function runSwitch() {
  const picked = pickDocs();
  if (!picked) return null;
  const { small, mid, large } = picked;
  // 처음 한 바퀴는 처음 방문(cold), 이후 네 바퀴는 왕복(warm) — 칸마다 표본 4개 이상.
  const order = Array.from({ length: 5 }, () => [small, large, mid]).flat();
  const warm: Record<string, number[]> = { small: [], mid: [], large: [] };
  const warmPaint: Record<string, number[]> = { small: [], mid: [], large: [] };
  const seen = new Set<string>();
  const cold: Record<string, number> = {};
  const coldPaint: Record<string, number | null> = {};
  for (const d of order) {
    await wait(300);
    const label = d === small ? "small" : d === mid ? "mid" : "large";
    const r = await switchDoc(d.docId);
    if (!seen.has(d.docId)) {
      seen.add(d.docId);
      cold[label] = r.total;
      coldPaint[label] = r.paint;
    } else {
      warm[label].push(r.total);
      if (r.paint !== null) warmPaint[label].push(r.paint);
    }
  }
  return {
    docs: { small: small.docId, mid: mid.docId, large: large.docId },
    coldMs: cold,
    warmMedianMs: { small: median(warm.small), mid: median(warm.mid), large: median(warm.large) },
    coldPaintMs: coldPaint,
    warmPaintMedianMs: { small: median(warmPaint.small), mid: median(warmPaint.mid), large: median(warmPaint.large) },
  };
}

/** 줌: 문서 → 페이지 → 줌아웃 → 블록 → 줌아웃 ×2 (큰 문서). */
async function runZoom() {
  const picked = pickDocs();
  if (!picked) return null;
  const doc = picked.large;
  await switchDoc(doc.docId);
  await wait(500);
  const proj = getOutlineProjection();
  const docNode = proj.allNodes.find((n) => n.targetDocId === doc.docId && n.zoomLevel === "document");
  const pages = proj.allNodes.filter((n) => n.targetDocId === doc.docId && n.zoomLevel === "page" && !n.targetBlockId);
  const block = proj.allNodes.find((n) => n.targetDocId === doc.docId && n.targetBlockId && !n.targetSlotId && n.targetPageId === pages[Math.min(2, pages.length - 1)]?.targetPageId);
  const steps: [string, () => void][] = [];
  if (docNode) steps.push(["zoomInDoc", () => outlineCommands.zoomIntoNode(docNode)]);
  if (pages.length > 1) steps.push(["zoomInPage", () => outlineCommands.zoomIntoNode(pages[Math.floor(pages.length / 2)])]);
  steps.push(["zoomOutToDoc", () => outlineCommands.zoomOutOneLevel()]);
  if (block) steps.push(["zoomInBlock", () => outlineCommands.zoomIntoNode(block)]);
  steps.push(["zoomOut1", () => outlineCommands.zoomOutOneLevel()]);
  steps.push(["zoomOut2", () => outlineCommands.zoomOutOneLevel()]);
  const out: Record<string, Sample & { dom: number }> = {};
  for (const [label, fn] of steps) {
    await wait(400);
    const r = await measure(fn);
    out[label] = { ...r, dom: domCount() };
  }
  return { doc: doc.docId, nodes: proj.allNodes.length, steps: out };
}

/** 슬롯 한 칸 커밋: 큰 문서의 슬롯 객체 하나를 새 객체로 바꿔 끼운다 (저장 · 이력 없음). */
async function runSlotCommit() {
  const picked = pickDocs();
  if (!picked) return null;
  const doc = useStudioDocumentStore.getState().docs.find((d) => d.docId === picked.large.docId);
  if (!doc) return null;
  await switchDoc(doc.docId);
  await wait(300);
  const slotId = Object.keys(doc.slots)[0];
  const samples: number[] = [];
  const syncs: number[] = [];
  const paints: number[] = [];
  for (let i = 0; i < 5; i++) {
    const original = useStudioDocumentStore.getState().docs;
    const edited = original.map((d) =>
      d.docId === doc.docId ? { ...d, slots: { ...d.slots, [slotId]: { ...d.slots[slotId] } } } : d
    );
    const r = await measure(() => useStudioDocumentStore.setState({ docs: edited }));
    samples.push(r.total);
    syncs.push(r.sync);
    if (r.paint !== null) paints.push(r.paint);
    useStudioDocumentStore.setState({ docs: original.map((d) => (d.docId === doc.docId ? doc : d)) });
    await wait(200);
  }
  return { doc: doc.docId, medianMs: median(samples), medianSyncMs: median(syncs), medianPaintMs: paints.length ? median(paints) : null };
}

/** 부팅 시간 · 불러온 문서 크기. API 는 다른 출처(8090)라 리소스 타이밍에 본문 크기가 없어 스토어의 JSON 크기로 잰다. */
function bootStats() {
  const docRequests = performance.getEntriesByType("resource").filter((r) => r.name.includes("/api/documents/")).length;
  const ready = performance.getEntriesByName("studio:ready")[0];
  const allDocs = performance.getEntriesByName("studio:docs-loaded")[0];
  const active = useStudioDocumentStore.getState();
  const activeDoc = active.docs.find((d) => d.docId === active.activeDocId);
  const docBytes = active.docs.reduce((a, d) => a + JSON.stringify(d).length, 0);
  return {
    readyMs: ready ? Math.round(ready.startTime) : null,
    allDocsLoadedMs: allDocs ? Math.round(allDocs.startTime) : null,
    docRequests,
    docKB: Math.round(docBytes / 1024),
    autosavePayloadKB: activeDoc ? Math.round(JSON.stringify(activeDoc).length / 1024) : null,
    docsInStore: active.docs.length,
  };
}

async function runAll() {
  const layout = useWorkspaceLayoutStore.getState();
  const session = useWorkspaceSessionStore.getState();
  const before = { zoom: session.zoomRootNodeId, doc: useStudioDocumentStore.getState().activeDocId };
  const result = {
    env: import.meta.env.DEV ? "dev" : "prod",
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    panels: { left: layout.leftSidebarOpen, right: layout.rightSidebarOpen, phase: session.currentPhase },
    boot: bootStats(),
    switch: await runSwitch(),
    zoom: await runZoom(),
    slotCommit: await runSlotCommit(),
  };
  useWorkspaceSessionStore.getState().zoomIntoNode(before.zoom);
  if (before.doc) useStudioDocumentStore.getState().setActiveDocId(before.doc);
  return result;
}

interface SelfProfilerTrace {
  frames: { name?: string; resourceId?: number; line?: number }[];
  resources: string[];
  stacks: { frameId: number; parentId?: number }[];
  samples: { stackId?: number }[];
}

/**
 * 시나리오를 JS Self-Profiling API 로 돌려 자기 시간 · 포함 시간 상위 함수를 돌려준다.
 * 개발 서버(`Document-Policy: js-profiling` 헤더)에서만 된다. 샘플은 약 10ms 간격이다.
 */
async function profile(scenario: "switch" | "zoom" | "slotCommit" = "switch", topN = 40) {
  const ProfilerCtor = (window as unknown as { Profiler?: new (o: object) => { stop(): Promise<SelfProfilerTrace> } }).Profiler;
  if (!ProfilerCtor) return { error: "JS Self-Profiling API 를 쓸 수 없습니다 (Document-Policy: js-profiling 헤더 필요)." };
  const profiler = new ProfilerCtor({ sampleInterval: 1, maxBufferSize: 200000 });
  if (scenario === "switch") await runSwitch();
  else if (scenario === "zoom") await runZoom();
  else await runSlotCommit();
  const trace = await profiler.stop();
  const name = (fi: number) => {
    const f = trace.frames[fi];
    const res = f.resourceId != null ? trace.resources[f.resourceId] : "";
    const short = res.replace(/^.*\/(src|deps)\//, "").replace(/\?.*$/, "");
    return `${f.name || "(anon)"} @${short}:${f.line ?? ""}`;
  };
  const self = new Map<string, number>();
  const total = new Map<string, number>();
  let samples = 0;
  for (const s of trace.samples) {
    if (s.stackId == null) continue;
    samples++;
    let st: SelfProfilerTrace["stacks"][number] | undefined = trace.stacks[s.stackId];
    const leaf = name(st.frameId);
    self.set(leaf, (self.get(leaf) ?? 0) + 1);
    const seen = new Set<string>();
    while (st) {
      const n = name(st.frameId);
      if (!seen.has(n)) {
        total.set(n, (total.get(n) ?? 0) + 1);
        seen.add(n);
      }
      st = st.parentId != null ? trace.stacks[st.parentId] : undefined;
    }
  }
  const top = (m: Map<string, number>, skip?: RegExp) =>
    [...m.entries()].filter(([k]) => !skip || !skip.test(k)).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([k, v]) => `${v} ${k}`);
  return { samples, self: top(self), total: top(total, /react-dom_client|react_jsx|perfProbe|\(anon\) @:|^run @:/) };
}

declare global {
  interface Window {
    __studioPerf?: {
      profile: typeof profile;
      runAll: typeof runAll;
      runSwitch: typeof runSwitch;
      runZoom: typeof runZoom;
      runSlotCommit: typeof runSlotCommit;
      bootStats: typeof bootStats;
    };
  }
}

export function installPerfProbe(): void {
  if (!import.meta.env.DEV && !new URLSearchParams(window.location.search).has("perf")) return;
  // 개발 서버는 모듈 요청만 수백 개라 기본 버퍼(250)가 차서 문서 요청이 기록되지 않는다.
  performance.setResourceTimingBufferSize(5000);
  window.__studioPerf = { runAll, runSwitch, runZoom, runSlotCommit, bootStats, profile };
}
