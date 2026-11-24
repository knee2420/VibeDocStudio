/**
 * 경로별 문서 캐시 — 같은 볼트 파일을 화면 여러 곳(편집기 · 인스펙터 · 구조 패널 · AI 컨텍스트)이 읽어도
 * 파일 내용이 바뀌지 않았으면 한 번만 파싱하고 같은 객체를 나눠 준다.
 *
 * - 볼트 이벤트(수정 · 생성 · 삭제 · 이름 변경 · 초기화)가 오면 그 경로만 캐시를 버리고 구독자에게 새 문서를 준다.
 * - `write` 로 쓰면 쓴 객체를 그대로 캐시에 넣는다 — 쓴 쪽은 같은 객체를 되받아 다시 그리지 않고,
 *   다른 화면은 다시 파싱하지 않고 그 객체를 받는다 (쓰기 → 이벤트 → 다시 파싱 왕복 제거).
 * - 게으른 볼트(`isLoaded` false)의 아직 안 읽은 파일은 캐시하지 않는다.
 */
import { stem, type VaultEvent, type VaultPort } from "@vibe/vault-core";
import type { VDocDocument } from "@vibe/vdoc-schema";

import { isVDocPath, parseVDocJson, serializeVDocJson } from "./vdoc";

export interface VaultDocCodec<T> {
  readonly match: (path: string) => boolean;
  readonly parse: (raw: string, path: string) => T;
  readonly serialize: (doc: T) => string;
  /**
   * 다시 파싱한 문서에서 안 바뀐 부분을 이전 객체로 바꿔 끼운다 (구조 공유).
   * 칸 하나가 바뀌었으면 그 칸 · 그 칸을 품은 쪽만 새 객체 — 화면은 참조 비교로 나머지를 다시 그리지 않는다.
   */
  readonly share?: (prev: T, next: T) => T;
}

/** 값이 같은지 (JSON 값 기준 · 일찍 끝냄). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonEqual(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

/** `.vdoc` 구조 공유: 칸 · 쪽(블록) · 백데이터 · 근거를 단위별로 이전 객체와 맞춘다. */
export function shareVDocStructure(prev: VDocDocument, next: VDocDocument): VDocDocument {
  if (prev === next) return prev;
  const reuseMap = <V>(a: Record<string, V> | undefined, b: Record<string, V> | undefined): Record<string, V> | undefined => {
    if (!a || !b) return b;
    let same = Object.keys(a).length === Object.keys(b).length;
    const out: Record<string, V> = {};
    for (const [k, v] of Object.entries(b)) {
      const old = a[k];
      if (old !== undefined && jsonEqual(old, v)) out[k] = old;
      else {
        out[k] = v;
        same = false;
      }
    }
    return same ? a : out;
  };
  const prevPages = new Map(prev.pages.map((p) => [p.pageId, p] as const));
  let pagesSame = prev.pages.length === next.pages.length;
  const pages = next.pages.map((p, i) => {
    const old = prevPages.get(p.pageId);
    if (old && jsonEqual(old, p)) {
      if (prev.pages[i] !== old) pagesSame = false;
      return old;
    }
    pagesSame = false;
    return p;
  });
  const slots = reuseMap(prev.slots, next.slots) ?? next.slots;
  const backdata = reuseMap(prev.backdata, next.backdata) ?? next.backdata;
  const evidenceLinks = jsonEqual(prev.evidenceLinks, next.evidenceLinks) ? prev.evidenceLinks : next.evidenceLinks;
  const variables = jsonEqual(prev.variables, next.variables) ? prev.variables : next.variables;
  const shared: VDocDocument = { ...next, pages: pagesSame ? prev.pages : pages, slots, backdata, evidenceLinks, variables };
  // 머리 정보까지 모두 같으면 이전 문서 그대로 (저장 시각만 다른 경우 포함)
  const { updatedAt: _a, ...restPrev } = prev;
  const { updatedAt: _b, ...restNext } = shared;
  return jsonEqual(restPrev, restNext) ? prev : shared;
}

export interface VaultDocStoreStats {
  readonly parses: number;
  readonly hits: number;
  readonly writes: number;
}

