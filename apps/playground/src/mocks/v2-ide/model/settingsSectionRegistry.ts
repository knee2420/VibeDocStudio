import type React from "react";

/** 설정 화면 섹션 레지스트리 (Obsidian 식) — 화면 조립이라 앱에 둔다. */
// ---- Extensible Obsidian-style Settings Registry ----

export type SettingsGroupId = "options" | "elements" | "styles" | "ai-harness";

export interface SettingsGroupMeta {
  readonly id: SettingsGroupId;
  readonly label: string;
  readonly order: number;
}

export const SETTINGS_GROUPS: readonly SettingsGroupMeta[] = [
  { id: "options", label: "옵션 (표준 사양)", order: 1 },
  { id: "elements", label: "요소 규격 (.vsyntax)", order: 2 },
  { id: "styles", label: "개별 적용 스타일 (.vstyle)", order: 3 },
  { id: "ai-harness", label: "AI & 하네스", order: 4 },
];

export interface SettingsSectionDefinition {
  readonly id: string;
  readonly group: SettingsGroupId;
  readonly label: string;
  readonly subtitle?: string;
  readonly icon: React.ReactNode;
  readonly keywords: readonly string[];
  readonly badge?: string;
  readonly render: () => React.ReactNode;
}

export class SettingsSectionRegistry {
  private readonly sections = new Map<string, SettingsSectionDefinition>();

  register(def: SettingsSectionDefinition): void {
    this.sections.set(def.id, def);
  }

  registerMany(defs: readonly SettingsSectionDefinition[]): void {
    for (const def of defs) this.register(def);
  }

  listAll(): SettingsSectionDefinition[] {
    return Array.from(this.sections.values());
  }

  get(id: string): SettingsSectionDefinition | undefined {
    return this.sections.get(id);
  }

  search(query: string): SettingsSectionDefinition[] {
    const q = query.trim().toLowerCase();
    const all = this.listAll();
    if (!q) return all;
    return all.filter((sec) => {
      if (sec.label.toLowerCase().includes(q)) return true;
      if (sec.subtitle?.toLowerCase().includes(q)) return true;
      return sec.keywords.some((kw) => kw.toLowerCase().includes(q));
    });
  }
}

export function createSettingsSectionRegistry(
  initial: readonly SettingsSectionDefinition[] = []
): SettingsSectionRegistry {
  const reg = new SettingsSectionRegistry();
  reg.registerMany(initial);
  return reg;
}
