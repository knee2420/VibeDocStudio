import {
  type LayoutBlock,
  type VDocAsset,
  type VDocAssetKind,
  type VDocAssetNuance,
  type VDocSlot,
} from "@vibe/vdoc-schema";

import { compileOutlineDslLinesToAssetBlocks } from "@vibe/vault-formats";

export interface ParseAssetFromBlockRequest {
  readonly titleHint?: string;
  readonly assetKind: VDocAssetKind;
  readonly blockKind: string;
  readonly sourceOutlineDsl: readonly string[];
  readonly plainTextSummary?: string;
  readonly sourceRef?: string;
}

export interface ParseAssetFromRefRequest {
  readonly refTitle: string;
  readonly assetKind: VDocAssetKind;
  readonly blockSummaries: readonly string[];
  readonly sourceRef?: string;
  readonly thumbnailUrl?: string;
}

export interface ApplyAssetPreviewRequest {
  readonly asset: VDocAsset;
  readonly userOutlineDsl: readonly string[];
  readonly userPlainText: string;
  readonly documentTitle: string;
  readonly targetScope: "block" | "page";
  readonly mode: "transform" | "insert";
  readonly feedback?: string;
  readonly viewId?: "a4" | "blog";
}

export interface ApplyAssetPreviewResult {
  readonly ok: boolean;
  readonly engine: "llm" | "fallback";
  readonly outlineDsl: string[];
  readonly rationale: string;
  readonly blocks: LayoutBlock[];
  readonly slots: Record<string, VDocSlot>;
  readonly validationErrors: readonly string[];
}

interface RawParseApiResponse {
  readonly title: string;
  readonly category: string;
  readonly tags: string[];
  readonly nuance: VDocAssetNuance;
  readonly outlineDsl: string[];
  readonly engine: "llm" | "fallback";
}

interface RawApplyApiResponse {
  readonly outlineDsl: string[];
  readonly rationale: string;
  readonly engine: "llm" | "fallback";
}

function abstractPlaceholderLine(line: string, idx: number): string {
  const trimmed = line.trim();
  const indent = line.slice(0, line.length - line.trimStart().length);
  if (!trimmed) return line;
  if (trimmed.startsWith("<<view:")) {
    const m = /^(<<view:[^>]+>>)\s*(.*)$/.exec(trimmed);
    if (m) {
      const label = m[2].trim();
      return label ? `${indent}${m[1]} {{${label}}}` : `${indent}${m[1]}`;
    }
  }
  if (trimmed === "---" || trimmed === "<<cell>>" || trimmed === "<<col>>") return line;
  if (trimmed.includes(" | ")) {
    const parts = trimmed.split("|").map((p) => p.trim());
    const next = parts.map((p, pIdx) => {
      if (p === "[-]" || p === "[<]" || p === "[^]" || p === "<<cell>>") return p;
      if (p.startsWith("[img:")) return `[img:{{이미지 ${idx}-${pIdx + 1}}}]`;
      return `{{${p.slice(0, 18) || `항목 ${pIdx + 1}`}}}`;
    });
    return `${indent}${next.join(" | ")}`;
  }
  if (trimmed.startsWith("[img:")) return `${indent}[img:{{대표 이미지 ${idx}}}]`;
  if (trimmed.startsWith("[cta:")) return `${indent}[cta:{{액션 버튼}} -> https://example.com]`;
  if (trimmed.startsWith("[embed:")) return `${indent}[embed:disclosure | {{안내 문구}}]`;
  if (trimmed.startsWith("> ")) return `${indent}> {{${trimmed.slice(2).trim().slice(0, 24) || "정보 카드"}}}`;
  if (trimmed.startsWith("! ")) return `${indent}! {{${trimmed.slice(2).trim().slice(0, 24) || "핵심 강조"}}}`;
  if (trimmed.includes("::")) {
    const [k, v] = trimmed.split("::");
    return `${indent}{{${k.trim() || "항목"}}} :: {{${(v ?? "").trim().slice(0, 24) || "내용"}}}`;
  }
  return `${indent}{{${trimmed.slice(0, 28)}}}`;
}

