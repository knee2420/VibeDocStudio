/**
 * @vibe/style-core — CRUD 가능한 StylePackRegistry 및 Figma 식 Reset/Push 연산.
 */
import {
  VSTYLE_PROTOCOL,
  type StyleOverrideDelta,
  type StylePack,
} from "./token-contract";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isValidStylePack(raw: unknown): raw is StylePack {
  if (!raw || typeof raw !== "object") return false;
  const candidate = raw as Partial<StylePack>;
  return (
    candidate.protocol === VSTYLE_PROTOCOL &&
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.name === "string" &&
    typeof candidate.styles === "object" &&
    candidate.styles !== null
  );
}

/**
 * 런타임 및 볼트 파일(`.vstyle.json`)과 손실 없이 동기화되는 StylePack CRUD 레지스트리.
 */
export class StylePackRegistry {
  private readonly packs = new Map<string, StylePack>();

  constructor(initialPacks: readonly StylePack[] = []) {
    for (const pack of initialPacks) {
      this.packs.set(pack.id, deepClone(pack));
    }
  }

  list(): StylePack[] {
    return Array.from(this.packs.values()).map(deepClone);
  }

  get(id: string): StylePack | undefined {
    const found = this.packs.get(id);
    return found ? deepClone(found) : undefined;
  }

  has(id: string): boolean {
    return this.packs.has(id);
  }

  create(pack: StylePack): StylePack {
    if (!isValidStylePack(pack)) {
      throw new Error(`Invalid StylePack payload (expected protocol "${VSTYLE_PROTOCOL}").`);
    }
    if (this.packs.has(pack.id)) {
      throw new Error(`StylePack already exists: ${pack.id}`);
    }
    const stored = { ...deepClone(pack), updatedAt: pack.updatedAt ?? new Date().toISOString() };
    this.packs.set(stored.id, stored);
    return deepClone(stored);
  }

  update(id: string, patch: Partial<Omit<StylePack, "id" | "protocol">>): StylePack {
    const existing = this.packs.get(id);
    if (!existing) throw new Error(`StylePack not found: ${id}`);
    const merged: StylePack = deepClone({
      ...existing,
      ...patch,
      protocol: VSTYLE_PROTOCOL,
      id: existing.id,
      primitives: patch.primitives ? { ...existing.primitives, ...patch.primitives } : existing.primitives,
      modes: patch.modes ? { ...existing.modes, ...patch.modes } : existing.modes,
      styles: patch.styles
        ? {
            text: { ...existing.styles.text, ...patch.styles.text },
            frame: { ...existing.styles.frame, ...patch.styles.frame },
            table: { ...existing.styles.table, ...patch.styles.table },
            media: { ...existing.styles.media, ...patch.styles.media },
            pageChrome: { ...existing.styles.pageChrome, ...patch.styles.pageChrome },
          }
        : existing.styles,
      bindings: patch.bindings ? { ...existing.bindings, ...patch.bindings } : existing.bindings,
      updatedAt: new Date().toISOString(),
    });
    this.packs.set(id, merged);
    return deepClone(merged);
  }

  upsert(pack: StylePack): StylePack {
    if (this.packs.has(pack.id)) {
      const { id, protocol, ...rest } = pack;
      void protocol;
      return this.update(id, rest);
    }
    return this.create(pack);
  }

  delete(id: string): boolean {
    return this.packs.delete(id);
  }

  exportPackJson(id: string): string {
    const pack = this.get(id);
    if (!pack) throw new Error(`StylePack not found: ${id}`);
    return JSON.stringify(pack, null, 2);
  }

  importPackJson(rawJson: string): StylePack {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!isValidStylePack(parsed)) {
      throw new Error("Failed to import StylePack JSON: invalid protocol or missing required fields.");
    }
    return this.upsert(parsed);
  }
}

/** Figma "Reset Overrides": 블록 인스턴스 예외 스타일을 비워 스타일 팩 정본으로 복귀시킨다. */
export function resetStyleOverrides<T extends { styleOverrides?: StyleOverrideDelta }>(block: T): T {
  const { styleOverrides, ...rest } = block;
  void styleOverrides;
  return rest as T;
}

/**
 * Figma "Push Override to Style": 특정 블록에서 다듬은 `styleOverrides` 를
 * 바인딩된 `StylePack` 의 Composite Style 에 역반영한다.
 */
export function pushOverrideToPack(
  pack: StylePack,
  bindingKey: string,
  override: StyleOverrideDelta
): StylePack {
  const next = deepClone(pack);
  const bracketIdx = bindingKey.indexOf("[");
  const baseKey = bracketIdx >= 0 ? bindingKey.slice(0, bracketIdx) : bindingKey;
  const binding = next.bindings[bindingKey] ?? next.bindings[baseKey];
  if (!binding) return next;

  if (override.text && binding.textStyle) {
    next.styles.text[binding.textStyle] = {
      ...(next.styles.text[binding.textStyle] ?? {}),
      ...override.text,
    };
  }
  if (override.frame && binding.frameStyle) {
    next.styles.frame[binding.frameStyle] = {
      ...(next.styles.frame[binding.frameStyle] ?? {}),
      ...override.frame,
    };
  }
  if (override.table && binding.tableStyle) {
    const cur = next.styles.table[binding.tableStyle] ?? {};
    next.styles.table[binding.tableStyle] = {
      ...cur,
      ...override.table,
      borders:
        cur.borders || override.table.borders
          ? { ...(cur.borders ?? {}), ...(override.table.borders ?? {}) }
          : undefined,
    };
  }
  if (override.media && binding.mediaStyle) {
    next.styles.media[binding.mediaStyle] = {
      ...(next.styles.media[binding.mediaStyle] ?? {}),
      ...override.media,
    };
  }
  if (override.pageChrome && binding.pageChromeStyle) {
    const cur = next.styles.pageChrome[binding.pageChromeStyle] ?? {};
    next.styles.pageChrome[binding.pageChromeStyle] = {
      ...cur,
      ...override.pageChrome,
    };
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function createStylePackRegistry(initialPacks: readonly StylePack[] = []): StylePackRegistry {
  return new StylePackRegistry(initialPacks);
}
