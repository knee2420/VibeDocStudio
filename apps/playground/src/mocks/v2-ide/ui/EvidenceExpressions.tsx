import React, { useMemo, useState } from "react";
import {
  BookOpen,
  Calculator,
  ExternalLink,
  GitBranch,
  Link2,
  Quote,
  StickyNote,
} from "lucide-react";
import {
  evidenceSourceKey,
  extractInlineCiteBullets,
  slotPlainText,
  type EvidenceBacklinkGroup,
  type EvidenceLink,
  type EvidenceLocator,
  type EvidencePresentation,
  type VDocDocument,
} from "@vibe/vdoc-schema";
import { basename } from "@vibe/vault-core";
import { fromVaultUri, type VaultEvidenceSettings } from "@vibe/vault-formats";
import type { OutlineNode } from "@vibe/outliner/core";

export type EvidenceLayerMode = "review" | "footnote-only" | "clean";

export function resolveEvidenceVaultPath(locator: EvidenceLocator): string | null {
  const raw = locator.sourcePath ?? locator.resourceId ?? "";
  if (!raw) return null;
  const fromUri = fromVaultUri(raw);
  if (fromUri) return fromUri;
  if (raw.startsWith("vault:")) return raw.slice("vault:".length).replace(/^\/+/, "");
  if (/^https?:\/\//i.test(raw)) return null;
  return raw.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function resolveEvidenceWebUrl(locator: EvidenceLocator): string | null {
  const candidate = locator.url ?? locator.sourcePath ?? locator.refId ?? "";
  if (/^https?:\/\//i.test(candidate.trim())) return candidate.trim();
  return null;
}

export function canOpenEvidenceSource(locator: EvidenceLocator): boolean {
  return Boolean(resolveEvidenceVaultPath(locator) || resolveEvidenceWebUrl(locator));
}

/** `.vclip/content.md` 같은 번들 내부 경로를 소유 `.vclip` 번들 경로와 사람용 기사명으로 정규화한다. */
function resolveVclipBundleDisplay(vaultPath: string): { readonly openPath: string; readonly displayName: string } | null {
  const m = /^(.*?[^/]+\.vclip)(?:\/.*)?$/i.exec(vaultPath);
  if (!m) return null;
  const bundlePath = m[1];
  const displayName = basename(bundlePath).replace(/\.vclip$/i, "");
  return { openPath: bundlePath, displayName };
}

export function openEvidenceLocator(
  locator: EvidenceLocator,
  onOpenSource: (vaultPath: string, locator?: EvidenceLocator) => void
): boolean {
  const vp = resolveEvidenceVaultPath(locator);
  if (vp) {
    const vclip = resolveVclipBundleDisplay(vp);
    onOpenSource(vclip ? vclip.openPath : vp, locator);
    return true;
  }
  const webUrl = resolveEvidenceWebUrl(locator);
  if (webUrl && typeof window !== "undefined") {
    const cleanQuote = (locator.excerpt ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    const target = cleanQuote
      ? `${webUrl.split("#")[0]}#:~:text=${encodeURIComponent(cleanQuote)}`
      : webUrl;
    window.open(target, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}

export function formatEvidenceLocation(locator: EvidenceLocator): string {
  const parts: string[] = [];
  const vp = resolveEvidenceVaultPath(locator);
  const vclip = vp ? resolveVclipBundleDisplay(vp) : null;
  const rawLabel = (locator.label ?? "").trim();
  const isGenericContentMd = /^content\.md$/i.test(rawLabel);
  const name =
    rawLabel && !isGenericContentMd
      ? rawLabel.replace(/\.vclip$/i, "")
      : vclip
        ? vclip.displayName
        : vp
          ? basename(vp)
          : locator.refId;
  parts.push(name);
  if (locator.page) parts.push(`p.${locator.page}`);
  if (locator.lines && locator.lines.length >= 2) {
    parts.push(`L${locator.lines[0]}-L${locator.lines[1]}`);
  }
  return parts.join(" · ");
}

export function effectivePresentation(
  locator: EvidenceLocator,
  link?: Pick<EvidenceLink, "presentation">,
  settings?: Pick<VaultEvidenceSettings, "defaultPresentation" | "displayPolicy">
): EvidencePresentation {
  const explicit = link?.presentation ?? locator.presentation;
  if (explicit === "hidden") return "hidden";
  if (settings?.displayPolicy === "force-default") {
    return settings.defaultPresentation;
  }
  return explicit ?? settings?.defaultPresentation ?? "footnote";
}

function formatEvidenceTooltip(locator: EvidenceLocator, link?: Pick<EvidenceLink, "rationale">): string {
  const locStr = formatEvidenceLocation(locator);
  const rationale = link?.rationale || locator.rationale;
  const excerpt = locator.excerpt?.trim();
  return [
    locStr,
    rationale ? `산출 근거: ${rationale}` : null,
    excerpt ? `“${excerpt}”` : null,
    "클릭 시 페어 탭으로 원문 열기 · 하이라이트",
  ]
    .filter(Boolean)
    .join("\n");
}

export function collectOutlineEvidenceEntries(
  roots: readonly OutlineNode[],
  nodeEvidence?: Record<string, EvidenceLocator[]>,
  resolveSourcePath?: (rawTarget: string) => string | undefined
): { targetId: string; targetLabel: string; locator: EvidenceLocator }[] {
  const labelById = new Map<string, string>();
  const walk = (nodes: readonly OutlineNode[]) => {
    for (const n of nodes) {
      labelById.set(n.id, n.text.replace(/\s+/g, " ").trim().slice(0, 52) || n.id);
      if (n.children.length > 0) walk(n.children);
    }
  };
  walk(roots);

  const inlineExtracted = extractInlineCiteBullets(roots, { resolveSourcePath });
  const merged = new Map<string, EvidenceLocator[]>();
  for (const srcMap of [nodeEvidence, inlineExtracted.nodeEvidence]) {
    if (!srcMap) continue;
    for (const [nodeId, locs] of Object.entries(srcMap)) {
      merged.set(nodeId, [...(merged.get(nodeId) ?? []), ...locs]);
    }
  }

  const out: { targetId: string; targetLabel: string; locator: EvidenceLocator }[] = [];
  for (const [nodeId, locs] of merged.entries()) {
    const targetLabel = labelById.get(nodeId) ?? nodeId;
    for (const locator of locs) {
      out.push({ targetId: nodeId, targetLabel, locator });
    }
  }
  return out;
}

export function collectVDocEvidenceEntries(
  doc: VDocDocument
): { targetId: string; targetLabel: string; locator: EvidenceLocator; link: EvidenceLink }[] {
  const links = doc.evidenceLinks ?? [];
  return links.map((link) => {
    const slot = doc.slots[link.slotId];
    const plain = slot ? slotPlainText(slot.content).replace(/\s+/g, " ").trim() : "";
    const targetLabel = (plain || slot?.label || link.slotId).slice(0, 56);
    return { targetId: link.slotId, targetLabel, locator: link.locator, link };
  });
}

// ============================================================================
// 1. `.outline` 불릿 하단 근거 표현 (`renderNodeSubline` 용 · 다크 테마)
// ============================================================================

export const OutlineNodeEvidenceSubline: React.FC<{
  readonly nodeId: string;
  readonly locators: readonly EvidenceLocator[];
  readonly backlinkGroups: readonly EvidenceBacklinkGroup[];
  readonly citationNumberBySourceKey: ReadonlyMap<string, number>;
  readonly settings?: VaultEvidenceSettings;
  readonly onOpenSource: (vaultPath: string, locator?: EvidenceLocator) => void;
}> = React.memo(({ locators, backlinkGroups, citationNumberBySourceKey, settings, onOpenSource }) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const groupBySourceKey = useMemo(() => {
    const map = new Map<string, EvidenceBacklinkGroup>();
    for (const g of backlinkGroups) map.set(g.sourceKey, g);
    return map;
  }, [backlinkGroups]);

  if (locators.length === 0) return null;

  const primaryPresentation = effectivePresentation(locators[0], undefined, settings);
  if (primaryPresentation === "hidden") return null;

  const openLocator = (loc: EvidenceLocator, ev: React.MouseEvent) => {
    ev.stopPropagation();
    openEvidenceLocator(loc, onOpenSource);
  };

  // Case 2: 인라인 산출 근거 (N:1 조합 지원)
  if (primaryPresentation === "inline-rationale") {
    const rationale =
      locators.find((l) => l.rationale)?.rationale ??
      locators.map((l) => formatEvidenceLocation(l)).join(" + ");
    return (
      <div
        data-testid="outline-evidence-inline-rationale"
        onMouseDown={(ev) => ev.stopPropagation()}
        className="mt-1 flex flex-col gap-1 rounded-r border-l-2 border-amber-400/75 bg-amber-500/[0.08] py-1 pr-2 pl-2.5 text-[11px] leading-[1.45] text-amber-100 select-none"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-amber-300">← 산출 근거:</span>
          <span className="text-amber-100/95">{rationale}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {locators.map((loc, idx) => {
            const sk = evidenceSourceKey(loc);
            const useCount = groupBySourceKey.get(sk)?.targets.length ?? 1;
            return (
              <button
                key={`${sk}-${idx}`}
                type="button"
                onClick={(ev) => openLocator(loc, ev)}
                title={loc.excerpt || `원본 열기: ${formatEvidenceLocation(loc)}`}
                className="inline-flex items-center gap-1 rounded border border-amber-400/35 bg-black/25 px-1.5 py-0.5 text-[10.5px] text-amber-200 hover:border-amber-300 hover:bg-amber-500/20"
              >
                <Link2 className="h-2.5 w-2.5 shrink-0" />
                <span>{formatEvidenceLocation(loc)}</span>
                {useCount > 1 && (
                  <span className="rounded bg-amber-400/20 px-1 text-[9.5px] font-semibold text-amber-200">
                    1:{useCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Case 3: 여백 주석 (Sidenote 카드)
  if (primaryPresentation === "sidenote") {
    return (
      <div
        data-testid="outline-evidence-sidenote"
        onMouseDown={(ev) => ev.stopPropagation()}
        className="mt-1 space-y-1"
      >
        {locators.map((loc, idx) => {
          const sk = evidenceSourceKey(loc);
          const num = citationNumberBySourceKey.get(sk) ?? idx + 1;
          return (
            <div
              key={`${sk}-${idx}`}
              className="flex items-start justify-between gap-2 rounded-md border border-teal-500/35 bg-teal-500/[0.08] px-2.5 py-1.5 text-[11px] text-teal-100 select-none"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 font-medium text-teal-300">
                  <StickyNote className="h-3 w-3 shrink-0" />
                  <span>여백 주석 §{num} · {formatEvidenceLocation(loc)}</span>
                </div>
                {loc.excerpt && (
                  <p className="text-[10.5px] leading-relaxed text-teal-100/85">
                    {loc.excerpt}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={(ev) => openLocator(loc, ev)}
                className="inline-flex shrink-0 items-center gap-1 rounded border border-teal-400/40 bg-black/25 px-1.5 py-0.5 text-[10px] text-teal-200 hover:bg-teal-500/25"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                원본
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  // Case 4: 원문 직접 인용 / 트랜스클루전 카드
  if (primaryPresentation === "quote-embed") {
    return (
      <div
        data-testid="outline-evidence-quote-embed"
        onMouseDown={(ev) => ev.stopPropagation()}
        className="mt-1 space-y-1.5"
      >
        {locators.map((loc, idx) => {
          const sk = evidenceSourceKey(loc);
          const useCount = groupBySourceKey.get(sk)?.targets.length ?? 1;
          return (
            <div
              key={`${sk}-${idx}`}
              className="rounded-r-md border-l-[3px] border-violet-400 bg-violet-500/[0.09] px-3 py-1.5 text-[11.5px] text-slate-100 select-none"
            >
              <div className="flex items-start gap-1.5">
                <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
                <p className="italic leading-relaxed text-violet-50/95">
                  “{loc.excerpt || loc.rationale || loc.label}”
                </p>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 pl-5 text-[10px] text-violet-200/80">
                <span>
                  — {formatEvidenceLocation(loc)}
                  {useCount > 1 ? ` · 이 원문 ${useCount}곳 임베드` : ""}
                </span>
                <button
                  type="button"
                  onClick={(ev) => openLocator(loc, ev)}
                  className="inline-flex items-center gap-1 rounded border border-violet-400/40 bg-black/25 px-1.5 py-0.5 text-[10px] text-violet-200 hover:bg-violet-500/25"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  원본 열기
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Case 5: 1:N / M:N 추적 매트릭스 배지
  if (primaryPresentation === "matrix") {
    return (
      <div
        data-testid="outline-evidence-matrix"
        onMouseDown={(ev) => ev.stopPropagation()}
        className="mt-1 flex flex-wrap items-center gap-1.5 select-none"
      >
        {locators.map((loc, idx) => {
          const sk = evidenceSourceKey(loc);
          const group = groupBySourceKey.get(sk);
          const useCount = group?.targets.length ?? 1;
          return (
            <button
              key={`${sk}-${idx}`}
              type="button"
              onClick={(ev) => openLocator(loc, ev)}
              title={loc.excerpt || `원본 열기: ${formatEvidenceLocation(loc)}`}
              className="inline-flex items-center gap-1.5 rounded border border-rose-400/40 bg-rose-500/[0.11] px-2 py-0.5 text-[10.5px] text-rose-100 hover:border-rose-300 hover:bg-rose-500/20"
            >
              <GitBranch className="h-3 w-3 shrink-0 text-rose-300" />
              {loc.requirementId && (
                <span className="rounded bg-rose-400/25 px-1 font-mono text-[9.5px] font-semibold text-rose-200">
                  {loc.requirementId}
                </span>
              )}
              <span>{formatEvidenceLocation(loc)}</span>
              <span className="rounded bg-white/10 px-1 text-[9.5px] font-semibold text-rose-200">
                1:{useCount} ({useCount}곳 매핑)
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Case 6: 근거 바인딩 수치/팩트 토큰
  if (primaryPresentation === "bound-value") {
    return (
      <div
        data-testid="outline-evidence-bound-value"
        onMouseDown={(ev) => ev.stopPropagation()}
        className="mt-1 flex flex-wrap items-center gap-1.5 select-none"
      >
        {locators.map((loc, idx) => {
          const sk = evidenceSourceKey(loc);
          const useCount = groupBySourceKey.get(sk)?.targets.length ?? 1;
          return (
            <button
              key={`${sk}-${idx}`}
              type="button"
              onClick={(ev) => openLocator(loc, ev)}
              title={loc.rationale || loc.excerpt || formatEvidenceLocation(loc)}
              className="inline-flex items-center gap-1.5 rounded border border-cyan-400/45 bg-cyan-500/[0.1] px-2 py-0.5 text-[10.5px] text-cyan-100 hover:border-cyan-300 hover:bg-cyan-500/20"
            >
              <Calculator className="h-3 w-3 shrink-0 text-cyan-300" />
              {loc.boundValue && (
                <span className="rounded bg-cyan-400/25 px-1.5 font-mono font-semibold text-cyan-100">
                  {`{ ${loc.boundValue} }`}
                </span>
              )}
              {loc.boundFormula && (
                <span className="font-mono text-[10px] text-cyan-200/85">= {loc.boundFormula}</span>
              )}
              <span className="text-cyan-200/75">· {formatEvidenceLocation(loc)}</span>
              {useCount > 1 && (
                <span className="rounded bg-white/10 px-1 text-[9.5px] text-cyan-200">1:{useCount}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Case 1 (기본): 각주 번호 배지 `[1]` + 클릭 시 페어 탭 즉시 열기/하이라이트 (또는 설정 시 발췌 펼치기)
  const clickOpensPair = (settings?.clickAction ?? "open-pair") === "open-pair";
  return (
    <div
      data-testid="outline-evidence-footnote"
      onMouseDown={(ev) => ev.stopPropagation()}
      className="mt-1 flex flex-col gap-1 select-none"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {locators.map((loc, idx) => {
          const sk = evidenceSourceKey(loc);
          const num = citationNumberBySourceKey.get(sk) ?? idx + 1;
          const isOpen = expandedKey === `${sk}-${idx}`;
          return (
            <span key={`${sk}-${idx}`} className="inline-flex items-center gap-0.5">
              <button
                type="button"
                onClick={(ev) => {
                  if (clickOpensPair) {
                    openLocator(loc, ev);
                  } else {
                    ev.stopPropagation();
                    setExpandedKey(isOpen ? null : `${sk}-${idx}`);
                  }
                }}
                title={formatEvidenceTooltip(loc)}
                className="inline-flex items-center gap-1 rounded-l border border-indigo-400/40 bg-indigo-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-indigo-200 hover:bg-indigo-500/25"
              >
                <span className="font-mono font-bold text-indigo-300">[{num}]</span>
                <span>{formatEvidenceLocation(loc)}</span>
              </button>
              <button
                type="button"
                onClick={(ev) => {
                  if (clickOpensPair && loc.excerpt) {
                    ev.stopPropagation();
                    setExpandedKey(isOpen ? null : `${sk}-${idx}`);
                  } else {
                    openLocator(loc, ev);
                  }
                }}
                title={clickOpensPair && loc.excerpt ? "발췌 미리보기 펼치기" : "페어 탭으로 원본 열기"}
                className="inline-flex items-center rounded-r border border-l-0 border-indigo-400/40 bg-black/25 px-1 py-0.5 text-[10px] text-indigo-300 hover:bg-indigo-500/25"
              >
                {clickOpensPair && loc.excerpt ? (
                  <Quote className="h-2.5 w-2.5" />
                ) : (
                  <ExternalLink className="h-2.5 w-2.5" />
                )}
              </button>
            </span>
          );
        })}
      </div>
      {expandedKey &&
        (() => {
          const hit = locators.find((l, i) => `${evidenceSourceKey(l)}-${i}` === expandedKey);
          if (!hit?.excerpt) return null;
          return (
            <div className="rounded border border-indigo-400/30 bg-indigo-950/50 px-2.5 py-1 text-[10.5px] leading-relaxed text-indigo-100/90">
              {hit.excerpt}
            </div>
          );
        })()}
    </div>
  );
});
OutlineNodeEvidenceSubline.displayName = "OutlineNodeEvidenceSubline";

/** `.outline` 하단 1:N 출처 역추적 / 각주 레전드 카드 */
export const OutlineEvidenceLegendPanel: React.FC<{
  readonly groups: readonly EvidenceBacklinkGroup[];
  readonly onOpenSource: (vaultPath: string, locator?: EvidenceLocator) => void;
}> = React.memo(({ groups, onOpenSource }) => {
  if (groups.length === 0) return null;
  const hasMultiUse = groups.some(
    (g) => g.targets.length > 1 || g.locator.presentation === "matrix"
  );
  return (
    <div
      data-testid="outline-evidence-legend"
      className="mt-6 rounded-lg border border-white/10 bg-white/[0.025] p-3 text-[11px] text-slate-300"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-200">
          <BookOpen className="h-3.5 w-3.5 text-indigo-300" />
          {hasMultiUse ? "출처 · 1:N 역추적 매핑 표" : "출처 · 근거 목록"} ({groups.length}건)
        </span>
        <span className="text-[10px] text-slate-400">클릭 시 페어 탭으로 원본 열기</span>
      </div>
      <div className="space-y-1.5">
        {groups.map((g) => {
          const canOpen = canOpenEvidenceSource(g.locator);
          return (
            <div
              key={g.sourceKey}
              className="flex flex-wrap items-start justify-between gap-2 rounded border border-white/[0.07] bg-black/20 px-2.5 py-1.5"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10.5px] font-bold text-indigo-300">
                    [{g.citationNumber}]
                  </span>
                  {g.locator.requirementId && (
                    <span className="rounded bg-rose-500/20 px-1 font-mono text-[9.5px] text-rose-200">
                      {g.locator.requirementId}
                    </span>
                  )}
                  <span className="font-medium text-slate-100">
                    {formatEvidenceLocation(g.locator)}
                  </span>
                  <span className="rounded bg-white/10 px-1 text-[9.5px] text-slate-300">
                    {g.targets.length}곳 인용
                  </span>
                </div>
                {g.targets.length > 1 && (
                  <div className="pl-5 text-[10px] text-slate-400">
                    매핑 불릿: {g.targets.map((t) => t.label).join(" · ")}
                  </div>
                )}
              </div>
              {canOpen && (
                <button
                  type="button"
                  onClick={() => openEvidenceLocator(g.locator, onOpenSource)}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-white/15"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  원본 열기
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
OutlineEvidenceLegendPanel.displayName = "OutlineEvidenceLegendPanel";

// ============================================================================
// 2. `.vdoc` 2D 지면 위 근거 표현 (`wrapSlotContent` + 여백/하단 크롬 · 라이트 지면)
// ============================================================================

export const VDocSlotEvidenceInline: React.FC<{
  readonly links: readonly EvidenceLink[];
  readonly mode: EvidenceLayerMode;
  readonly citationNumberBySourceKey: ReadonlyMap<string, number>;
  readonly backlinkGroups: readonly EvidenceBacklinkGroup[];
  readonly settings?: VaultEvidenceSettings;
  readonly slotHtml?: string;
  readonly onOpenSource: (vaultPath: string, locator?: EvidenceLocator) => void;
}> = React.memo(({ links, mode, citationNumberBySourceKey, backlinkGroups, settings, slotHtml, onOpenSource }) => {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const countBySourceKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of backlinkGroups) m.set(g.sourceKey, g.targets.length);
    return m;
  }, [backlinkGroups]);

  if (mode === "clean" || links.length === 0) return null;

  const visibleLinks = links.filter(
    (l) => effectivePresentation(l.locator, l, settings) !== "hidden"
  );
  if (visibleLinks.length === 0) return null;

  const openLocator = (loc: EvidenceLocator, ev: React.MouseEvent) => {
    ev.stopPropagation();
    openEvidenceLocator(loc, onOpenSource);
  };

  // 제출용 "각주만" 모드면 모든 표현을 [1], [2] 각주 배지로 접는다
  const primaryPres: EvidencePresentation =
    mode === "footnote-only"
      ? "footnote"
      : effectivePresentation(visibleLinks[0].locator, visibleLinks[0], settings);

  // Case 2: 인라인 산출 근거 (워크샵 참석 인원 : { 38 } 명 ← 산출 근거 : ...)
  if (primaryPres === "inline-rationale") {
    const rationale =
      visibleLinks.find((l) => l.rationale || l.locator.rationale)?.rationale ??
      visibleLinks.find((l) => l.locator.rationale)?.locator.rationale ??
      visibleLinks.map((l) => formatEvidenceLocation(l.locator)).join(" + ");
    return (
      <div
        data-testid="vdoc-evidence-inline-rationale"
        data-vdoc-evidence-interactive="true"
        onClick={(ev) => ev.stopPropagation()}
        className="mt-1 flex flex-wrap items-center gap-1.5 rounded border border-amber-300 bg-amber-50/90 px-2 py-1 text-[11px] leading-snug text-amber-950"
      >
        <span className="font-semibold text-amber-800">← 산출 근거:</span>
        <span>{rationale}</span>
        {visibleLinks.map((link) => (
          <button
            key={link.linkId}
            type="button"
            onClick={(ev) => openLocator(link.locator, ev)}
            title={formatEvidenceTooltip(link.locator, link)}
            className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100"
          >
            <Link2 className="h-2.5 w-2.5" />
            {formatEvidenceLocation(link.locator)}
          </button>
        ))}
      </div>
    );
  }

  // Case 3: 여백 주석 (본문에는 §N 마커만 작게 달고, 본체는 우측 Sidenote Rail 에 노출)
  if (primaryPres === "sidenote") {
    return (
      <div
        data-testid="vdoc-evidence-sidenote-marker"
        data-vdoc-evidence-interactive="true"
        onClick={(ev) => ev.stopPropagation()}
        className="mt-0.5 flex flex-wrap items-center gap-1"
      >
        {visibleLinks.map((link) => {
          const sk = evidenceSourceKey(link.locator);
          const num = citationNumberBySourceKey.get(sk) ?? 1;
          return (
            <button
              key={link.linkId}
              type="button"
              onClick={(ev) => openLocator(link.locator, ev)}
              title={formatEvidenceTooltip(link.locator, link)}
              className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-teal-50 px-1.5 py-0 text-[10px] font-semibold text-teal-800 hover:bg-teal-100"
            >
              <span>§{num}</span>
              <span className="font-normal">{link.locator.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Case 4: 원문 직접 인용 / 트랜스클루전 카드
  if (primaryPres === "quote-embed") {
    return (
      <div
        data-testid="vdoc-evidence-quote-embed"
        data-vdoc-evidence-interactive="true"
        onClick={(ev) => ev.stopPropagation()}
        className="mt-1.5 space-y-1.5"
      >
        {visibleLinks.map((link) => {
          const loc = link.locator;
          return (
            <blockquote
              key={link.linkId}
              className="rounded-r border-l-[3px] border-violet-500 bg-violet-50/80 px-2.5 py-1.5 text-[11.5px] text-slate-800"
            >
              <p className="italic leading-relaxed text-slate-800">
                “{loc.excerpt || link.rationale || loc.label}”
              </p>
              <footer className="mt-1 flex items-center justify-between gap-2 text-[10px] text-violet-800">
                <span>— {formatEvidenceLocation(loc)}</span>
                <button
                  type="button"
                  onClick={(ev) => openLocator(loc, ev)}
                  className="inline-flex items-center gap-1 rounded border border-violet-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-violet-800 hover:bg-violet-100"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  원본
                </button>
              </footer>
            </blockquote>
          );
        })}
      </div>
    );
  }

  // Case 5: 1:N / M:N 추적 매트릭스 태그
  if (primaryPres === "matrix") {
    return (
      <div
        data-testid="vdoc-evidence-matrix-tag"
        data-vdoc-evidence-interactive="true"
        onClick={(ev) => ev.stopPropagation()}
        className="mt-1 flex flex-wrap items-center gap-1"
      >
        {visibleLinks.map((link) => {
          const loc = link.locator;
          const sk = evidenceSourceKey(loc);
          const count = countBySourceKey.get(sk) ?? 1;
          return (
            <button
              key={link.linkId}
              type="button"
              onClick={(ev) => openLocator(loc, ev)}
              title={formatEvidenceTooltip(loc, link)}
              className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-900 hover:bg-rose-100"
            >
              <GitBranch className="h-2.5 w-2.5 text-rose-600" />
              {loc.requirementId && (
                <span className="font-mono font-bold text-rose-700">{loc.requirementId}</span>
              )}
              <span>{formatEvidenceLocation(loc)}</span>
              <span className="rounded bg-rose-200/80 px-1 font-mono text-[9.5px] font-semibold">
                1:{count}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Case 6: 근거 바인딩 수치/팩트 토큰
  if (primaryPres === "bound-value") {
    return (
      <div
        data-testid="vdoc-evidence-bound-value"
        data-vdoc-evidence-interactive="true"
        onClick={(ev) => ev.stopPropagation()}
        className="mt-1 flex flex-wrap items-center gap-1.5"
      >
        {visibleLinks.map((link) => {
          const loc = link.locator;
          const sk = evidenceSourceKey(loc);
          const count = countBySourceKey.get(sk) ?? 1;
          return (
            <button
              key={link.linkId}
              type="button"
              onClick={(ev) => openLocator(loc, ev)}
              title={formatEvidenceTooltip(loc, link)}
              className="inline-flex items-center gap-1.5 rounded border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10.5px] text-cyan-950 hover:bg-cyan-100"
            >
              <Calculator className="h-3 w-3 text-cyan-700" />
              {loc.boundValue && (
                <span className="rounded bg-cyan-200/80 px-1 font-mono font-bold text-cyan-950">
                  {`{ ${loc.boundValue} }`}
                </span>
              )}
              {loc.boundFormula && (
                <span className="font-mono text-[10px] text-cyan-800">= {loc.boundFormula}</span>
              )}
              <span className="text-[10px] text-cyan-800/80">({formatEvidenceLocation(loc)})</span>
              {count > 1 && (
                <span className="rounded bg-white px-1 font-mono text-[9.5px] text-cyan-800">
                  1:{count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Case 1 (기본 · 또는 footnote-only): 각주 번호 `[1]` `[2]` 배지 + 즉시 페어 탭 점프 또는 팝오버
  const clickAction = settings?.clickAction ?? "open-pair";
  const allCoveredInline =
    clickAction === "open-pair" &&
    Boolean(slotHtml) &&
    visibleLinks.every((link) =>
      (link.citationIds ?? []).some((cid) => {
        const escaped = cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`data-cite=["']${escaped}["']`).test(slotHtml ?? "");
      })
    );
  if (allCoveredInline) {
    // 본문 <sup data-cite> 가 전역 번호([N])로 동기화되어 원클릭 점프를 제공하므로 중복 하단 번호 줄을 숨긴다
    return null;
  }

  return (
    <div
      data-testid="vdoc-evidence-footnote-chips"
      data-vdoc-evidence-interactive="true"
      onClick={(ev) => ev.stopPropagation()}
      className="mt-0.5 flex flex-wrap items-center gap-1"
    >
      {visibleLinks.map((link) => {
        const sk = evidenceSourceKey(link.locator);
        const num = citationNumberBySourceKey.get(sk) ?? Number(link.citationIds?.[0] ?? 1);
        const isOpen = openKey === link.linkId;
        return (
          <span key={link.linkId} className="relative inline-flex items-center">
            <button
              type="button"
              onClick={(ev) => {
                if (clickAction === "open-pair") {
                  openLocator(link.locator, ev);
                } else {
                  ev.stopPropagation();
                  setOpenKey(isOpen ? null : link.linkId);
                }
              }}
              title={formatEvidenceTooltip(link.locator, link)}
              className="inline-flex items-center gap-0.5 rounded bg-indigo-100 px-1 py-0 font-mono text-[10px] font-bold text-indigo-800 hover:bg-indigo-200"
            >
              [{num}]
            </button>
            {clickAction === "popover" && isOpen && (
              <div className="absolute top-full left-0 z-30 mt-1 w-72 rounded-md border border-indigo-200 bg-white p-2.5 text-[11px] text-slate-800 shadow-lg">
                <div className="font-semibold text-indigo-900">
                  [{num}] {formatEvidenceLocation(link.locator)}
                </div>
                {(link.rationale || link.locator.rationale) && (
                  <div className="mt-1 text-[10.5px] text-amber-800">
                    산출 근거: {link.rationale || link.locator.rationale}
                  </div>
                )}
                {link.locator.excerpt && (
                  <p className="mt-1 rounded bg-slate-50 p-1.5 text-[10.5px] leading-relaxed text-slate-700">
                    “{link.locator.excerpt}”
                  </p>
                )}
                <div className="mt-2 flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenKey(null)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100"
                  >
                    닫기
                  </button>
                  {canOpenEvidenceSource(link.locator) && (
                    <button
                      type="button"
                      onClick={(ev) => openLocator(link.locator, ev)}
                      className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-700"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      {resolveEvidenceVaultPath(link.locator) ? "페어 탭으로 원본 열기" : "원본 URL 열기"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </span>
        );
      })}
    </div>
  );
});
VDocSlotEvidenceInline.displayName = "VDocSlotEvidenceInline";

/** Case 3: 페이지 우측 Tufte 여백 주석(Sidenote) 레일 */
export const VDocSidenoteRail: React.FC<{
  readonly links: readonly EvidenceLink[];
  readonly citationNumberBySourceKey: ReadonlyMap<string, number>;
  readonly settings?: VaultEvidenceSettings;
  readonly onOpenSource: (vaultPath: string, locator?: EvidenceLocator) => void;
}> = React.memo(({ links, citationNumberBySourceKey, settings, onOpenSource }) => {
  const uniqueSidenotes = useMemo(() => {
    const seen = new Set<string>();
    const out: { num: number; link: EvidenceLink }[] = [];
    for (const l of links) {
      if (effectivePresentation(l.locator, l, settings) !== "sidenote") continue;
      const sk = evidenceSourceKey(l.locator);
      if (seen.has(sk)) continue;
      seen.add(sk);
      out.push({ num: citationNumberBySourceKey.get(sk) ?? out.length + 1, link: l });
    }
    return out;
  }, [links, citationNumberBySourceKey, settings]);

  if (uniqueSidenotes.length === 0) return null;

  return (
    <aside
      data-testid="vdoc-sidenote-rail"
      data-vdoc-evidence-interactive="true"
      className="w-[240px] shrink-0 space-y-2.5 pt-2"
    >
      <div className="flex items-center gap-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-wide text-teal-300">
        <StickyNote className="h-3.5 w-3.5" />
        <span>여백 주석 (Sidenotes)</span>
      </div>
      {uniqueSidenotes.map(({ num, link }) => {
        const canOpen = canOpenEvidenceSource(link.locator);
        return (
          <div
            key={link.linkId}
            className="rounded-lg border border-teal-500/35 bg-[#1e2729] p-2.5 text-[11px] text-teal-50 shadow-md"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="font-mono text-[10.5px] font-bold text-teal-300">§{num}</span>
              {canOpen && (
                <button
                  type="button"
                  onClick={() => openEvidenceLocator(link.locator, onOpenSource)}
                  className="inline-flex items-center gap-1 rounded border border-teal-400/35 bg-black/25 px-1.5 py-0.5 text-[9.5px] text-teal-200 hover:bg-teal-500/20"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  원본
                </button>
              )}
            </div>
            <div className="mt-1 font-medium text-teal-100">
              {formatEvidenceLocation(link.locator)}
            </div>
            {link.locator.excerpt && (
              <p className="mt-1 text-[10.5px] leading-relaxed text-teal-100/80">
                “{link.locator.excerpt}”
              </p>
            )}
          </div>
        );
      })}
    </aside>
  );
});
VDocSidenoteRail.displayName = "VDocSidenoteRail";

/** `.vdoc` 하단 각주 목록 + 1:N 출처↔슬롯 추적 매트릭스 */
export const VDocEvidenceBottomPanel: React.FC<{
  readonly doc: VDocDocument;
  readonly mode: EvidenceLayerMode;
  readonly groups: readonly EvidenceBacklinkGroup[];
  readonly settings?: VaultEvidenceSettings;
  readonly onOpenSource: (vaultPath: string, locator?: EvidenceLocator) => void;
  readonly onSelectSlot: (slotId: string) => void;
}> = React.memo(({ doc, mode, groups, settings, onOpenSource, onSelectSlot }) => {
  if (mode === "clean" || groups.length === 0) return null;

  const hasMatrix =
    mode === "review" &&
    groups.some(
      (g) => effectivePresentation(g.locator, undefined, settings) === "matrix" || g.targets.length > 1
    );
  const showFootnotes =
    mode === "footnote-only" ||
    groups.some((g) => effectivePresentation(g.locator, undefined, settings) === "footnote");

  if (!hasMatrix && !showFootnotes) return null;

  return (
    <div
      data-testid="vdoc-evidence-bottom-panel"
      data-vdoc-evidence-interactive="true"
      style={{ width: doc.surface?.width ?? 794 }}
      className="mt-4 space-y-3"
    >
      {showFootnotes && (
        <section
          data-testid="vdoc-footnotes-section"
          className="rounded-lg border border-slate-300/80 bg-white p-4 text-[11.5px] text-slate-800 shadow-sm"
        >
          <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-1.5">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
              <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
              각주 · 출처 목록 ({groups.length}건)
            </span>
            <span className="text-[10px] text-slate-500">
              {mode === "footnote-only" ? "제출용 각주 변환 보기" : "원본 클릭 시 페어 탭으로 열림"}
            </span>
          </div>
          <ol className="space-y-1.5">
            {groups.map((g) => {
              const canOpen = canOpenEvidenceSource(g.locator);
              return (
                <li key={g.sourceKey} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="mr-1.5 font-mono font-bold text-indigo-700">
                      [{g.citationNumber}]
                    </span>
                    <span className="font-medium text-slate-900">
                      {formatEvidenceLocation(g.locator)}
                    </span>
                    {g.locator.rationale && (
                      <span className="ml-1.5 text-amber-800">
                        — {g.locator.rationale}
                      </span>
                    )}
                    {g.locator.excerpt && (
                      <div className="mt-0.5 pl-6 text-[10.5px] text-slate-600">
                        “{g.locator.excerpt}”
                      </div>
                    )}
                  </div>
                  {canOpen && (
                    <button
                      type="button"
                      onClick={() => openEvidenceLocator(g.locator, onOpenSource)}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      원본 열기
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {hasMatrix && (
        <section
          data-testid="vdoc-traceability-matrix"
          className="rounded-lg border border-rose-200 bg-white p-4 text-[11.5px] text-slate-800 shadow-sm"
        >
          <div className="mb-2 flex items-center justify-between border-b border-rose-100 pb-1.5">
            <span className="inline-flex items-center gap-1.5 font-semibold text-rose-950">
              <GitBranch className="h-3.5 w-3.5 text-rose-600" />
              1:N 출처 ↔ 본문 슬롯 추적 매트릭스
            </span>
            <span className="text-[10px] text-slate-500">
              원본 1개 → 본문 N곳 반영 현황
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-2 py-1.5 font-semibold">원천 출처 (1)</th>
                  <th className="w-16 px-2 py-1.5 text-center font-semibold">매핑</th>
                  <th className="px-2 py-1.5 font-semibold">반영된 본문 슬롯 (N)</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const canOpen = canOpenEvidenceSource(g.locator);
                  return (
                    <tr key={g.sourceKey} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {g.locator.requirementId && (
                            <span className="rounded bg-rose-100 px-1 font-mono text-[9.5px] font-bold text-rose-800">
                              {g.locator.requirementId}
                            </span>
                          )}
                          {canOpen ? (
                            <button
                              type="button"
                              onClick={() => openEvidenceLocator(g.locator, onOpenSource)}
                              className="inline-flex items-center gap-1 text-left font-medium text-indigo-700 hover:underline"
                            >
                              <span>{formatEvidenceLocation(g.locator)}</span>
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                            </button>
                          ) : (
                            <span className="font-medium">{formatEvidenceLocation(g.locator)}</span>
                          )}
                        </div>
                        {g.locator.excerpt && (
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            “{g.locator.excerpt}”
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center font-mono font-bold text-rose-700">
                        1:{g.targets.length}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {g.targets.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => onSelectSlot(t.id)}
                              className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800"
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
});
VDocEvidenceBottomPanel.displayName = "VDocEvidenceBottomPanel";
