import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Atomic Inline Variable Node ported from Maily.to (`_upstreams/maily.to/packages/core/src/editor/nodes/variable/variable.ts`)
 * and PandaDoc Kolas Editor (`[Sender.Company]` with zero-width space isolation).
 */
export const VariableChipNode = Node.create({
  name: "variableChip",
  group: "inline",
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      variableName: {
        default: "Sender.Company",
        parseHTML: (element) =>
          element.getAttribute("data-variable") ||
          element.textContent?.replace(/^\[|\]$/g, "") ||
          "Variable",
        renderHTML: (attributes) => ({
          "data-variable": attributes.variableName,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-variable]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const varName = HTMLAttributes["data-variable"] || "Variable";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class:
          "inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-amber-100/90 text-amber-900 border border-amber-300 text-[0.85em] font-mono font-medium select-none",
      }),
      `[${varName}]`,
    ];
  },
});

/**
 * Official Seal `(인)` & Signature `(서명)` Inline Node using Maily.to's custom variable/pill renderer pattern.
 * Supports `data-stamp="seal" | "sign"`, `data-label="(인)"`, and `data-float="right"`.
 */
export const StampChipNode = Node.create({
  name: "stampChip",
  group: "inline",
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      stampType: {
        default: "seal",
        parseHTML: (element) => element.getAttribute("data-stamp") || "seal",
        renderHTML: (attributes) => ({
          "data-stamp": attributes.stampType,
        }),
      },
      label: {
        default: "(인)",
        parseHTML: (element) =>
          element.getAttribute("data-label") || element.textContent || "(인)",
        renderHTML: (attributes) => ({
          "data-label": attributes.label,
        }),
      },
      floatRight: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-float") === "right",
        renderHTML: (attributes) =>
          attributes.floatRight ? { "data-float": "right" } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-stamp]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const stampType = HTMLAttributes["data-stamp"] || "seal";
    const label = HTMLAttributes["data-label"] || "(인)";
    const isFloatRight = HTMLAttributes["data-float"] === "right";
    const colorClass =
      stampType === "sign"
        ? "text-[#1d4ed8] font-medium text-[0.88em]"
        : "text-[#b91c1c] font-semibold text-[0.92em]";
    const floatClass = isFloatRight ? "float-right ml-2" : "";

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: `${colorClass} ${floatClass} select-none`,
      }),
      label,
    ];
  },
});
