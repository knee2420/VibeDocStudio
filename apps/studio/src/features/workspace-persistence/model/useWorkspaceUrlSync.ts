import { useEffect } from "react";

import type { WorkbenchPhase } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

const STORAGE_KEY = "vdoc-studio-session-v1";

/**
 * Synchronizes Workbench Phase (`storylining | templating | drafting`), 4-Level Zoom Root (`zoom`),
 * Active Document (`doc`), and Reference Split Viewport (`splitRef`) with URL query parameters
 * and `localStorage`, and guards against accidental tab close when uncommitted AI diffs exist.
 */
export function useWorkspaceUrlSync(): void {
  const currentPhase = useWorkspaceSessionStore((s) => s.currentPhase);
  const zoomRootNodeId = useWorkspaceSessionStore((s) => s.zoomRootNodeId);
  const splitReferenceDocId = useWorkspaceSessionStore(
    (s) => s.splitReferenceDocId
  );
  const stagingCount = useWorkspaceSessionStore((s) => s.stagingQueue.length);
  const setPhase = useWorkspaceSessionStore((s) => s.setPhase);
  const zoomIntoNode = useWorkspaceSessionStore((s) => s.zoomIntoNode);
  const setSplitReferenceDocId = useWorkspaceSessionStore(
    (s) => s.setSplitReferenceDocId
  );

  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const setActiveDocId = useStudioDocumentStore((s) => s.setActiveDocId);

  // Write state to URL query parameters + localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("phase", currentPhase);
    params.set("zoom", zoomRootNodeId);
    if (activeDocId) {
      params.set("doc", activeDocId);
    }
    if (splitReferenceDocId) {
      params.set("splitRef", splitReferenceDocId);
    } else {
      params.delete("splitRef");
    }

    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", nextUrl);

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          phase: currentPhase,
          zoom: zoomRootNodeId,
          doc: activeDocId,
          splitRef: splitReferenceDocId,
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [currentPhase, zoomRootNodeId, activeDocId, splitReferenceDocId]);

  // Listen to browser Back/Forward navigation
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const p = params.get("phase") as WorkbenchPhase | null;
      if (p === "storylining" || p === "templating" || p === "drafting") {
        setPhase(p);
      }
      const z = params.get("zoom");
      if (z) zoomIntoNode(z);
      const d = params.get("doc");
      if (d) setActiveDocId(d);
      setSplitReferenceDocId(params.get("splitRef"));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setPhase, zoomIntoNode, setActiveDocId, setSplitReferenceDocId]);

  // Unsaved staged AI diff guard on tab close
  useEffect(() => {
    if (typeof window === "undefined" || stagingCount === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [stagingCount]);
}

