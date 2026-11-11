import React, { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";

export type CanvasKeyLayer = "editor" | "table" | "rangeSelection" | "canvas" | "global";
export type CanvasKeyHandler = (e: KeyboardEvent) => boolean | void;
export type CanvasKeyRegistrar = (layer: CanvasKeyLayer, handler: CanvasKeyHandler) => () => void;

export const CanvasKeyLayerContext = createContext<CanvasKeyRegistrar | null>(null);

/**
 * Registers a keyboard handler into the parent workspace's layered key dispatcher
 * (falling back to a document keydown listener only when rendered standalone without Studio).
 */
export function useCanvasKeyLayer(
  layer: CanvasKeyLayer,
  handler: CanvasKeyHandler,
  active = true
): void {
  const register = useContext(CanvasKeyLayerContext);
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!active) return;
    if (register) {
      return register(layer, (e) => handlerRef.current(e));
    }
    const onKeyDown = (e: KeyboardEvent) => {
      handlerRef.current(e);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [register, layer, active]);
}

