import type React from "react";
import type { OutlineNode } from "@vibe/outliner";
import type { OutlineHost } from "@vibe/outliner/editor";

export interface SlashTriggerEvent {
  nodeId: string;
  caretOffset: number;
  text: string;
  anchorEl: HTMLElement | null;
}

export interface CreateOutlineHostOptions {
  renderNodeBadge: (
    node: OutlineNode,
    ctx: { parentId: string | null; depth: number }
  ) => React.ReactNode;
  onSlashTrigger: (event: SlashTriggerEvent) => boolean | void;
}

export function createOutlineHost(options: CreateOutlineHostOptions): OutlineHost {
  return {
    confirm: async (message) => window.confirm(message),
    copyNodeLink: async (nodeId) => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`#node:${nodeId}`);
      }
    },
    exportText: (_fileName, text) => {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text);
      }
    },
    getPortalRoot: () => document.body,
    renderNodeBadge: options.renderNodeBadge,
    onSlashTrigger: options.onSlashTrigger,
  };
}
