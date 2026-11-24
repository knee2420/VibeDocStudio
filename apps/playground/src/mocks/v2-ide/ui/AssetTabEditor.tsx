import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Blocks,
  Check,
  Code2,
  ExternalLink,
  Layers,
  RefreshCw,
  Sparkles,
  Tag,
} from "lucide-react";
import type { VDocAsset, VDocAssetKind } from "@vibe/vdoc-schema";
import { stem } from "@vibe/vault-core";
import type { EditorHostContext, EditorOutlineHostContext } from "@vibe/workspace-layout/core";

import {
  compileOutlineDslLinesToAssetBlocks,
  fromVaultUri,
  parseVAssetJson,
  serializeVAssetJson,
} from "@vibe/vault-formats";
import type { IdeEditorEnv } from "../model/editorAdapters";
import { VDocAssetThumbnail } from "./VDocAssetThumbnail";

const ASSET_KIND_OPTIONS: readonly { id: VDocAssetKind; label: string }[] = [
  { id: "a4-page", label: "A4 페이지" },
  { id: "blog-section", label: "블로그 섹션" },
  { id: "table", label: "표 · 서식" },
  { id: "list", label: "목록" },
  { id: "callout", label: "정보카드 · 콜아웃" },
  { id: "columns", label: "다단 그리드" },
];