function extractUserItemsForFallback(
  userDsl: readonly string[],
  userPlain: string
): { readonly kvPairs: [string, string][]; readonly plainItems: string[] } {
  const kvPairs: [string, string][] = [];
  const plainItems: string[] = [];
  const lines =
    userDsl.length > 0
      ? userDsl
      : userPlain
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

  for (const raw of lines) {
    const s = raw.trim();
    if (!s || s.startsWith("<<") || s === "---") continue;
    if (s.includes("|") && !s.startsWith("[")) {
      const parts = s
        .split("|")
        .map((p) => p.trim())
        .filter((p) => p && p !== "<<cell>>" && p !== "[<]" && p !== "[^]");
      if (parts.length >= 2) {
        kvPairs.push([parts[0], parts.slice(1).join(" / ")]);
        continue;
      }
    }
    if (s.includes("::")) {
      const idx = s.indexOf("::");
      kvPairs.push([s.slice(0, idx).trim(), s.slice(idx + 2).trim()]);
      continue;
    }
    const cleaned = s.replace(/^[>!•\-*]\s*/, "").trim();
    if (cleaned && !cleaned.startsWith("[")) {
      plainItems.push(cleaned);
    }
  }
  return { kvPairs, plainItems };
}

function runOfflineApplyFallback(req: ApplyAssetPreviewRequest): RawApplyApiResponse {
  const { kvPairs, plainItems } = extractUserItemsForFallback(
    req.userOutlineDsl,
    req.userPlainText
  );
  const docTitle = req.documentTitle.trim() || req.asset.title;
  const feedbackNote = req.feedback?.trim() ? ` (피드백 반영: ${req.feedback.trim()})` : "";

  if (req.mode === "insert" && kvPairs.length === 0 && plainItems.length === 0) {
    return {
      outlineDsl: [...req.asset.structure.outlineDsl],
      rationale: `'${req.asset.title}' 구조 뼈대를 현재 위치에 삽입했습니다.${feedbackNote}`,
      engine: "fallback",
    };
  }

  if (req.asset.assetKind === "table") {
    const hasRichCell = req.asset.structure.outlineDsl.some((ln) => ln.includes("<<cell>>"));
    if (hasRichCell) {
      const dsl: string[] = [`<<view:table:header>> ${docTitle}`, "  구분 | 항 목"];
      if (kvPairs.length > 0) {
        for (const [k, v] of kvPairs) {
          dsl.push(`  ${k} | <<cell>>`);
          dsl.push("    <<view:list>>");
          const subs = v
            .split(/[,/]/)
            .map((x) => x.trim())
            .filter(Boolean);
          for (const sub of subs.length > 0 ? subs : [v || "세부 항목"]) {
            dsl.push(`      ${sub}`);
          }
        }
      } else if (plainItems.length > 0) {
        const mid = Math.max(1, Math.ceil(plainItems.length / 2));
        const groups: [string, string[]][] = [
          ["핵심 항목", plainItems.slice(0, mid)],
          ["세부 내용", plainItems.slice(mid)],
        ];
        for (const [label, items] of groups) {
          if (items.length === 0) continue;
          dsl.push(`  ${label} | <<cell>>`);
          dsl.push("    <<view:list>>");
          for (const item of items) {
            dsl.push(`      ${item}`);
          }
        }
      } else {
        dsl.splice(0, dsl.length, ...req.asset.structure.outlineDsl);
      }
      if (req.feedback && (req.feedback.includes("비고") || req.feedback.includes("열"))) {
        dsl[1] = "  구분 | 항 목 | 비고";
      }
      return {
        outlineDsl: dsl,
        rationale: `사용자 데이터를 '${req.asset.title}'의 좌측 분류 + 우측 복합 셀 구조로 재구성했습니다.${feedbackNote}`,
        engine: "fallback",
      };
    }

    const dsl: string[] = [`<<view:table>> ${docTitle}`];
    if (kvPairs.length > 0) {
      for (const [k, v] of kvPairs) {
        dsl.push(`  ${k} | ${v || "[-]"}`);
      }
    } else if (plainItems.length > 0) {
      plainItems.forEach((item, idx) => {
        dsl.push(`  항목 ${idx + 1} | ${item}`);
      });
    } else {
      dsl.splice(0, dsl.length, ...req.asset.structure.outlineDsl);
    }
    if (req.feedback && req.feedback.includes("비고")) {
      dsl.push("  비고 | [-]");
    }
    return {
      outlineDsl: dsl,
      rationale: `사용자 데이터를 '${req.asset.title}'의 2열 메타 폼 표 구조로 정리했습니다.${feedbackNote}`,
      engine: "fallback",
    };
  }

  // Page / Section asset: sequentially project user content into {{placeholders}}
  const pool = [...kvPairs.map(([k, v]) => `${k}: ${v}`), ...plainItems];
  let cursor = 0;
  const outLines = req.asset.structure.outlineDsl.map((raw) =>
    raw.replace(/\{\{([^}]+)\}\}/g, (_m, placeholder: string) => {
      if (placeholder.includes("제목") && docTitle) return docTitle;
      if (cursor < pool.length) {
        const nextVal = pool[cursor];
        cursor += 1;
        return nextVal;
      }
      return placeholder;
    })
  );
  return {
    outlineDsl: outLines,
    rationale: `'${req.asset.title}' 구조 골격에 현재 문서 데이터를 매핑해 느낌 보기를 구성했습니다.${feedbackNote}`,
    engine: "fallback",
  };
}

