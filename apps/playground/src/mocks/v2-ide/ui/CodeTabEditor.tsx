import React, { useEffect, useState } from "react";
import type { VaultPort } from "@vibe/vault-core";

export interface CodeTabEditorProps {
  readonly vault: VaultPort;
  readonly path: string;
}

export const CodeTabEditor: React.FC<CodeTabEditorProps> = ({ vault, path }) => {
  const [content, setContent] = useState<string>(() => {
    try {
      return vault.read(path);
    } catch {
      return "";
    }
  });

  useEffect(() => {
    const sync = () => {
      if (!vault.exists(path)) return;
      try {
        setContent(vault.read(path));
      } catch {
        // Ignore
      }
    };
    sync();
    return vault.subscribe((ev) => {
      if ((ev.type === "modify" && ev.path === path) || ev.type === "vault-reset") {
        sync();
      }
    });
  }, [vault, path]);

  const lines = content.split("\n");

  return (
    <div className="flex h-full w-full overflow-auto bg-[var(--obs-bg-primary,#1e1e1e)] font-code text-[12.5px] leading-6">
      <div className="shrink-0 select-none border-r border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary-alt,#242424)] px-3 py-4 text-right text-[var(--obs-text-faint,#666666)]">
        {lines.map((_, idx) => (
          <div key={idx}>{idx + 1}</div>
        ))}
      </div>
      <textarea
        value={content}
        onChange={(ev) => {
          setContent(ev.target.value);
          vault.write(path, ev.target.value);
        }}
        spellCheck={false}
        className="min-h-full flex-1 resize-none bg-transparent p-4 text-[var(--obs-text-normal,#dadada)] outline-none"
      />
    </div>
  );
};
