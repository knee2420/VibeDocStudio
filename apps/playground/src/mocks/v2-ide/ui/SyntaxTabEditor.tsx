import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Keyboard, Layers, Table2 } from "lucide-react";
import type { ElementRegistrySnapshot } from "@vibe/vdoc-schema";
import type { EditorHostContext, EditorOutlineHostContext } from "@vibe/workspace-layout/core";

import type { IdeEditorEnv } from "../model/editorAdapters";
import { detectSyntaxRuleConflicts, parseSyntaxSnapshot } from "@vibe/vault-formats";
import { SyntaxSettingsView } from "./settings";

export const SyntaxTabEditor: React.FC<{
  readonly host: EditorHostContext<IdeEditorEnv>;
}> = ({ host }) => (
  <div className="h-full w-full overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)]">
    <SyntaxSettingsView vault={host.env.vault} path={host.path} />
  </div>
);

export const SyntaxStructurePanel: React.FC<{
  readonly host: EditorOutlineHostContext<IdeEditorEnv>;
}> = ({ host }) => {
  const { vault } = host.env;
  const [snapshot, setSnapshot] = useState<ElementRegistrySnapshot>(() =>
    vault.exists(host.path) && (!vault.isLoaded || vault.isLoaded(host.path))
      ? parseSyntaxSnapshot(vault.read(host.path))
      : parseSyntaxSnapshot("")
  );

  useEffect(() => {
    const reload = () => {
      if (!vault.exists(host.path)) return;
      if (vault.isLoaded && !vault.isLoaded(host.path)) return;
      setSnapshot(parseSyntaxSnapshot(vault.read(host.path)));
    };
    reload();
    return vault.subscribe((ev) => {
      if ((ev.type === "modify" && ev.path === host.path) || ev.type === "vault-reset") {
        reload();
      }
    });
  }, [vault, host.path]);

  const conflicts = useMemo(() => detectSyntaxRuleConflicts(snapshot), [snapshot]);

  return (
    <div className="h-full overflow-y-auto px-2.5 py-2 text-[11.5px]">
      <div className="mb-2 flex items-center justify-between text-[10px] font-semibold tracking-wider text-[var(--obs-text-faint,#777)] uppercase">
        <span className="flex items-center gap-1">
          <Keyboard className="h-3 w-3 text-indigo-400" />
          <span>ELEMENTS ({snapshot.elements.length})</span>
        </span>
        {conflicts.totalConflicts > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-[#7f1d1d]/70 px-1.5 py-0.5 text-[9.5px] text-[#fca5a5]">
            <AlertTriangle className="h-2.5 w-2.5" />
            충돌 {conflicts.totalConflicts}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {snapshot.elements.map((el) => {
          const elConflicts = detectSyntaxRuleConflicts(snapshot, el.id).totalConflicts;
          return (
            <div
              key={el.id}
              className="flex items-center justify-between gap-2 rounded px-2 py-1 text-[var(--obs-text-normal,#dcdcdc)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.05))]"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {el.id === "table" ? (
                  <Table2 className="h-3 w-3 shrink-0 text-indigo-400" />
                ) : (
                  <Layers className="h-3 w-3 shrink-0 text-indigo-400" />
                )}
                <span className="truncate font-medium">{el.label}</span>
              </span>
              <span className="shrink-0 font-code text-[10px] text-[var(--obs-text-faint,#777)]">
                {elConflicts > 0 ? `충돌 ${elConflicts}` : `${el.rules.length} 규칙`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 mb-1 text-[10px] font-semibold tracking-wider text-[var(--obs-text-faint,#777)] uppercase">
        PROFILES ({snapshot.profiles.length})
      </div>
      <div className="space-y-1">
        {snapshot.profiles.map((prof) => (
          <div
            key={prof.id}
            className="flex items-center justify-between gap-2 rounded px-2 py-1 text-[var(--obs-text-muted,#b3b3b3)]"
          >
            <span className="truncate">{prof.label}</span>
            <span className="shrink-0 font-code text-[10px] text-[var(--obs-text-faint,#777)]">
              {prof.surface.width}px
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
