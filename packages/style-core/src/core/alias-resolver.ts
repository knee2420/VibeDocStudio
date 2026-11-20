/**
 * @vibe/style-core — `{token.path}` Alias 재귀 해석기 (순환 참조 방어 + 안전 폴백).
 */
import type { StylePrimitives, StyleTokenValue } from "./token-contract";

const FULL_ALIAS_RE = /^\{([a-zA-Z0-9_.-]+)\}$/;
const INLINE_ALIAS_RE = /\{([a-zA-Z0-9_.-]+)\}/g;
const MAX_ALIAS_DEPTH = 12;

export function flattenPrimitives(primitives: StylePrimitives): Record<string, StyleTokenValue> {
  const flat: Record<string, StyleTokenValue> = {};
  for (const [category, entries] of Object.entries(primitives ?? {})) {
    if (!entries || typeof entries !== "object") continue;
    for (const [key, value] of Object.entries(entries)) {
      if (value !== undefined) {
        flat[`${category}.${key}`] = value;
      }
    }
  }
  return flat;
}

function lookupToken(
  key: string,
  semantic: Record<string, StyleTokenValue>,
  primitiveMap: Record<string, StyleTokenValue>
): StyleTokenValue | undefined {
  if (key in semantic) return semantic[key];
  if (key in primitiveMap) return primitiveMap[key];
  return undefined;
}

/**
 * 단일 토큰 문자열/값 안의 `{alias}` 참조를 재귀적으로 해석한다.
 * - 순환 참조(`a -> b -> a`)나 미존재 토큰을 만나도 예외를 던지지 않고 원문 또는 폴백 값을 유지한다.
 */
export function resolveAliasValue<T extends StyleTokenValue>(
  raw: T,
  semantic: Record<string, StyleTokenValue>,
  primitiveMap: Record<string, StyleTokenValue>,
  visited: ReadonlySet<string> = new Set(),
  depth = 0
): T {
  if (typeof raw !== "string" || depth >= MAX_ALIAS_DEPTH) return raw;

  const exact = FULL_ALIAS_RE.exec(raw.trim());
  if (exact) {
    const key = exact[1];
    if (visited.has(key)) return raw;
    const found = lookupToken(key, semantic, primitiveMap);
    if (found === undefined) return raw;
    const nextVisited = new Set(visited);
    nextVisited.add(key);
    return resolveAliasValue(found, semantic, primitiveMap, nextVisited, depth + 1) as T;
  }

  if (!raw.includes("{")) return raw;

  const replaced = raw.replace(INLINE_ALIAS_RE, (full, key: string) => {
    if (visited.has(key)) return full;
    const found = lookupToken(key, semantic, primitiveMap);
    if (found === undefined) return full;
    const nextVisited = new Set(visited);
    nextVisited.add(key);
    const resolved = resolveAliasValue(found, semantic, primitiveMap, nextVisited, depth + 1);
    return String(resolved);
  });

  return replaced as T;
}

/** 중첩 객체/배열 트리 전체의 문자열 필드에서 `{alias}` 를 일괄 해석한다. */
export function resolveAliasTree<T>(
  input: T,
  semantic: Record<string, StyleTokenValue>,
  primitiveMap: Record<string, StyleTokenValue>
): T {
  if (typeof input === "string") {
    return resolveAliasValue(input, semantic, primitiveMap) as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => resolveAliasTree(item, semantic, primitiveMap)) as T;
  }
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = v === undefined ? undefined : resolveAliasTree(v, semantic, primitiveMap);
    }
    return out as T;
  }
  return input;
}
