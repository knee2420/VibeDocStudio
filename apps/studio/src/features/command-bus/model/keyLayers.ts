import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * 캔버스 · 편집기 · 스튜디오 키 입력 처리 계층 순서 (높은 우선순위부터 평가).
 * 처리기 중 하나가 `true`를 반환하거나 `e.defaultPrevented`가 되면 하위 계층으로 넘기지 않는다.
 */
export const KEY_LAYER_ORDER = ["editor", "table", "rangeSelection", "canvas", "global"] as const;
export type KeyLayerName = (typeof KEY_LAYER_ORDER)[number];

export interface KeyLayerEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
  defaultPrevented: boolean;
  target?: EventTarget | null;
  preventDefault(): void;
}

export type KeyLayerHandler<E extends KeyLayerEventLike = KeyboardEvent> = (e: E) => boolean | void;

export interface KeyLayerBus<E extends KeyLayerEventLike = KeyboardEvent> {
  register: (layer: KeyLayerName, handler: KeyLayerHandler<E>) => () => void;
  dispatch: (e: E) => KeyLayerName | null;
  clear: () => void;
}

/**
 * 우선순위 계층(`editor → table → rangeSelection → canvas → global`) 기반 키 디스패처를 만든다.
 * 같은 계층 안에서는 가장 최근에 등록된 핸들러(LIFO)부터 실행한다.
 */
export function createKeyLayerBus<E extends KeyLayerEventLike = KeyboardEvent>(): KeyLayerBus<E> {
  const buckets = new Map<KeyLayerName, KeyLayerHandler<E>[]>();
  for (const name of KEY_LAYER_ORDER) buckets.set(name, []);

  return {
    register: (layer, handler) => {
      const list = buckets.get(layer)!;
      list.push(handler);
      return () => {
        const idx = list.lastIndexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      };
    },
    dispatch: (e) => {
      for (const layer of KEY_LAYER_ORDER) {
        const list = [...(buckets.get(layer) ?? [])];
        for (let i = list.length - 1; i >= 0; i--) {
          const handled = list[i](e);
          if (handled === true || e.defaultPrevented) {
            return layer;
          }
        }
      }
      return null;
    },
    clear: () => {
      for (const list of buckets.values()) list.length = 0;
    },
  };
}

/** 스튜디오 전역에서 공유하는 키 레이어 버스 인스턴스. */
export const studioKeyLayers = createKeyLayerBus<KeyboardEvent>();

/** React 컴포넌트 생명주기에 맞춰 특정 계층에 키 핸들러를 등록한다. */
export function useKeyLayer(
  layer: KeyLayerName,
  handler: KeyLayerHandler<KeyboardEvent>,
  active = true
): void {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!active) return;
    return studioKeyLayers.register(layer, (e) => handlerRef.current(e));
  }, [layer, active]);
}