/**
 * `.vdoc` 블록/페이지에서 AI 추상화를 거쳐 `.vasset` 초안을 생성한다.
 * 백엔드(`/api/assets/parse-from-block`) 오프라인 시 클라이언트 폴백으로 자동 전환된다.
 */
export async function parseAssetFromBlockViaAi(
  req: ParseAssetFromBlockRequest,
  signal?: AbortSignal
): Promise<{ readonly asset: VDocAsset; readonly engine: "llm" | "fallback" }> {
  let apiResp: RawParseApiResponse | null = null;
  try {
    const res = await fetch("/api/assets/parse-from-block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: req.titleHint ?? "",
        assetKind: req.assetKind,
        targetKind: req.blockKind,
        outlineDsl: req.sourceOutlineDsl,
        sourceRef: req.sourceRef ?? null,
        contextHint: req.plainTextSummary ?? null,
      }),
      signal,
    });
    if (res.ok) {
      apiResp = (await res.json()) as RawParseApiResponse;
    }
  } catch {
    // Offline fallback below
  }

  const now = new Date().toISOString();
  const title =
    apiResp?.title?.trim() || req.titleHint?.trim() || `${req.blockKind} 구조 에셋`;
  const outlineDsl =
    apiResp?.outlineDsl && apiResp.outlineDsl.length > 0
      ? apiResp.outlineDsl
      : req.sourceOutlineDsl.map((ln, idx) => abstractPlaceholderLine(ln, idx + 1));

  const profileId: "a4" | "blog" = req.assetKind === "blog-section" ? "blog" : "a4";
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || `blk-${Date.now().toString(36)}`;
  const compiled = compileOutlineDslLinesToAssetBlocks(outlineDsl, {
    profileId,
    prefix: slug,
    sectionTitle: title,
  });

  const asset: VDocAsset = {
    version: "1.0.0",
    assetId: `asset-${req.assetKind}-${slug}-${Date.now().toString(36).slice(-4)}`,
    title,
    scope: req.assetKind === "a4-page" || req.assetKind === "blog-section" ? "section" : "element",
    assetKind: req.assetKind,
    targetKind: req.blockKind,
    category:
      apiResp?.category ||
      (req.assetKind === "a4-page"
        ? "A4 서식 페이지"
        : req.assetKind === "blog-section"
          ? "블로그 섹션"
          : "표 · 서식"),
    tags: apiResp?.tags?.length ? apiResp.tags : [req.assetKind, req.blockKind, "AI추출"],
    nuance: apiResp?.nuance ?? {
      summary: `${title}에서 추출한 재사용 구조 에셋입니다. 항목명·칸 수·내용을 현재 문서 맥락에 맞게 재구성해 적용합니다.`,
      structureRules: [
        "원본의 열·계층·복합 셀 배치를 유지하면서 항목명과 행 수는 사용자 데이터에 맞춰 유연하게 조정",
      ],
      adaptationHints: ["데이터 수량에 맞춰 행 또는 목록 항목을 확장·축소"],
    },
    structure: {
      outlineDsl,
      blocks: compiled.blocks,
      slots: compiled.slots,
      ...(req.assetKind === "a4-page" || req.assetKind === "blog-section"
        ? {
            pageMeta: {
              pageLabel: title,
              unitKind: req.assetKind === "a4-page" ? "page" : "section",
              surfaceWidth: req.assetKind === "a4-page" ? 794 : 720,
            },
          }
        : {}),
    },
    origin: {
      sourceType: "vdoc-capture",
      sourceRef: req.sourceRef,
      createdAt: now,
      updatedAt: now,
    },
  };

  return { asset, engine: apiResp?.engine ?? "fallback" };
}

