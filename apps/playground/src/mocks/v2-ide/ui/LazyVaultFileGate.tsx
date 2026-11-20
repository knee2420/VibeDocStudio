import React, { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { VaultPort } from "@vibe/vault-core";

export interface LazyVaultFileGateProps {
  readonly vault: VaultPort;
  readonly path: string;
  readonly children: React.ReactNode;
}

/**
 * Lazy-loading gate for text-based editor adapters.
 * - For MemoryVaultAdapter or already-cached files (`isLoaded(path) === true`): 0ms pass-through.
 * - For lazy-hydrated LocalApiVaultAdapter (`includeContents: false`): fetches text body on demand via `ensureLoaded(path)`.
 */
export const LazyVaultFileGate: React.FC<LazyVaultFileGateProps> = ({
  vault,
  path,
  children,
}) => {
  const [loadResult, setLoadResult] = useState<{
    readonly vault: VaultPort;
    readonly path: string;
    readonly state: "ready" | "error";
    readonly errorMsg: string | null;
  } | null>(null);

  const alreadyLoaded = !vault.isLoaded || !vault.ensureLoaded || vault.isLoaded(path);
  const matchingResult =
    loadResult && loadResult.vault === vault && loadResult.path === path ? loadResult : null;

  useEffect(() => {
    if (!vault.isLoaded || !vault.ensureLoaded || vault.isLoaded(path)) {
      return;
    }

    let cancelled = false;
    vault
      .ensureLoaded(path)
      .then(() => {
        if (!cancelled) {
          setLoadResult({ vault, path, state: "ready", errorMsg: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadResult({
            vault,
            path,
            state: "error",
            errorMsg: err instanceof Error ? err.message : "Failed to load file",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [vault, path]);

  if (!alreadyLoaded && matchingResult?.state === "error") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--obs-bg-primary,#1e1e1e)] p-6 text-center text-[12px] text-[var(--obs-danger,#fb464c)]">
        <AlertCircle className="h-5 w-5" />
        <div className="font-medium">Failed to load file</div>
        <div className="font-code text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
          {matchingResult.errorMsg}
        </div>
      </div>
    );
  }

  if (!alreadyLoaded && matchingResult?.state !== "ready") {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 bg-[var(--obs-bg-primary,#1e1e1e)] text-[12px] text-[var(--obs-text-muted,#b3b3b3)]">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--obs-accent,#8a5cf5)]" />
        <span>Loading {path}...</span>
      </div>
    );
  }

  return <>{children}</>;
};
