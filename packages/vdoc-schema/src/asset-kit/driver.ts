/**
 * @vibe/vdoc-schema — One-Switch Zero-Ripple Asset Schema Driver Registry (`v1` <-> `v2`).
 *
 * 소비자(`VDocAssetPanel`, `VDocTabEditor`, `RefTabEditor`, `vault-formats`, `ai-vault`)는
 * 버전을 직접 분기하지 않고 `getActiveAssetDriver()` 파사드만 호출한다.
 * 스위치(`setActiveAssetSchemaVersion`) 한 번으로 Import · Apply · Select + 시드 + 볼트 네임스페이스가 일괄 전환된다.
 */
import type { LayoutBlock, VDocSlot } from "../types";
import type {
  AssetFlowMode,
  AssetPrimitiveKind,
  AssetSchemaVersion,
  VDocAsset,
} from "./types";

export interface AssetSelectSummary {
  readonly schemaVersion: AssetSchemaVersion;
  readonly flowMode: AssetFlowMode;
  readonly badges: readonly string[];
  readonly primitiveKinds: readonly AssetPrimitiveKind[];
  readonly fieldCount: number;
  readonly evidenceHintCount: number;
  readonly agentPromptLine: string;
}

export interface AssetRecommendationHit {
  readonly asset: VDocAsset;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface AssetSchemaDriver {
  readonly version: AssetSchemaVersion;
  readonly label: string;
  readonly description: string;
  /** 볼트 내 격리 서브폴더 (v1 = "" 호환, v2 = "v2" → `.vibedoc/assets/v2/`) */
  readonly vaultSubdir: string;
  getSeeds(): readonly VDocAsset[];
  compileToPreview(asset: VDocAsset): {
    readonly blocks: LayoutBlock[];
    readonly slots: Record<string, VDocSlot>;
    readonly outlineDsl: string[];
  };
  summarizeForSelect(asset: VDocAsset): AssetSelectSummary;
  recommendForQuery(
    query: string,
    catalog: readonly VDocAsset[]
  ): readonly AssetRecommendationHit[];
}

const STORAGE_KEY = "vibe.asset.schemaVersion.v1";

function readInitialVersion(): AssetSchemaVersion {
  if (typeof window !== "undefined") {
    try {
      const qs = new URLSearchParams(window.location.search).get("asset_v");
      if (qs === "v1" || qs === "v2") return qs;
      const saved = window.localStorage?.getItem(STORAGE_KEY);
      if (saved === "v1" || saved === "v2") return saved;
    } catch {
      // Ignore storage access errors
    }
    return "v2";
  }
  return "v1";
}

const drivers = new Map<AssetSchemaVersion, AssetSchemaDriver>();
let activeVersion: AssetSchemaVersion = readInitialVersion();
const listeners = new Set<() => void>();

export function registerAssetSchemaDriver(driver: AssetSchemaDriver): void {
  drivers.set(driver.version, driver);
}

export function getActiveAssetSchemaVersion(): AssetSchemaVersion {
  return activeVersion;
}

export function setActiveAssetSchemaVersion(next: AssetSchemaVersion): void {
  if (next === activeVersion) return;
  activeVersion = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }
  for (const fn of listeners) fn();
}

export function subscribeAssetSchemaVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAssetDriver(version: AssetSchemaVersion): AssetSchemaDriver {
  const hit = drivers.get(version) ?? drivers.values().next().value;
  if (!hit) {
    throw new Error(`No AssetSchemaDriver registered for version "${version}"`);
  }
  return hit;
}

export function getActiveAssetDriver(): AssetSchemaDriver {
  return getAssetDriver(activeVersion);
}

export function listAssetSchemaDrivers(): readonly AssetSchemaDriver[] {
  return Array.from(drivers.values());
}