/**
 * `.ref` 레퍼런스 문서에서 AI 구조 추출을 실행해 `.vasset` 을 생성한다.
 */
export async function parseAssetFromRefViaAi(
  req: ParseAssetFromRefRequest,
  signal?: AbortSignal
): Promise<{ readonly asset: VDocAsset; readonly engine: "llm" | "fallback" }> {
  let apiResp: RawParseApiResponse | null = null;
  try {
    const res = await fetch("/api/assets/parse-from-ref", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refTitle: req.refTitle,
        assetKind: req.assetKind,
        extractedText: req.blockSummaries.join("\n"),
        frameLabels: req.blockSummaries.slice(0, 8),
        sourceRef: req.sourceRef ?? null,
        thumbnailUrl: req.thumbnailUrl ?? null,
      }),
      signal,
    });
    if (res.ok) {
      apiResp = (await res.json()) as RawParseApiResponse;
    }
  } catch {
    // Offline fallback below
  }

  const now = new Date().toISOString();
  const title = apiResp?.title?.trim() || `${req.refTitle || "레퍼런스"} 구조 에셋`;
  const fallbackDsl =
    req.assetKind === "blog-section"
      ? [
          `<<view:section:spot>> {{${title}}}`,
          `  [img:{{${req.refTitle} 대표 이미지}}]`,
          `  > {{${req.refTitle} 핵심 정보}}`,
          ...(req.blockSummaries.slice(0, 3).map((s, i) => `    항목 ${i + 1} :: {{${s.slice(0, 26)}}}`)),
          "  ! {{핵심 요약 포인트}}",
        ]
      : req.assetKind === "a4-page"
        ? [
            `<<view:section>> {{${title}}}`,
            `  <<view:title>> {{${req.refTitle || "서식 제목"}}}`,
            "  <<view:table>> 기본 정보",
            "    {{구분}} | {{내용}}",
            "    {{작성일}} | {{YYYY. MM. DD.}}",
            "  <<view:table:header>> 세부 항목",
            "    {{구분}} | {{항목}}",
            ...(req.blockSummaries.length > 0
              ? req.blockSummaries.slice(0, 4).map((s, i) => `    {{분류 ${i + 1}}} | {{${s.slice(0, 28)}}}`)
              : ["    {{분류 1}} | {{세부 내용}}"]),
          ]
        : [
            `<<view:table:header>> {{${title}}}`,
            "  {{구분}} | {{항목}}",
            ...(req.blockSummaries.length > 0
              ? req.blockSummaries.slice(0, 4).map((s, i) => `  {{항목 ${i + 1}}} | {{${s.slice(0, 28)}}}`)
              : ["  {{분류 1}} | {{세부 내용 1}}", "  {{분류 2}} | {{세부 내용 2}}"]),
          ];

  const outlineDsl =
    apiResp?.outlineDsl && apiResp.outlineDsl.length > 0 ? apiResp.outlineDsl : fallbackDsl;

  const profileId: "a4" | "blog" = req.assetKind === "blog-section" ? "blog" : "a4";
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || `ref-${Date.now().toString(36)}`;
  const compiled = compileOutlineDslLinesToAssetBlocks(outlineDsl, {
    profileId,
    prefix: slug,
    sectionTitle: title,
  });

  const asset: VDocAsset = {
    version: "1.0.0",
    assetId: `asset-${req.assetKind}-${slug}-${Date.now().toString(36).slice(-4)}`,
    title,
    scope: req.assetKind === "a4-page" || req.assetKind === "blog-section" ? "section" : "element",
    assetKind: req.assetKind,
    targetKind:
      req.assetKind === "a4-page"
        ? "page"
        : req.assetKind === "blog-section"
          ? "section"
          : "structured-table",
    category: apiResp?.category || "레퍼런스 추출",
    tags: apiResp?.tags?.length ? apiResp.tags : [req.assetKind, "레퍼런스추출"],
    nuance: apiResp?.nuance ?? {
      summary: `레퍼런스 '${req.refTitle}'에서 추출한 재사용 구조 골격입니다.`,
      structureRules: ["레퍼런스의 섹션·표·강조 블록 배치를 표준 .outline 문법으로 추상화"],
      adaptationHints: ["현재 문서 주제와 데이터 분량에 맞게 항목 수 자동 조정"],
    },
    structure: {
      outlineDsl,
      blocks: compiled.blocks,
      slots: compiled.slots,
      ...(req.assetKind === "a4-page" || req.assetKind === "blog-section"
        ? {
            pageMeta: {
              pageLabel: title,
              unitKind: req.assetKind === "a4-page" ? "page" : "section",
              surfaceWidth: req.assetKind === "a4-page" ? 794 : 720,
            },
          }
        : {}),
    },
    origin: {
      sourceType: "ref-extract",
      sourceRef: req.sourceRef,
      thumbnailUrl: req.thumbnailUrl,
      createdAt: now,
      updatedAt: now,
    },
  };

  return { asset, engine: apiResp?.engine ?? "fallback" };
}

