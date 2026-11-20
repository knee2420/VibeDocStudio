import { extractFrontmatterBlock } from "@vibe/vault-core";

export type FrontmatterValue = string | number | boolean | string[];

export interface FrontmatterProperty {
  readonly key: string;
  readonly value: FrontmatterValue;
}

export interface ParsedFrontmatterDocument {
  readonly hasFrontmatter: boolean;
  readonly properties: readonly FrontmatterProperty[];
  readonly body: string;
  readonly bodyStartOffset: number;
}

function normalizeValue(raw: unknown): FrontmatterValue {
  if (typeof raw === "boolean" || typeof raw === "number" || typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item));
  }
  return raw === null || raw === undefined ? "" : String(raw);
}

export function parseFrontmatterDocument(content: string): ParsedFrontmatterDocument {
  const normalized = content.replace(/\r\n/g, "\n");
  const { frontmatter, bodyStartOffset, hasFrontmatter } = extractFrontmatterBlock(normalized);
  const properties: FrontmatterProperty[] = Object.entries(frontmatter).map(([key, val]) => ({
    key,
    value: normalizeValue(val),
  }));
  return {
    hasFrontmatter,
    properties,
    body: normalized.slice(bodyStartOffset),
    bodyStartOffset,
  };
}

function formatScalar(value: string | number | boolean): string {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (/[:#[\]{}\n]|^\s|\s$/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

export function serializeFrontmatter(
  properties: readonly FrontmatterProperty[],
  body: string
): string {
  if (properties.length === 0) {
    return body.replace(/^\n+/, "");
  }
  const lines: string[] = ["---"];
  for (const prop of properties) {
    const key = prop.key.trim();
    if (!key) continue;
    if (Array.isArray(prop.value)) {
      const items = prop.value.map((v) => v.trim()).filter(Boolean);
      lines.push(`${key}: [${items.map((v) => formatScalar(v)).join(", ")}]`);
    } else {
      lines.push(`${key}: ${formatScalar(prop.value)}`);
    }
  }
  lines.push("---");
  const cleanBody = body.startsWith("\n") ? body.slice(1) : body;
  return `${lines.join("\n")}\n${cleanBody}`;
}

export function upsertFrontmatterProperty(
  content: string,
  key: string,
  value: FrontmatterValue
): string {
  const parsed = parseFrontmatterDocument(content);
  const trimmedKey = key.trim();
  if (!trimmedKey) return content;

  const existingIdx = parsed.properties.findIndex((p) => p.key === trimmedKey);
  const nextProps = [...parsed.properties];
  if (existingIdx !== -1) {
    nextProps[existingIdx] = { key: trimmedKey, value };
  } else {
    nextProps.push({ key: trimmedKey, value });
  }
  return serializeFrontmatter(nextProps, parsed.body);
}

export function removeFrontmatterProperty(content: string, key: string): string {
  const parsed = parseFrontmatterDocument(content);
  const nextProps = parsed.properties.filter((p) => p.key !== key);
  return serializeFrontmatter(nextProps, parsed.body);
}

/**
 * 마크다운 체크박스(`- [ ]` ↔ `- [x]`)를 1-based 줄 번호 기준으로 토글한다.
 */
export function toggleMarkdownCheckboxAtLine(content: string, lineNumber1Based: number): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const idx = lineNumber1Based - 1;
  if (idx < 0 || idx >= lines.length) return content;
  const line = lines[idx];
  const toggled = line.replace(
    /^(\s*(?:[-*+]|\d+\.)\s+\[)([ xX])(\])/,
    (_m, pre: string, state: string, post: string) => `${pre}${state === " " ? "x" : " "}${post}`
  );
  if (toggled === line) return content;
  lines[idx] = toggled;
  return lines.join("\n");
}
