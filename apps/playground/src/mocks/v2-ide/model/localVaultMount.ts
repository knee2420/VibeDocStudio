import {
  LocalApiVaultAdapter,
  createOrMountLocalVault,
  type LocalVaultSummary,
} from "@vibe/vault-core";

export const LOCAL_VAULT_BRIDGE_BASE = "/local-vault-api";

export interface MountLocalFolderOptions {
  readonly rootPath: string;
  readonly name?: string;
  /** Default `true` so external/partial vaults are safely read-only unless explicitly unlocked. */
  readonly readOnly?: boolean;
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export interface MountedLocalVaultHandle {
  readonly adapter: LocalApiVaultAdapter;
  readonly summary: LocalVaultSummary;
}

/**
 * Mounts any local filesystem directory (full vault or partially migrated subfolder)
 * through the Vite dev server bridge with:
 * - Lazy content loading (`includeContents: false`: metadata tree loads in <500ms even for 4,000+ files)
 * - Read-only safety lock by default (`readOnly: true`)
 * - Binary streaming for images & PDFs via `adapter.getBinaryUrl(path)`
 */
export async function mountLocalFolderAsVault(
  options: MountLocalFolderOptions
): Promise<MountedLocalVaultHandle> {
  const apiBaseUrl = options.apiBaseUrl ?? LOCAL_VAULT_BRIDGE_BASE;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const readOnly = options.readOnly ?? true;

  const summary = await createOrMountLocalVault(
    apiBaseUrl,
    {
      name: options.name?.trim() || options.rootPath.split(/[\\/]/).filter(Boolean).pop() || "Local Vault",
      rootPath: options.rootPath.trim(),
    },
    fetchImpl
  );

  const adapter = new LocalApiVaultAdapter({
    vaultId: summary.id,
    name: summary.name,
    rootPath: summary.rootPath,
    apiBaseUrl,
    includeContents: false,
    readOnly,
    enableWatch: false,
    fetchImpl,
  });

  await adapter.hydrate();
  return { adapter, summary };
}
