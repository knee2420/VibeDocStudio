import React from "react";

export interface PlaygroundMockEntry {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly label: string;
  readonly description: string;
  readonly Component: React.LazyExoticComponent<React.ComponentType>;
}

export const PLAYGROUND_MOCKS: readonly PlaygroundMockEntry[] = [
  {
    id: "v2-ide",
    aliases: ["v2", "ide"],
    label: "v2-ide",
    description: "Obsidian 90% (Vault · File Explorer · Split Tabs · .outline) + AGY-IDE Shell",
    Component: React.lazy(() => import("./v2-ide")),
  },
  {
    id: "v1-form-hub",
    aliases: ["v1", "form-hub", "playground"],
    label: "v1-form-hub",
    description: "기존 1차 목업 (아웃라이너 · 서식 에셋 허브 · 3단계 시트)",
    Component: React.lazy(() => import("./v1-form-hub")),
  },
];

export const DEFAULT_MOCK_ID = PLAYGROUND_MOCKS[0].id;

export function resolvePlaygroundMock(key: string | null | undefined): PlaygroundMockEntry | null {
  if (!key) return null;
  const normalized = key.trim().toLowerCase();
  if (!normalized) return null;
  return (
    PLAYGROUND_MOCKS.find(
      (mock) => mock.id === normalized || mock.aliases.includes(normalized)
    ) ?? null
  );
}

export function findPlaygroundMock(key: string | null | undefined): PlaygroundMockEntry {
  return resolvePlaygroundMock(key) ?? PLAYGROUND_MOCKS[0];
}
