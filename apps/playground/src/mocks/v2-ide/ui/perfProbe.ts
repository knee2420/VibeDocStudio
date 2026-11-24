/**
 * v2 화면 성능 측정 프로브 (`window.__v2Perf`). 개발 서버이거나 URL 에 `?perf` 가 있을 때만 붙는다.
 * `scripts/v2_perf.py` 가 헤드리스 Chrome(1920×1080)에서 부른다 — 숫자는 그 스크립트로만 잰다
 * (데스크톱 앱의 가려진 브라우저 패널은 렌더러 우선순위가 떨어져 몇 배씩 흔들린다).
 *
 * 쓰기 측정은 메모리 볼트에서만 한다 — 사람 볼트 파일을 건드리지 않는다.
 */
import type { IdeWorkbenchRuntime } from "../model/useIdeWorkbench";

const PERF_DIR = "__perf__";

const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)] * 10) / 10;
};
const p95 = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] * 10) / 10;
};

/** React 스케줄러(MessageChannel)가 미룬 렌더까지 돌게 한 번 양보한다. */
const yieldTask = () =>
  new Promise<void>((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(null);
  });

/**
 * 작업 하나의 비용.
 * - ms: 작업 + React 커밋 + 강제 레이아웃까지 (프레임 대기 없음 — 실제로 쓴 메인 스레드 시간)
 * - paintMs: 다음 화면이 그려질 때까지 (사용자 체감, 프레임 단위로 끊긴다)
 * - mutations: 작업이 일으킨 DOM 변경 수 (다시 그린 범위의 대리 지표)
 */
async function measure(op: () => void | Promise<void>): Promise<{ ms: number; paintMs: number; mutations: number }> {
  let mutations = 0;
  const mo = new MutationObserver((records) => {
    mutations += records.length;
  });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const t0 = performance.now();
  await op();
  await yieldTask();
  await yieldTask();
  void document.body.offsetHeight;
  const ms = performance.now() - t0;
  await nextPaint();
  const paintMs = performance.now() - t0;
  mo.takeRecords().forEach(() => (mutations += 1));
  mo.disconnect();
  return { ms, paintMs, mutations };
}

async function waitFor(pred: () => boolean, timeoutMs = 15_000): Promise<boolean> {
  const t0 = performance.now();
  while (!pred()) {
    if (performance.now() - t0 > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 16));
  }
  return true;
}

type Sample = { ms: number; paintMs: number; mutations: number };

function summarize(samples: Sample[]) {
  return {
    n: samples.length,
    medianMs: median(samples.map((s) => s.ms)),
    p95Ms: p95(samples.map((s) => s.ms)),
    medianPaintMs: median(samples.map((s) => s.paintMs)),
    medianMutations: median(samples.map((s) => s.mutations)),
  };
}

interface VDocLike {
  pages: { pageId: string; blocks: { blockId: string }[] }[];
  slots: Record<string, { content: string }>;
}

export interface V2PerfProbe {
  ready(): boolean;
  /** 측정용 큰 문서를 메모리 볼트에 넣는다 (원본 JSON 문자열). */
  seed(name: string, raw: string): string;
  runAll(opts?: { docPath?: string }): Promise<Record<string, unknown>>;
}

