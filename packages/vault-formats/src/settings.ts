/** 볼트 설정 파일 형식 (`.vibedoc/` · `.vsyntax` · `.vstyle`) — 읽기 · 쓰기 · 기본값 · 규칙 충돌 검사. */
import {
  DEFAULT_RESOURCE_ELEMENT_DEF,
  DEFAULT_SECTION_ELEMENT_DEF,
  DEFAULT_TABLE_ELEMENT_DEF,
  createDefaultRegistrySnapshot,
  withStructureGrammarDefaults,
  type ElementRegistrySnapshot,
  type ElementSyntaxDefinition,
  type ElementSyntaxRule,
  type EvidencePresentation,
} from "@vibe/vdoc-schema";
import {
  STANDARD_BASE_STYLE_PACK,
  isValidStylePack,
  type StylePack,
} from "@vibe/style-core";
import { matchesCompoundExtension, type VaultPort } from "@vibe/vault-core";

export const VAULT_SYSTEM_DIR = ".vibedoc";
export const STANDARD_SYNTAX_PATH = `${VAULT_SYSTEM_DIR}/element-registry.vsyntax`;
export const STANDARD_STYLE_PATH = `${VAULT_SYSTEM_DIR}/standard.vstyle`;
export const EVIDENCE_SETTINGS_PATH = `${VAULT_SYSTEM_DIR}/evidence-settings.json`;

export type VisibleEvidencePresentation = Exclude<EvidencePresentation, "hidden">;
export type EvidenceDisplayPolicy = "link-first" | "force-default";
export type EvidenceClickAction = "open-pair" | "popover";

export interface VaultEvidenceSettings {
  readonly version: "1.0.0";
  /** 주력 리소스·근거 표현형 (미지정 시 기본값 및 일괄 보기 대상) */
  readonly defaultPresentation: VisibleEvidencePresentation;
  /** 기존 문서 표시 정책: 링크별 설정 우선 | 전역 일괄 보기 */
  readonly displayPolicy: EvidenceDisplayPolicy;
  /** 각주/근거 클릭 동작: 즉시 페어 탭 + 하이라이트 | 팝오버 먼저 보기 */
  readonly clickAction: EvidenceClickAction;
  readonly updatedAt?: string;
}

export const DEFAULT_VAULT_EVIDENCE_SETTINGS: VaultEvidenceSettings = {
  version: "1.0.0",
  defaultPresentation: "footnote",
  displayPolicy: "link-first",
  clickAction: "open-pair",
};

const VALID_VISIBLE_PRESENTATIONS = new Set<VisibleEvidencePresentation>([
  "footnote",
  "inline-rationale",
  "sidenote",
  "quote-embed",
  "matrix",
  "bound-value",
]);

export function parseVaultEvidenceSettings(raw: string): VaultEvidenceSettings {
  try {
    const parsed = JSON.parse(raw) as Partial<VaultEvidenceSettings> | null;
    if (parsed && typeof parsed === "object") {
      const defaultPresentation =
        typeof parsed.defaultPresentation === "string" &&
        VALID_VISIBLE_PRESENTATIONS.has(parsed.defaultPresentation as VisibleEvidencePresentation)
          ? (parsed.defaultPresentation as VisibleEvidencePresentation)
          : DEFAULT_VAULT_EVIDENCE_SETTINGS.defaultPresentation;
      const displayPolicy: EvidenceDisplayPolicy =
        parsed.displayPolicy === "force-default" || parsed.displayPolicy === "link-first"
          ? parsed.displayPolicy
          : DEFAULT_VAULT_EVIDENCE_SETTINGS.displayPolicy;
      const clickAction: EvidenceClickAction =
        parsed.clickAction === "popover" || parsed.clickAction === "open-pair"
          ? parsed.clickAction
          : DEFAULT_VAULT_EVIDENCE_SETTINGS.clickAction;
      return {
        version: "1.0.0",
        defaultPresentation,
        displayPolicy,
        clickAction,
        ...(typeof parsed.updatedAt === "string" ? { updatedAt: parsed.updatedAt } : {}),
      };
    }
  } catch {
    // Fallback cleanly to default settings
  }
  return DEFAULT_VAULT_EVIDENCE_SETTINGS;
}

export function serializeVaultEvidenceSettings(settings: VaultEvidenceSettings): string {
  return JSON.stringify(
    {
      ...settings,
      version: "1.0.0",
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

export function readVaultEvidenceSettings(vault: VaultPort): VaultEvidenceSettings {
  if (!vault.exists(EVIDENCE_SETTINGS_PATH)) {
    return DEFAULT_VAULT_EVIDENCE_SETTINGS;
  }
  if (vault.isLoaded && !vault.isLoaded(EVIDENCE_SETTINGS_PATH)) {
    return DEFAULT_VAULT_EVIDENCE_SETTINGS;
  }
  try {
    return parseVaultEvidenceSettings(vault.read(EVIDENCE_SETTINGS_PATH));
  } catch {
    return DEFAULT_VAULT_EVIDENCE_SETTINGS;
  }
}

export function writeVaultEvidenceSettings(
  vault: VaultPort,
  next: VaultEvidenceSettings
): VaultEvidenceSettings {
  const stamped: VaultEvidenceSettings = {
    version: "1.0.0",
    defaultPresentation: next.defaultPresentation,
    displayPolicy: next.displayPolicy,
    clickAction: next.clickAction,
    updatedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(stamped, null, 2);
  if (vault.exists(EVIDENCE_SETTINGS_PATH)) {
    vault.write(EVIDENCE_SETTINGS_PATH, serialized);
  } else {
    vault.createFile(EVIDENCE_SETTINGS_PATH, serialized);
  }
  return stamped;
}

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
      // 옛 .vsyntax 에 계층 문법(층 · 담기 규칙 · 출력 단위)이 없으면 기본값으로 보충 — 설정 화면에 보이고 저장 시 정식 필드가 된다.
      return withStructureGrammarDefaults({
        version: parsed.version || "1.0.0",
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        description: parsed.description,
        profiles: Array.isArray(parsed.profiles)
          ? parsed.profiles
          : createDefaultRegistrySnapshot().profiles,
        elements: parsed.elements,
      });
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
  [DEFAULT_RESOURCE_ELEMENT_DEF.id, DEFAULT_RESOURCE_ELEMENT_DEF],
]);

export function getDefaultRuleSymbol(elementId: string, ruleId: string): string | undefined {
  return DEFAULT_ELEMENT_BY_ID.get(elementId)?.rules.find((r) => r.id === ruleId)?.symbol;
}

export function isSyntaxRuleModified(elementId: string, rule: ElementSyntaxRule): boolean {
  const defSymbol = getDefaultRuleSymbol(elementId, rule.id);
  if (defSymbol === undefined) return true; // Custom user-added rule
  return defSymbol !== rule.symbol;
}
