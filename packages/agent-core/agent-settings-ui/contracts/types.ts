/**
 * Agent Settings & Engine Routing Headless Contracts
 * Any host application (VibePatchNote, VibeDocStudio, etc.) implements or consumes these contracts.
 */

export type PrimaryProvider = "agy_cli" | "google_api";
export type FallbackProvider = "agy_cli" | "google_api";

export interface RuntimePolicy {
  primaryProvider: PrimaryProvider;
  fallbackProvider: FallbackProvider;
  primaryModel: string;
  fallbackModel: string;
  primaryTimeoutSeconds: number;
  fallbackTimeoutSeconds: number;
  agentCliBin?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: PrimaryProvider | string;
  description?: string;
  recommended?: boolean;
}

export interface ProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  available: boolean;
  statusText?: string;
}

export interface RuntimeDashboard {
  policy: RuntimePolicy;
  googleConfigured: boolean;
  cliAvailable: boolean;
  models: ModelInfo[];
  cliVersion?: string;
}

export interface AgentSettingsTransport {
  getRuntimeDashboard(): Promise<RuntimeDashboard>;
  updateRuntimePolicy(policy: Partial<RuntimePolicy>): Promise<RuntimePolicy>;
  saveGoogleApiKey(apiKey: string): Promise<void>;
  removeGoogleApiKey(): Promise<void>;
}

