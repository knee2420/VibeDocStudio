import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { VaultMetadataCache, VaultPort } from "@vibe/vault-core";

export function collectWikilinkCompletions(
  vault: VaultPort,
  query: string
): Completion[] {
  const lower = query.toLowerCase();
  const items: Completion[] = [];

  for (const node of vault.listAll()) {
    if (node.kind !== "file") continue;
    const insertTarget = node.extension === "md" ? node.stem : node.name;
    if (
      lower &&
      !node.name.toLowerCase().includes(lower) &&
      !node.path.toLowerCase().includes(lower)
    ) {
      continue;
    }
    items.push({
      label: insertTarget,
      detail: node.parentPath || "/",
      type: node.extension === "outline" ? "class" : "file",
      apply: `${insertTarget}]]`,
    });
  }

  items.sort((a, b) => a.label.localeCompare(b.label));
  return items.slice(0, 30);
}

export function collectTagCompletions(
  metadataCache: VaultMetadataCache | undefined,
  query: string
): Completion[] {
  if (!metadataCache) return [];
  const lower = query.toLowerCase();
  return metadataCache
    .getAllTags()
    .filter((tag) => !lower || tag.toLowerCase().includes(lower))
    .slice(0, 25)
    .map((tag) => ({
      label: `#${tag}`,
      type: "keyword",
      apply: `#${tag}`,
    }));
}

export function createObsidianCompletionExtension(
  vault: VaultPort,
  metadataCache?: VaultMetadataCache
): Extension {
  const source = (context: CompletionContext): CompletionResult | null => {
    // 1. [[wikilink completion
    const wikiMatch = context.matchBefore(/\[\[[^\]\n]*$/);
    if (wikiMatch) {
      const query = wikiMatch.text.slice(2);
      const options = collectWikilinkCompletions(vault, query);
      if (options.length === 0) return null;
      return {
        from: wikiMatch.from + 2,
        options,
        validFor: /^[^\]\n]*$/,
      };
    }

    // 2. #tag completion
    const tagMatch = context.matchBefore(/(?:^|[\s(])#[a-zA-Z0-9_\-/\uAC00-\uD7A3]*$/);
    if (tagMatch) {
      const hashIdx = tagMatch.text.lastIndexOf("#");
      const query = tagMatch.text.slice(hashIdx + 1);
      const options = collectTagCompletions(metadataCache, query);
      if (options.length === 0) return null;
      return {
        from: tagMatch.from + hashIdx,
        options,
        validFor: /^#[a-zA-Z0-9_\-/\uAC00-\uD7A3]*$/,
      };
    }

    return null;
  };

  return autocompletion({
    override: [source],
    activateOnTyping: true,
    icons: false,
  });
}
