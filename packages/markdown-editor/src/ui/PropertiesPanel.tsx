import React, { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Tag, Trash2, X } from "lucide-react";

import type { FrontmatterProperty, FrontmatterValue } from "../core/frontmatter";

export interface PropertiesPanelProps {
  readonly properties: readonly FrontmatterProperty[];
  readonly onUpsert: (key: string, value: FrontmatterValue) => void;
  readonly onRemove: (key: string) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  properties,
  onUpsert,
  onRemove,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});

  const handleAddProperty = (ev: React.FormEvent) => {
    ev.preventDefault();
    const k = newKey.trim();
    if (!k) return;
    const isListKey = k.toLowerCase() === "tags" || k.toLowerCase() === "aliases";
    const parsed: FrontmatterValue = isListKey
      ? newVal
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : newVal.trim();
    onUpsert(k, parsed);
    setNewKey("");
    setNewVal("");
    setAdding(false);
  };

  return (
    <div className="mb-4 rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary-alt,#242424)] text-[12.5px]">
      <div className="flex h-8 select-none items-center justify-between px-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1 font-semibold text-[var(--obs-text-muted,#b3b3b3)] hover:text-[var(--obs-text-normal,#dadada)]"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          <span>Properties</span>
          <span className="ml-1 text-[11px] font-normal text-[var(--obs-text-faint,#666666)]">
            {properties.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCollapsed(false);
            setAdding(true);
          }}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
        >
          <Plus className="h-3 w-3" />
          <span>Add property</span>
        </button>
      </div>

      {!collapsed && (
        <div className="border-t border-[var(--obs-border-subtle,#2d2d2d)] px-2.5 py-2">
          {properties.length === 0 && !adding ? (
            <div className="py-1 text-[12px] text-[var(--obs-text-faint,#666666)]">
              No frontmatter properties yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {properties.map((prop) => {
                const isArray = Array.isArray(prop.value);
                const isBool = typeof prop.value === "boolean";
                return (
                  <div
                    key={prop.key}
                    className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.04))]"
                  >
                    <span className="flex w-28 shrink-0 items-center gap-1.5 truncate text-[12px] text-[var(--obs-text-muted,#b3b3b3)]">
                      {prop.key === "tags" && (
                        <Tag className="h-3 w-3 shrink-0 text-[var(--obs-accent,#8a5cf5)]" />
                      )}
                      <span className="truncate">{prop.key}</span>
                    </span>

                    <div className="min-w-0 flex-1">
                      {isArray ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {(prop.value as string[]).map((item) => (
                            <span
                              key={item}
                              className="inline-flex items-center gap-1 rounded-full bg-[rgba(138,92,245,0.16)] px-2 py-0 text-[11px] text-[var(--obs-accent-hover,#a68af9)]"
                            >
                              <span>{item}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpsert(
                                    prop.key,
                                    (prop.value as string[]).filter((x) => x !== item)
                                  )
                                }
                                className="hover:text-[var(--obs-text-normal,#dadada)]"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            value={tagDrafts[prop.key] ?? ""}
                            onChange={(ev) =>
                              setTagDrafts((prev) => ({ ...prev, [prop.key]: ev.target.value }))
                            }
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter") {
                                ev.preventDefault();
                                const v = (tagDrafts[prop.key] ?? "").trim();
                                if (!v) return;
                                onUpsert(prop.key, [...(prop.value as string[]), v]);
                                setTagDrafts((prev) => ({ ...prev, [prop.key]: "" }));
                              }
                            }}
                            placeholder="+ add"
                            className="w-20 bg-transparent text-[11.5px] text-[var(--obs-text-normal,#dadada)] placeholder:text-[var(--obs-text-faint,#666666)] outline-none"
                          />
                        </div>
                      ) : isBool ? (
                        <input
                          type="checkbox"
                          checked={prop.value as boolean}
                          onChange={(ev) => onUpsert(prop.key, ev.target.checked)}
                          style={{ accentColor: "var(--obs-accent,#8a5cf5)" }}
                        />
                      ) : (
                        <input
                          type="text"
                          value={String(prop.value)}
                          onChange={(ev) => onUpsert(prop.key, ev.target.value)}
                          className="w-full bg-transparent text-[12.5px] text-[var(--obs-text-normal,#dadada)] outline-none"
                        />
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemove(prop.key)}
                      title={`Remove ${prop.key}`}
                      className="rounded p-0.5 text-[var(--obs-text-faint,#666666)] opacity-0 hover:text-[var(--obs-danger,#fb464c)] group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {adding && (
            <form
              onSubmit={handleAddProperty}
              className="mt-2 flex items-center gap-1.5 border-t border-[var(--obs-border-subtle,#2d2d2d)] pt-2"
            >
              <input
                type="text"
                value={newKey}
                onChange={(ev) => setNewKey(ev.target.value)}
                placeholder="property name"
                autoFocus
                className="w-28 rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-2 py-0.5 text-[12px] text-[var(--obs-text-normal,#dadada)] outline-none"
              />
              <input
                type="text"
                value={newVal}
                onChange={(ev) => setNewVal(ev.target.value)}
                placeholder="value (comma-separated for tags)"
                className="min-w-0 flex-1 rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-2 py-0.5 text-[12px] text-[var(--obs-text-normal,#dadada)] outline-none"
              />
              <button
                type="submit"
                className="rounded bg-[var(--obs-accent,#8a5cf5)] px-2 py-0.5 text-[11px] font-medium text-white"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded px-1.5 py-0.5 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
