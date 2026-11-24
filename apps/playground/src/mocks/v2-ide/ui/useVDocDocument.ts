/**
 * `.vdoc` 하나를 공유 문서 캐시에서 구독한다 — 편집기 · 인스펙터 · 구조 패널 · AI 가 같은 객체를 본다.
 * 다른 화면 · AI · 디스크가 바꾸면 캐시가 알려 주고, 고칠 때는 `mutate` 가 캐시를 거쳐 볼트에 쓴다 (다시 파싱 없음).
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parseVDocJson, type VDocStore } from "@vibe/vault-formats";
import type { VDocDocument } from "@vibe/vdoc-schema";
import { stem } from "@vibe/vault-core";

export function useVDocDocument(
  docs: VDocStore,
  path: string
): readonly [VDocDocument, (updater: (prev: VDocDocument) => VDocDocument) => void] {
  // 파일이 없을 때(막 지워짐 · 아직 안 읽힘) 쓰는 빈 문서 — 경로마다 하나로 고정해 스냅샷이 흔들리지 않게
  const fallback = useMemo(() => parseVDocJson("", stem(path)), [path]);
  const subscribe = useCallback((cb: () => void) => docs.subscribe(path, cb), [docs, path]);
  const snapshot = useCallback(() => docs.get(path) ?? fallback, [docs, path, fallback]);
  const doc = useSyncExternalStore(subscribe, snapshot, snapshot);
  const mutate = useCallback(
    (updater: (prev: VDocDocument) => VDocDocument) => {
      const prev = docs.get(path) ?? fallback;
      const next = updater(prev);
      if (next !== prev) docs.write(path, next);
    },
    [docs, path, fallback]
  );
  return [doc, mutate] as const;
}