export function installV2PerfProbe(runtime: IdeWorkbenchRuntime): () => void {
  const w = window as unknown as { __v2Perf?: V2PerfProbe };
  const canWrite = () => runtime.mode === "memory";

  const probe: V2PerfProbe = {
    ready: () => document.querySelector("[data-vault-path]") !== null,

    seed(name, raw) {
      if (!canWrite()) throw new Error("perf seed 는 메모리 볼트에서만 한다");
      if (!runtime.vault.exists(PERF_DIR)) runtime.vault.createFolder(PERF_DIR);
      const path = `${PERF_DIR}/${name}`;
      if (runtime.vault.exists(path)) runtime.vault.write(path, raw);
      else runtime.vault.createFile(path, raw);
      return path;
    },

    async runAll(opts) {
      const out: Record<string, unknown> = {
        env: { mode: runtime.mode, ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight },
      };
      const docPath = opts?.docPath;
      if (!docPath || !runtime.vault.exists(docPath)) throw new Error(`측정 문서가 없다: ${docPath}`);
      const doc = JSON.parse(runtime.vault.read(docPath)) as VDocLike;
      const blockIds = doc.pages.flatMap((p) => p.blocks.map((b) => b.blockId));
      out.doc = { path: docPath, pages: doc.pages.length, blocks: blockIds.length, slots: Object.keys(doc.slots).length };

      // 1) 문서 열기 (차가움) — 첫 페이지가 그려질 때까지
      const open = await measure(async () => {
        runtime.openVaultFile(docPath, "current");
        await waitFor(() => document.querySelectorAll("[data-vdoc-page-id]").length > 0);
      });
      out.openCold = open;
      await nextPaint();
      out.renderedBlocks = document.querySelectorAll("[data-block-id]").length;

      const bridge = runtime.vdocUiBridge.getState();
      // 2) 블록 선택 30회
      const pageOf = new Map(doc.pages.flatMap((p) => p.blocks.map((b) => [b.blockId, p.pageId] as const)));
      const sel: Sample[] = [];
      for (const bid of blockIds.slice(0, 30)) {
        sel.push(await measure(() => bridge.selectBlock(docPath, bid, pageOf.get(bid))));
      }
      out.selectBlock = summarize(sel);

      // 3) 호버 60회 (선택과 별개 — 편집기 · 구조 패널이 다시 그려지면 안 된다)
      const hov: Sample[] = [];
      for (const bid of [...blockIds, ...blockIds].slice(0, 60)) {
        hov.push(await measure(() => runtime.vdocUiBridge.getState().setHoveredBlock(docPath, bid)));
      }
      out.hover = summarize(hov);
      runtime.vdocUiBridge.getState().setHoveredBlock(docPath, null);

      // 4) 바깥 쓰기 (다른 창 · AI 가 칸 하나를 고침) 10회 — 메모리 볼트만
      if (canWrite()) {
        const slotIds = Object.keys(doc.slots).slice(0, 10);
        const wr: Sample[] = [];
        for (const [i, sid] of slotIds.entries()) {
          const cur = JSON.parse(runtime.vault.read(docPath)) as VDocLike;
          cur.slots[sid] = { ...cur.slots[sid], content: `<p>perf write ${i} ${Date.now()}</p>` };
          const raw = JSON.stringify(cur, null, 2);
          wr.push(
            await measure(() => {
              runtime.vault.write(docPath, raw);
            })
          );
        }
        out.externalSlotWrite = summarize(wr);
      }

      // 5) 탐색기 전부 펼치기 / 접기
      const ex = runtime.explorer.getState();
      out.explorerExpandAll = await measure(() => ex.expandAll());
      out.explorerRows = document.querySelectorAll("[data-vault-path]").length;
      out.explorerCollapseAll = await measure(() => runtime.explorer.getState().collapseAll());

      // 6) 여러 블록 선택 50개 → 해제
      const items = blockIds.slice(0, 50).map((id) => ({ id, kind: "block" as const, blockId: id, pageId: pageOf.get(id) }));
      out.multiSelect50 = await measure(() => runtime.vdocUiBridge.getState().setSelection(docPath, items, items[0]?.id));
      out.multiClear = await measure(() => runtime.vdocUiBridge.getState().clearSelection(docPath));

      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      if (mem) out.heapMB = Math.round(mem.usedJSHeapSize / 1048576);
      return out;
    },
  };
  w.__v2Perf = probe;
  return () => {
    if (w.__v2Perf === probe) delete w.__v2Perf;
  };
}

export function shouldInstallPerfProbe(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).has("perf");
}