export interface VaultDocStore<T> {
  /** 지금 문서 (없는 파일이면 null). 내용이 그대로면 같은 객체. */
  get(path: string): T | null;
  /** 문서를 볼트에 쓰고 캐시를 그 객체로 맞춘다. */
  write(path: string, doc: T): void;
  /** 그 경로의 문서가 바뀌면 (다른 화면 · AI · 디스크) 새 문서로 부른다. 삭제되면 null. */
  subscribe(path: string, listener: (doc: T | null) => void): () => void;
  stats(): VaultDocStoreStats;
  dispose(): void;
}

interface Entry<T> {
  readonly doc: T;
}

function eventPaths(ev: VaultEvent): string[] {
  switch (ev.type) {
    case "create":
      return [ev.node.path];
    case "modify":
      return [ev.path];
    case "delete":
      return [ev.path, ...ev.affectedPaths];
    case "rename":
      return [ev.oldPath, ev.newPath, ...ev.affectedMap.flatMap((m) => [m.oldPath, m.newPath])];
    default:
      return [];
  }
}

export function createVaultDocStore<T>(vault: VaultPort, codec: VaultDocCodec<T>): VaultDocStore<T> {
  const cache = new Map<string, Entry<T>>();
  /** 바깥 쓰기로 버린 직전 문서 — 다시 파싱할 때 구조 공유의 기준. */
  const stale = new Map<string, T>();
  const listeners = new Map<string, Set<(doc: T | null) => void>>();
  let parses = 0;
  let hits = 0;
  let writes = 0;
  /** 이 저장소가 지금 쓰고 있는 경로 — 그 쓰기가 일으킨 이벤트는 캐시를 버리지 않는다. */
  const writing = new Set<string>();

  const read = (path: string): T | null => {
    if (!vault.exists(path)) return null;
    if (vault.isLoaded && !vault.isLoaded(path)) return codec.parse("", path);
    const hit = cache.get(path);
    if (hit) {
      hits += 1;
      return hit.doc;
    }
    const parsed = codec.parse(vault.read(path), path);
    parses += 1;
    const before = stale.get(path);
    stale.delete(path);
    const doc = before !== undefined && codec.share ? codec.share(before, parsed) : parsed;
    cache.set(path, { doc });
    return doc;
  };

  const notify = (path: string) => {
    const set = listeners.get(path);
    if (!set?.size) return;
    const doc = read(path);
    for (const fn of [...set]) fn(doc);
  };

  const unsubscribeVault = vault.subscribe((ev) => {
    if (ev.type === "vault-reset") {
      cache.clear();
      stale.clear();
      for (const path of listeners.keys()) notify(path);
      return;
    }
    for (const path of eventPaths(ev)) {
      if (!codec.match(path)) continue;
      if (writing.has(path) && ev.type === "modify") {
        notify(path);
        continue;
      }
      const old = cache.get(path);
      if (old && ev.type === "modify") stale.set(path, old.doc);
      cache.delete(path);
      notify(path);
    }
  });

  return {
    get: read,
    write(path, doc) {
      writes += 1;
      cache.set(path, { doc });
      writing.add(path);
      try {
        vault.write(path, codec.serialize(doc));
      } finally {
        writing.delete(path);
      }
    },
    subscribe(path, listener) {
      let set = listeners.get(path);
      if (!set) listeners.set(path, (set = new Set()));
      set.add(listener);
      return () => {
        set?.delete(listener);
        if (set && set.size === 0) listeners.delete(path);
      };
    },
    stats: () => ({ parses, hits, writes }),
    dispose() {
      unsubscribeVault();
      cache.clear();
      stale.clear();
      listeners.clear();
    },
  };
}

export type VDocStore = VaultDocStore<VDocDocument>;

export const VDOC_CODEC: VaultDocCodec<VDocDocument> = {
  match: isVDocPath,
  parse: (raw, path) => parseVDocJson(raw, stem(path)),
  serialize: serializeVDocJson,
  share: shareVDocStructure,
};

export function createVDocStore(vault: VaultPort): VDocStore {
  return createVaultDocStore(vault, VDOC_CODEC);
}