/**
 * 사용자의 기존 데이터 + 선택한 에셋 뉘앙스를 AI로 재구성해
 * Staged Preview 용 `blocks` / `slots` / `outlineDsl` 을 반환한다.
 */
export async function applyAssetPreviewViaAi(
  req: ApplyAssetPreviewRequest,
  signal?: AbortSignal
): Promise<ApplyAssetPreviewResult> {
  let apiResp: RawApplyApiResponse | null = null;
  try {
    const res = await fetch("/api/assets/apply-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: req.mode,
        profileId: req.viewId ?? (req.asset.assetKind === "blog-section" ? "blog" : "a4"),
        assetId: req.asset.assetId,
        assetTitle: req.asset.title,
        assetKind: req.asset.assetKind,
        assetNuance: req.asset.nuance,
        assetOutlineDsl: req.asset.structure.outlineDsl,
        userOutlineDsl: req.userOutlineDsl,
        userPlainText: req.userPlainText,
        documentTitle: req.documentTitle,
        feedback: req.feedback ?? null,
      }),
      signal,
    });
    if (res.ok) {
      apiResp = (await res.json()) as RawApplyApiResponse;
    }
  } catch {
    // Offline fallback below
  }

  const effective = apiResp ?? runOfflineApplyFallback(req);
  const profileId: "a4" | "blog" =
    req.viewId ?? (req.asset.assetKind === "blog-section" ? "blog" : "a4");
  const compiled = compileOutlineDslLinesToAssetBlocks(effective.outlineDsl, {
    profileId,
    prefix: `prev_${Date.now().toString(36)}`,
    sectionTitle: req.documentTitle || req.asset.title,
  });

  if (compiled.blocks.length === 0) {
    // Hard safety net: never return empty preview
    return {
      ok: false,
      engine: effective.engine,
      outlineDsl: [...req.asset.structure.outlineDsl],
      rationale: `${effective.rationale} (컴파일 결과가 비어 원본 에셋 뼈대로 안전 대체했습니다.)`,
      blocks: structuredClone(req.asset.structure.blocks),
      slots: structuredClone(req.asset.structure.slots),
      validationErrors: compiled.errors,
    };
  }

  return {
    ok: compiled.ok,
    engine: effective.engine,
    outlineDsl: effective.outlineDsl,
    rationale: effective.rationale,
    blocks: compiled.blocks,
    slots: compiled.slots,
    validationErrors: compiled.errors,
  };
}
