import type React from "react";
import {
  DEFAULT_SECTION_ELEMENT_DEF,
  DEFAULT_TABLE_ELEMENT_DEF,
  createDefaultRegistrySnapshot,
  type ElementRegistrySnapshot,
  type ElementSyntaxDefinition,
  type ElementSyntaxRule,
} from "@vibe/vdoc-schema";
import {
  STANDARD_BASE_STYLE_PACK,
  isValidStylePack,
  type StylePack,
} from "@vibe/style-core";
import { matchesCompoundExtension } from "@vibe/vault-core";

export const VAULT_SYSTEM_DIR = ".vibedoc";
export const STANDARD_SYNTAX_PATH = `${VAULT_SYSTEM_DIR}/element-registry.vsyntax`;
export const STANDARD_STYLE_PATH = `${VAULT_SYSTEM_DIR}/standard.vstyle`;

export function isSystemSettingsPath(path: string): boolean {
  const norm = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return norm === VAULT_SYSTEM_DIR || norm.startsWith(`${VAULT_SYSTEM_DIR}/`);
}

export function isSyntaxPath(path: string): boolean {
  return matchesCompoundExtension(path, "vsyntax");
}

export function isStylePath(path: string): boolean {
  return matchesCompoundExtension(path, "vstyle") || matchesCompoundExtension(path, "vstyle.json");
}

export function parseSyntaxSnapshot(raw: string): ElementRegistrySnapshot {
  try {
    const parsed = JSON.parse(raw) as Partial<ElementRegistrySnapshot>;
    if (parsed && Array.isArray(parsed.elements)) {
      return {
        version: parsed.version || "1.0.0",
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        description: parsed.description,
        profiles: Array.isArray(parsed.profiles)
          ? parsed.profiles
          : createDefaultRegistrySnapshot().profiles,
        elements: parsed.elements,
      };
    }
  } catch {
    // Fallback cleanly to default snapshot
  }
  return createDefaultRegistrySnapshot();
}

export function serializeSyntaxSnapshot(snapshot: ElementRegistrySnapshot): string {
  return JSON.stringify(
    {
      ...snapshot,
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

export function parseStylePackJson(raw: string): StylePack | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isValidStylePack(parsed)) return parsed;
  } catch {
    // Ignore invalid JSON
  }
  return null;
}

export function serializeStylePack(pack: StylePack): string {
  return JSON.stringify(
    {
      ...pack,
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

export function createDefaultStylePackJson(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "") || `style-${Date.now().toString(36)}`;
  return serializeStylePack({
    ...JSON.parse(JSON.stringify(STANDARD_BASE_STYLE_PACK)),
    id: slug,
    name: title,
    genre: "custom",
    description: `${title} — 표준 사양 기반 개별 적용 스타일`,
    sourceRef: undefined,
  });
}

export function createStandardBaseStyleJson(): string {
  return serializeStylePack(JSON.parse(JSON.stringify(STANDARD_BASE_STYLE_PACK)) as StylePack);
}

export function createDefaultSyntaxJson(title: string): string {
  const snap = createDefaultRegistrySnapshot();
  return serializeSyntaxSnapshot({
    ...snap,
    description: `${title} — 문서 요소 · 표현 기호 규격`,
  });
}

// ---- Scoped Syntax Conflict Detection (Obsidian Hotkeys parity) ----

export interface SyntaxConflictReport {
  /** Number of rules currently in conflict within their own Element scope. */
  readonly totalConflicts: number;
  /** Keys of shape `${elementId}:${ruleId}` that share a duplicate symbol in the same Element. */
  readonly conflictedRuleKeys: ReadonlySet<string>;
}

/**
 * 동일 Element 범위 안에서 2개 이상 규칙이 동일한 비공백 기호를 사용할 때만 충돌로 판정한다.
 * (서로 다른 Element 인 `table` 의 `|` 와 `section` 의 `|` 는 충돌이 아니다.)
 */
export function detectSyntaxRuleConflicts(
  snapshot: ElementRegistrySnapshot,
  scopeElementId?: string | null
): SyntaxConflictReport {
  const conflictedRuleKeys = new Set<string>();
  const elements = scopeElementId
    ? snapshot.elements.filter((e) => e.id === scopeElementId)
    : snapshot.elements;

  for (const el of elements) {
    const bySymbol = new Map<string, string[]>();
    for (const rule of el.rules) {
      const sym = rule.symbol.trim();
      if (!sym) continue;
      const key = `${el.id}:${rule.id}`;
      const list = bySymbol.get(sym) ?? [];
      list.push(key);
      bySymbol.set(sym, list);
    }
    for (const keys of bySymbol.values()) {
      if (keys.length > 1) {
        for (const k of keys) conflictedRuleKeys.add(k);
      }
    }
  }

  return {
    totalConflicts: conflictedRuleKeys.size,
    conflictedRuleKeys,
  };
}

const DEFAULT_ELEMENT_BY_ID = new Map<string, ElementSyntaxDefinition>([
  [DEFAULT_TABLE_ELEMENT_DEF.id, DEFAULT_TABLE_ELEMENT_DEF],
  [DEFAULT_SECTION_ELEMENT_DEF.id, DEFAULT_SECTION_ELEMENT_DEF],
]);

export function getDefaultRuleSymbol(elementId: string, ruleId: string): string | undefined {
  return DEFAULT_ELEMENT_BY_ID.get(elementId)?.rules.find((r) => r.id === ruleId)?.symbol;
}

export function isSyntaxRuleModified(elementId: string, rule: ElementSyntaxRule): boolean {
  const defSymbol = getDefaultRuleSymbol(elementId, rule.id);
  if (defSymbol === undefined) return true; // Custom user-added rule
  return defSymbol !== rule.symbol;
}

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