export const AssetTabEditor: React.FC<{
  readonly host: EditorHostContext<IdeEditorEnv>;
}> = ({ host }) => {
  const { vault } = host.env;
  const path = host.path;

  const [asset, setAsset] = useState<VDocAsset | null>(() =>
    vault.exists(path) ? parseVAssetJson(vault.read(path)) : null
  );
  const [dslDraft, setDslDraft] = useState<string>(() =>
    asset ? asset.structure.outlineDsl.join("\n") : ""
  );
  const [rulesDraft, setRulesDraft] = useState<string>(() =>
    asset ? asset.nuance.structureRules.join("\n") : ""
  );
  const [hintsDraft, setHintsDraft] = useState<string>(() =>
    asset ? (asset.nuance.adaptationHints ?? []).join("\n") : ""
  );
  const [tagsDraft, setTagsDraft] = useState<string>(() =>
    asset ? asset.tags.join(", ") : ""
  );
  const [saveMessage, setSaveMessage] = useState<{
    readonly kind: "ok" | "error";
    readonly text: string;
  } | null>(null);
  const [previewScale, setPreviewScale] = useState(0.58);

  useEffect(() => {
    const reload = () => {
      if (!vault.exists(path)) return;
      const parsed = parseVAssetJson(vault.read(path));
      if (!parsed) return;
      setAsset(parsed);
      setDslDraft(parsed.structure.outlineDsl.join("\n"));
      setRulesDraft(parsed.nuance.structureRules.join("\n"));
      setHintsDraft((parsed.nuance.adaptationHints ?? []).join("\n"));
      setTagsDraft(parsed.tags.join(", "));
    };
    return vault.subscribe((ev) => {
      if ((ev.type === "modify" && ev.path === path) || ev.type === "vault-reset") {
        reload();
      }
    });
  }, [vault, path]);

  const handleCompileAndSave = () => {
    if (!asset) return;
    const outlineDsl = dslDraft.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const profileId: "a4" | "blog" = asset.assetKind === "blog-section" ? "blog" : "a4";
    const compiled = compileOutlineDslLinesToAssetBlocks(outlineDsl, {
      profileId,
      prefix: asset.assetId.replace(/[^a-z0-9]/gi, "").slice(0, 14) || "ast",
      sectionTitle: asset.title,
    });

    if (compiled.blocks.length === 0) {
      setSaveMessage({
        kind: "error",
        text: `컴파일 결과가 비어 있습니다: ${compiled.errors.join(", ") || "문법을 확인하세요."}`,
      });
      return;
    }

    const nextAsset: VDocAsset = {
      ...asset,
      tags: tagsDraft
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      nuance: {
        ...asset.nuance,
        structureRules: rulesDraft
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
        adaptationHints: hintsDraft
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
      },
      structure: {
        ...asset.structure,
        outlineDsl,
        blocks: compiled.blocks,
        slots: compiled.slots,
      },
    };
    vault.write(path, serializeVAssetJson(nextAsset));
    setAsset(nextAsset);
    setSaveMessage({
      kind: "ok",
      text: `저장 & 재컴파일 완료 (${compiled.blocks.length}블록 · ${Object.keys(compiled.slots).length}슬롯)`,
    });
  };

  const rawSourceRef = asset?.origin.sourceRef;
  const sourceTargetPath = useMemo(() => {
    if (!rawSourceRef) return null;
    const raw = rawSourceRef.split("#")[0];
    return fromVaultUri(raw);
  }, [rawSourceRef]);

  if (!asset) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-[var(--obs-bg-primary,#1e1e1e)] p-6 text-center text-[12px] text-[var(--obs-text-muted,#9a9a9a)]">
        <AlertTriangle className="h-6 w-6 text-amber-400" />
        <p className="font-medium text-[var(--obs-text-normal,#ececec)]">
          유효한 .vasset 에셋 JSON 형식이 아닙니다 ({stem(path)})
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)] text-[var(--obs-text-normal,#e6edf3)]">
      {/* Top Editor Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#252525)] px-3 text-[11.5px]">
        <div className="flex min-w-0 items-center gap-2">
          <Blocks className="h-4 w-4 shrink-0 text-emerald-400" />
          <input
            type="text"
            value={asset.title}
            onChange={(ev) => setAsset({ ...asset, title: ev.target.value })}
            aria-label="에셋 이름"
            className="min-w-[180px] rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[12.5px] font-semibold text-white outline-none hover:border-white/15 focus:border-emerald-400 focus:bg-black/30"
          />
          <select
            value={asset.assetKind}
            onChange={(ev) => {
              const kind = ev.target.value as VDocAssetKind;
              setAsset({
                ...asset,
                assetKind: kind,
                scope: kind === "a4-page" || kind === "blog-section" ? "section" : "element",
              });
            }}
            aria-label="에셋 종류"
            className="rounded border border-[var(--obs-border,#3a3a3a)] bg-[var(--obs-bg-primary,#1a1a1a)] px-2 py-0.5 text-[11px] text-emerald-300 outline-none"
          >
            {ASSET_KIND_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-code text-[10px] text-[var(--obs-text-faint,#8a8a8a)]">
            {asset.assetId}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {sourceTargetPath && vault.exists(sourceTargetPath) && (
            <button
              type="button"
              onClick={() => {
                if (host.env.openInPairTabGroup) {
                  host.env.openInPairTabGroup(sourceTargetPath, {
                    sourceTabId: host.tabId,
                    sourcePath: host.path,
                  });
                } else {
                  host.openLink(sourceTargetPath, "split-right");
                }
              }}
              className="flex items-center gap-1 rounded border border-[var(--obs-border,#3a3a3a)] bg-black/25 px-2 py-1 text-[10.5px] text-[var(--obs-text-muted,#b8b8b8)] hover:border-emerald-400/50 hover:text-white"
            >
              <ExternalLink className="h-3 w-3" />
              <span>원천 문서 열기</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCompileAndSave}
            className="flex items-center gap-1.5 rounded bg-emerald-500/25 px-2.5 py-1 text-[11px] font-medium text-emerald-200 ring-1 ring-emerald-500/40 transition-colors hover:bg-emerald-500/35"
          >
            <RefreshCw className="h-3 w-3" />
            <span>구조 재컴파일 &amp; 저장</span>
          </button>
        </div>
      </div>

      {saveMessage && (
        <div
          className={`flex shrink-0 items-center gap-1.5 border-b px-3 py-1 text-[11px] ${
            saveMessage.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          {saveMessage.kind === "ok" ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
          )}
          <span>{saveMessage.text}</span>
        </div>
      )}

      {/* Main Split: Left Spec & DSL Editor / Right Live 2D Canvas Preview */}
      <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-[var(--obs-border-subtle,#2d2d2d)] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {/* Left: Nuance + Outline DSL */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3.5 text-[11.5px]">
          <section className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#8a8a8a)] uppercase">
              <Sparkles className="h-3 w-3 text-emerald-400" />
              <span>구조 뉘앙스 요약 (AI 프롬프트 핵심)</span>
            </label>
            <textarea
              value={asset.nuance.summary}
              onChange={(ev) =>
                setAsset({
                  ...asset,
                  nuance: { ...asset.nuance, summary: ev.target.value },
                })
              }
              rows={2}
              className="w-full resize-none rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#242424)] p-2 text-[11.5px] leading-5 outline-none focus:border-emerald-400"
            />
          </section>

          <div className="grid grid-cols-2 gap-2.5">
            <section className="space-y-1">
              <label className="text-[10.5px] font-semibold text-[var(--obs-text-faint,#8a8a8a)]">
                구조 변환 규칙 (줄당 1개)
              </label>
              <textarea
                value={rulesDraft}
                onChange={(ev) => setRulesDraft(ev.target.value)}
                rows={4}
                className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#242424)] p-2 text-[11px] leading-4 outline-none focus:border-emerald-400"
              />
            </section>
            <section className="space-y-1">
              <label className="text-[10.5px] font-semibold text-[var(--obs-text-faint,#8a8a8a)]">
                AI 유연 적응 힌트 (줄당 1개)
              </label>
              <textarea
                value={hintsDraft}
                onChange={(ev) => setHintsDraft(ev.target.value)}
                rows={4}
                className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#242424)] p-2 text-[11px] leading-4 outline-none focus:border-emerald-400"
              />
            </section>
          </div>

          <section className="space-y-1">
            <label className="flex items-center gap-1 text-[10.5px] font-semibold text-[var(--obs-text-faint,#8a8a8a)]">
              <Tag className="h-3 w-3" />
              <span>태그 (쉼표 구분)</span>
            </label>
            <input
              type="text"
              value={tagsDraft}
              onChange={(ev) => setTagsDraft(ev.target.value)}
              className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#242424)] px-2 py-1 text-[11px] outline-none focus:border-emerald-400"
            />
          </section>

          <section className="flex min-h-[220px] flex-1 flex-col space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#8a8a8a)] uppercase">
                <Code2 className="h-3.5 w-3.5 text-sky-400" />
                <span>표준 .outline 구조 골격 (outlineDsl)</span>
              </label>
              <span className="font-code text-[10px] text-[var(--obs-text-faint,#777)]">
                2칸 들여쓰기 · {`{{자리표시자}}`}
              </span>
            </div>
            <textarea
              value={dslDraft}
              onChange={(ev) => setDslDraft(ev.target.value)}
              spellCheck={false}
              className="min-h-[200px] flex-1 resize-none rounded border border-[var(--obs-border,#363636)] bg-[#15171a] p-2.5 font-code text-[11.5px] leading-5 text-emerald-100 outline-none focus:border-emerald-400"
            />
          </section>
        </div>

        {/* Right: Live 2D Rendered Preview */}
        <div className="flex min-h-0 flex-col bg-[#25272b]">
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/5 bg-[#202226] px-3 text-[11px] text-[var(--obs-text-muted,#a6a6a6)]">
            <span className="flex items-center gap-1.5 font-medium">
              <Layers className="h-3.5 w-3.5 text-emerald-400" />
              <span>실시간 2D 구조 프리뷰 ({asset.structure.blocks.length} 블록)</span>
            </span>
            <div className="flex items-center gap-1">
              {[0.45, 0.58, 0.72].map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setPreviewScale(sc)}
                  className={`rounded px-1.5 py-0.5 font-code text-[10px] ${
                    previewScale === sc
                      ? "bg-emerald-500/25 text-emerald-200"
                      : "text-white/60 hover:bg-white/5"
                  }`}
                >
                  {Math.round(sc * 100)}%
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <VDocAssetThumbnail
              asset={asset}
              height={540}
              scale={previewScale}
              className="mx-auto shadow-lg"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const AssetStructurePanel: React.FC<{
  readonly host: EditorOutlineHostContext<IdeEditorEnv>;
}> = ({ host }) => {
  const { vault } = host.env;
  const [asset, setAsset] = useState<VDocAsset | null>(() =>
    vault.exists(host.path) && (!vault.isLoaded || vault.isLoaded(host.path))
      ? parseVAssetJson(vault.read(host.path))
      : null
  );

  useEffect(() => {
    const reload = () => {
      if (!vault.exists(host.path)) return;
      if (vault.isLoaded && !vault.isLoaded(host.path)) return;
      setAsset(parseVAssetJson(vault.read(host.path)));
    };
    reload();
    return vault.subscribe((ev) => {
      if ((ev.type === "modify" && ev.path === host.path) || ev.type === "vault-reset") {
        reload();
      }
    });
  }, [vault, host.path]);

  if (!asset) {
    return (
      <div className="p-3 text-[11px] text-[var(--obs-text-faint,#808080)]">
        에셋 구조 정보를 읽을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2.5 p-3 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
      <div className="flex items-center gap-1.5 font-medium text-[var(--obs-text-normal,#ececec)]">
        <Blocks className="h-3.5 w-3.5 text-emerald-400" />
        <span className="truncate">{asset.title}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-code text-[10px] text-emerald-300">
          {asset.assetKind}
        </span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 font-code text-[10px]">
          {asset.structure.blocks.length} blocks
        </span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 font-code text-[10px]">
          {Object.keys(asset.structure.slots).length} slots
        </span>
      </div>
      <div className="space-y-1">
        <div className="text-[10px] font-semibold tracking-wider text-[var(--obs-text-faint,#777)] uppercase">
          포함 블록
        </div>
        {asset.structure.blocks.map((blk) => (
          <div
            key={blk.blockId}
            className="flex items-center justify-between rounded bg-black/20 px-2 py-1"
          >
            <span className="truncate text-[var(--obs-text-normal,#dadada)]">
              {blk.title || blk.kind}
            </span>
            <span className="shrink-0 font-code text-[9.5px] text-emerald-300/80">{blk.kind}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
