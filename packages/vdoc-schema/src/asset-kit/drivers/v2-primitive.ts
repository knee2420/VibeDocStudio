/**
 * Variant B (`v2-primitive`) — 조합 가능한 프리미티브 · 영역(header/body/footer) · 필드 계약 기반 확장형 에셋 드라이버.
 *
 * - 표(`table-grid`)뿐 아니라 글로만 된 폼 양식(`kv-block(borderless)`, `clause-tree(legal-kr / article-kr)`,
 *   `header-band`, `divider-band(spread-text)`, `signoff-block`)을 표 없이 네이티브로 표현한다.
 * - `v2` 정본(`VDocAssetV2Spec`)에서 기존 `.vdoc` `LayoutBlock[]` + `VDocSlot` 및 `.outline` DSL 을 결정적으로 컴파일해
 *   기존 2D 캔버스·아웃라인 렌더러를 수정 없이 100% 재사용한다.
 */
import { compileOutlineToVDoc } from "../../element-syntax/ir-compiler";
import { createElementSyntaxRegistry } from "../../element-syntax/registry";
import type { OutlineSyntaxNode } from "../../element-syntax/contract";
import type { LayoutBlock, VDocSlot } from "../../types";
import type { AssetRecommendationHit, AssetSchemaDriver, AssetSelectSummary } from "../driver";
import { BUILTIN_VDOC_ASSETS } from "../seed-assets";
import type {
  AssetFlowMode,
  AssetPrimitiveKind,
  AssetPrimitiveNode,
  ClauseNumberingScheme,
  VDocAsset,
  VDocAssetV2Spec,
} from "../types";

const V2_SEED_TIME = "2026-11-24T10:00:00.000Z";
const KR_SUB_LABELS = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차"];
const CIRCLED_NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function spreadLetters(text: string): string {
  const clean = text.replace(/\s+/g, "").trim();
  return clean.split("").join(" ");
}

function formatClauseParentPrefix(scheme: ClauseNumberingScheme | undefined, idx: number): string {
  if (scheme === "article-kr") return `제${idx + 1}조`;
  return `${idx + 1}.`;
}

function formatClauseChildPrefix(scheme: ClauseNumberingScheme | undefined, idx: number): string {
  if (scheme === "article-kr") return CIRCLED_NUMS[idx] ?? `(${idx + 1})`;
  if (scheme === "decimal") return `${idx + 1})`;
  return `${KR_SUB_LABELS[idx] ?? String(idx + 1)}.`;
}

function parseDslLines(lines: readonly string[], prefix: string): OutlineSyntaxNode[] {
  const roots: OutlineSyntaxNode[] = [];
  const stack: { indent: number; node: OutlineSyntaxNode }[] = [];
  let seq = 0;
  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const node: OutlineSyntaxNode = { id: `${prefix}_${++seq}`, text: rawLine.trim(), children: [] };
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length === 0) roots.push(node);
    else (stack[stack.length - 1].node.children as OutlineSyntaxNode[]).push(node);
    stack.push({ indent, node });
  }
  return roots;
}

/**
 * `VDocAssetV2Spec` (zones + primitives + fields) 정본을
 * 기존 2D 캔버스 `LayoutBlock[]` + `VDocSlot` 및 표준 `.outline` DSL 로 결정적 컴파일한다.
 */
export function compileV2SpecToPreview(
  spec: VDocAssetV2Spec,
  title: string,
  prefix: string,
  profileId: "a4" | "blog" = "a4"
): {
  readonly blocks: LayoutBlock[];
  readonly slots: Record<string, VDocSlot>;
  readonly outlineDsl: string[];
} {
  const blocks: LayoutBlock[] = [];
  const slots: Record<string, VDocSlot> = {};
  const outlineDsl: string[] = [`<<view:section>> ${title}`];
  let seq = 0;

  const nextId = (tag: string) => `${prefix}_${tag}_${++seq}`;
  const addSlot = (slotId: string, label: string, html: string) => {
    slots[slotId] = {
      slotId,
      label,
      role: "editable-slot",
      content: html,
      backDataRefs: [],
    };
  };

  const allNodes: readonly AssetPrimitiveNode[] = [
    ...(spec.zones.header ?? []),
    ...spec.zones.body,
    ...(spec.zones.footer ?? []),
  ];

  for (const node of allNodes) {
    if (node.type === "header-band") {
      const bid = nextId("hdr");
      const leftTxt = node.left ?? "";
      const rightTxt = node.right ?? "";
      const sLeft = `${bid}_l`;
      const sRight = `${bid}_r`;
      addSlot(
        sLeft,
        "상단 좌측 표기",
        `<p style="font-size:12px;color:#334155;margin:0;">${escapeHtml(leftTxt)}</p>`
      );
      addSlot(
        sRight,
        "상단 우측 배지",
        `<p style="font-size:11px;color:#64748b;text-align:right;margin:0;">${escapeHtml(rightTxt)}</p>`
      );
      blocks.push({
        blockId: bid,
        kind: "columns-grid",
        title: "상단 머리글",
        widths: ["60%", "40%"],
        cardStyle: "plain",
        columns: [
          { slotId: sLeft },
          { slotId: sRight },
        ],
      });
      outlineDsl.push(`  ${leftTxt}${rightTxt ? ` | ${rightTxt}` : ""}`);
      continue;
    }

    if (node.type === "title-block") {
      const bid = nextId("ttl");
      const sid = `${bid}_s`;
      const rawTitle = node.fixedText ?? node.templateText ?? title;
      const rendered = node.traits?.letterSpacing === "wide" ? spreadLetters(rawTitle) : rawTitle;
      addSlot(sid, "문서 제목", `<p style="text-align:center;font-weight:700;letter-spacing:${node.traits?.letterSpacing === "wide" ? "0.35em" : "0"};">${escapeHtml(rendered)}</p>`);
      blocks.push({
        blockId: bid,
        kind: "form-title",
        title: rawTitle,
        slotId: sid,
      });
      outlineDsl.push(`  <<view:title>> ${rendered}`);
      continue;
    }

    if (node.type === "kv-block") {
      const rows = node.rows ?? [];
      const border = node.traits?.border ?? "none";
      if (border === "grid") {
        const tblLines = [`<<view:table>> ${node.fixedText ?? "기본 정보"}`, ...rows.map((r) => `  ${r.label} | ${r.value}`)];
        const compiled = compileOutlineToVDoc(
          { version: 1, title, rootNodes: parseDslLines(tblLines, `${prefix}_kv`) },
          { registry: createElementSyntaxRegistry(), profileId, docId: `v2-${prefix}`, now: V2_SEED_TIME }
        );
        for (const p of compiled.pages) {
          for (const b of p.blocks) {
            const copy = structuredClone(b);
            delete copy.sourceNodeId;
            blocks.push(copy);
          }
        }
        Object.assign(slots, compiled.slots);
        outlineDsl.push(...tblLines.map((l) => `  ${l}`));
      } else {
        // 무테두리 / 밑줄 정렬 KV 블록 — 격자선 없는 법률·공문서 당사자·메타 영역!
        const bid = nextId("kv");
        const sid = `${bid}_s`;
        const lw = node.traits?.labelWidth ?? "120px";
        const borderCss = border === "underline" ? "border-bottom:1px solid #cbd5e1;padding-bottom:3px;" : "";
        const html = rows
          .map(
            (r) =>
              `<p style="margin:3px 0;line-height:1.7;${borderCss}"><span style="display:inline-block;min-width:${lw};font-weight:600;">${escapeHtml(r.label)}</span><span>${escapeHtml(r.value)}</span></p>`
          )
          .join("");
        addSlot(sid, "무테두리 메타 정보", html);
        blocks.push({
          blockId: bid,
          kind: "text",
          title: "메타 정보 (무테두리 KV)",
          slotId: sid,
        });
        for (const r of rows) {
          outlineDsl.push(`  ${r.label} :: ${r.value}`);
        }
      }
      continue;
    }

    if (node.type === "prose") {
      const bid = nextId("prose");
      const sid = `${bid}_s`;
      const txt = node.fixedText ?? node.templateText ?? "";
      const indentCss = node.traits?.firstLineIndent ? "text-indent:1em;" : "";
      const alignCss = node.traits?.align ? `text-align:${node.traits.align};` : "";
      addSlot(sid, "본문 문단", `<p style="margin:6px 0;line-height:1.8;${indentCss}${alignCss}">${escapeHtml(txt)}</p>`);
      blocks.push({
        blockId: bid,
        kind: "text",
        title: "본문 문단",
        slotId: sid,
      });
      outlineDsl.push(`  ${txt}`);
      continue;
    }

    if (node.type === "divider-band") {
      if (node.traits?.variant === "spread-text") {
        const bid = nextId("divtxt");
        const sid = `${bid}_s`;
        const txt = node.fixedText ?? "- 아        래 -";
        addSlot(
          sid,
          "중앙 구분 표기",
          `<p style="text-align:center;letter-spacing:0.6em;margin:12px 0;font-weight:500;">${escapeHtml(txt)}</p>`
        );
        blocks.push({
          blockId: bid,
          kind: "text",
          title: "구분 표기",
          slotId: sid,
        });
        outlineDsl.push(`  ${txt}`);
      } else {
        blocks.push({
          blockId: nextId("div"),
          kind: "divider",
          title: "구분선",
        });
        outlineDsl.push("  ---");
      }
      continue;
    }

    if (node.type === "clause-tree") {
      const scheme = node.traits?.numberingScheme ?? "legal-kr";
      const bid = nextId("clause");
      const sid = `${bid}_s`;
      const items = node.items ?? [];
      const chunks: string[] = [];
      items.forEach((item, idx) => {
        const parentPrefix = formatClauseParentPrefix(scheme, idx);
        const headingText = item.title ? `${parentPrefix} ${item.title}` : parentPrefix;
        chunks.push(`<p style="font-weight:700;margin:10px 0 4px 0;">${escapeHtml(headingText)}</p>`);
        outlineDsl.push(`  ${headingText}`);
        if (item.lead) {
          chunks.push(
            `<p style="margin:4px 0 6px 0;padding-left:1.2em;line-height:1.85;text-align:justify;">${escapeHtml(item.lead)}</p>`
          );
          outlineDsl.push(`    ${item.lead}`);
        }
        (item.children ?? []).forEach((ch, cIdx) => {
          const subPrefix = formatClauseChildPrefix(scheme, cIdx);
          const hangCss = node.traits?.hangingIndent !== false
            ? "padding-left:2.4em;text-indent:-1.5em;"
            : "padding-left:1.5em;";
          chunks.push(
            `<p style="margin:4px 0;line-height:1.85;text-align:justify;${hangCss}"><strong>${escapeHtml(subPrefix)}</strong> ${escapeHtml(ch.text)}</p>`
          );
          outlineDsl.push(`    ${subPrefix} ${ch.text}`);
        });
      });
      addSlot(sid, `계층 본문 (${scheme})`, chunks.join(""));
      blocks.push({
        blockId: bid,
        kind: "text",
        title: `계층 본문 (${scheme})`,
        slotId: sid,
      });
      continue;
    }

    if (node.type === "signoff-block") {
      const bid = nextId("sign");
      const sid = `${bid}_s`;
      const lines = (node.rows ?? []).map((r) => `${r.label ? `${r.label} ` : ""}${r.value}`);
      const html = lines
        .map((ln, idx) => {
          const align = idx === lines.length - 1 ? "left" : idx === 0 ? "center" : "right";
          const weight = idx === lines.length - 1 ? "700" : "500";
          return `<p style="text-align:${align};font-weight:${weight};margin:6px 0;">${escapeHtml(ln)}</p>`;
        })
        .join("");
      addSlot(sid, "말미 서명 · 수신처", html);
      blocks.push({
        blockId: bid,
        kind: "text",
        title: "말미 서명 · 수신처",
        slotId: sid,
      });
      for (const ln of lines) outlineDsl.push(`  ${ln}`);
      continue;
    }

    if (node.type === "table-grid" && node.tableDsl && node.tableDsl.length > 0) {
      const compiled = compileOutlineToVDoc(
        {
          version: 1,
          title,
          rootNodes: parseDslLines(
            [`<<view:section>> ${title}`, ...node.tableDsl.map((l) => `  ${l}`)],
            `${prefix}_tbl`
          ),
        },
        { registry: createElementSyntaxRegistry(), profileId, docId: `v2-tbl-${prefix}`, now: V2_SEED_TIME }
      );
      for (const p of compiled.pages) {
        for (const b of p.blocks) {
          const copy = structuredClone(b);
          delete copy.sourceNodeId;
          blocks.push(copy);
        }
      }
      Object.assign(slots, compiled.slots);
      outlineDsl.push(...node.tableDsl.map((l) => `  ${l}`));
      continue;
    }

    if (node.type === "callout") {
      const bid = nextId("call");
      const sid = `${bid}_s`;
      const txt = node.fixedText ?? node.templateText ?? "";
      addSlot(sid, "강조 포인트", `<p>${escapeHtml(txt)}</p>`);
      blocks.push({
        blockId: bid,
        kind: "callout-box",
        title: "핵심 포인트",
        variant: "accent-bar",
        slotId: sid,
      });
      outlineDsl.push(`  ! ${txt}`);
      continue;
    }

    if (node.type === "media") {
      const bid = nextId("img");
      const label = node.fixedText ?? node.templateText ?? "대표 이미지";
      blocks.push({
        blockId: bid,
        kind: "image",
        title: label,
        alt: label,
        src: "",
      });
      outlineDsl.push(`  [img:${label}]`);
    }
  }

  return { blocks, slots, outlineDsl };
}

function buildV2Seeds(): readonly VDocAsset[] {
  // 1. [서식 예] 상고이유서 — 글로만 된 표준 법률 서면 폼 (표 0개!)
  const appealSpec: VDocAssetV2Spec = {
    flowMode: "prose-form",
    zones: {
      header: [
        {
          id: "hdr-1",
          type: "header-band",
          left: "[서식 예] 상고이유서",
          right: "[기관 QR · 식별 배지]",
        },
        {
          id: "ttl-1",
          type: "title-block",
          fixedText: "상고이유서",
          traits: { align: "center", letterSpacing: "wide" },
        },
        {
          id: "kv-parties",
          type: "kv-block",
          traits: { border: "none", labelWidth: "125px" },
          rows: [
            { label: "사 건", value: "{{case_no}} {{case_title}}" },
            { label: "원 고(상 고 인)", value: "{{appellant_name}}" },
            { label: "피 고(피상고인)", value: "{{appellee_name}}" },
          ],
        },
        {
          id: "prose-submit",
          type: "prose",
          fixedText: "위 사건에 관하여 원고(상고인)는 아래와 같이 상고이유서를 제출합니다.",
          traits: { firstLineIndent: true },
        },
        {
          id: "div-below",
          type: "divider-band",
          fixedText: "- 아  래 -",
          traits: { variant: "spread-text", align: "center" },
        },
      ],
      body: [
        {
          id: "clause-points",
          type: "clause-tree",
          repeatable: true,
          traits: { numberingScheme: "legal-kr", hangingIndent: true, align: "justify" },
          items: [
            {
              title: "상고이유 제1점",
              lead: "{{point_1_summary}}",
              children: [
                { text: "{{point_1_argument_a}}" },
                { text: "{{point_1_argument_b}}" },
              ],
            },
          ],
        },
      ],
      footer: [
        {
          id: "sign-1",
          type: "signoff-block",
          rows: [
            { label: "", value: "{{submit_date}}" },
            { label: "위 원고(상고인)", value: "{{appellant_name}} (인)" },
            { label: "", value: "{{target_court}} 귀중" },
          ],
        },
      ],
    },
    fields: [
      { id: "case_no", label: "사건번호", type: "string", required: true, placeholder: "20○○다○○○", evidenceHint: "원심판결문 상단 사건번호" },
      { id: "case_title", label: "사건명", type: "string", required: true, placeholder: "부당이득금반환", evidenceHint: "소장 또는 원심판결문 사건명" },
      { id: "appellant_name", label: "원고(상고인)", type: "party", required: true, placeholder: "○○○" },
      { id: "appellee_name", label: "피고(피상고인)", type: "party", required: true, placeholder: "◇◇◇" },
      { id: "point_1_summary", label: "상고이유 핵심 요지", type: "rich-text", required: true, repeatable: true, evidenceHint: "원심판결문 판시 요지 및 대법원 판례 (<<resource:...>> 부착)" },
      { id: "point_1_argument_a", label: "사실관계 및 법리 논거", type: "rich-text", required: true, repeatable: true, evidenceHint: "임대차계약서·배당표 등 증빙 자료 (<<resource:...>> 근거 바인딩)" },
      { id: "submit_date", label: "제출일자", type: "date", required: true, placeholder: "2026.  .  ." },
      { id: "target_court", label: "제출 법원", type: "string", required: true, placeholder: "대법원" },
    ],
  };
  const appealCompiled = compileV2SpecToPreview(appealSpec, "[서식 예] 상고이유서", "v2_appeal", "a4");

  // 2. [표준 계약서] 업무위탁 · 용역 계약서 — 조항형 산문 폼 (표 0개!)
  const contractSpec: VDocAssetV2Spec = {
    flowMode: "prose-form",
    zones: {
      header: [
        { id: "c-ttl", type: "title-block", fixedText: "업무위탁 표준계약서", traits: { align: "center", letterSpacing: "wide" } },
        {
          id: "c-intro",
          type: "prose",
          templateText: "{{client_name}}(이하 '갑'이라 한다)와 {{vendor_name}}(이하 '을'이라 한다)는 아래와 같이 업무위탁 계약을 체결한다.",
          traits: { firstLineIndent: true },
        },
        {
          id: "c-kv",
          type: "kv-block",
          traits: { border: "underline", labelWidth: "110px" },
          rows: [
            { label: "계약건명", value: "{{contract_title}}" },
            { label: "계약기간", value: "{{contract_period}}" },
            { label: "계약금액", value: "{{contract_amount}}" },
          ],
        },
      ],
      body: [
        {
          id: "c-clauses",
          type: "clause-tree",
          repeatable: true,
          traits: { numberingScheme: "article-kr", hangingIndent: true, align: "justify" },
          items: [
            {
              title: "(목적)",
              lead: "본 계약은 갑이 을에게 위탁하는 {{contract_scope}} 업무의 수행 조건과 권리·의무를 정함을 목적으로 한다.",
              children: [{ text: "{{article_1_detail}}" }],
            },
            {
              title: "(대금 지급 및 검수)",
              lead: "갑은 을의 산출물 검수 완료 후 {{payment_terms}} 이내에 계약금액을 지급한다.",
              children: [{ text: "{{article_2_detail}}" }],
            },
          ],
        },
      ],
      footer: [
        {
          id: "c-sign",
          type: "signoff-block",
          rows: [
            { label: "", value: "{{contract_date}}" },
            { label: "갑 (위탁인)", value: "{{client_name}} (인)" },
            { label: "을 (수탁인)", value: "{{vendor_name}} (인)" },
          ],
        },
      ],
    },
    fields: [
      { id: "contract_title", label: "계약건명", type: "string", required: true },
      { id: "client_name", label: "갑(위탁인)", type: "party", required: true },
      { id: "vendor_name", label: "을(수탁인)", type: "party", required: true },
      { id: "contract_period", label: "계약기간", type: "string", required: true, evidenceHint: "제안요청서 사업 기간" },
      { id: "contract_amount", label: "계약금액", type: "currency", required: true, evidenceHint: "견적서 또는 예산 산출표" },
      { id: "contract_scope", label: "위탁 업무 범위", type: "rich-text", required: true, evidenceHint: "과업지시서 핵심 과업" },
    ],
  };
  const contractCompiled = compileV2SpecToPreview(contractSpec, "업무위탁 표준계약서", "v2_contract", "a4");

  // 3. [붙임 5호] 사업 실적 증명서 — grid-form (v1 과 직접 A/B 비교용!)
  const v1Attach5 = BUILTIN_VDOC_ASSETS.find((a) => a.assetId === "asset-a4-attach5-performance");
  const attach5TableDsl = v1Attach5?.structure.outlineDsl.slice(1).map((l) => l.replace(/^  /, "")) ?? [
    "<<view:title>> 사업 실적 증명서",
    "<<view:table>> 실적 정보",
    "  업체명 | [-] | 대표자 | [-]",
  ];
  const attach5Spec: VDocAssetV2Spec = {
    flowMode: "grid-form",
    zones: {
      header: [{ id: "a5-hdr", type: "header-band", left: "[붙임 5호 서식]", right: "공공 입찰 증빙" }],
      body: [{ id: "a5-tbl", type: "table-grid", tableDsl: attach5TableDsl }],
    },
    fields: [
      { id: "company_name", label: "업체명(상호)", type: "party", required: true },
      { id: "project_name", label: "사업명", type: "string", required: true, evidenceHint: "계약서 또는 실적증명 원천 데이터" },
      { id: "contract_amount", label: "이행실적 금액", type: "currency", required: true, evidenceHint: "세금계산서·계약서 금액 (<<resource:...>> 부착)" },
    ],
  };
  const attach5Compiled = compileV2SpecToPreview(attach5Spec, "[붙임 5호] 사업 실적 증명서 (v2)", "v2_att5", "a4");

  // 4. [블로그] 스팟 리뷰 섹션 — hybrid (v1 과 직접 A/B 비교용!)
  const blogSpec: VDocAssetV2Spec = {
    flowMode: "hybrid",
    zones: {
      body: [
        { id: "b-img", type: "media", fixedText: "{{대표 리드 사진}}" },
        {
          id: "b-kv",
          type: "kv-block",
          traits: { border: "underline", labelWidth: "90px" },
          rows: [
            { label: "입장료", value: "{{price}}" },
            { label: "운영 시간", value: "{{hours}}" },
            { label: "위치", value: "{{location}}" },
          ],
        },
        { id: "b-prose", type: "prose", templateText: "{{spot_review_body}}" },
        { id: "b-tip", type: "callout", templateText: "{{visitor_tip}}" },
      ],
    },
    fields: [
      { id: "price", label: "입장료/가격", type: "currency", evidenceHint: "공식 웹사이트 요금표" },
      { id: "hours", label: "운영 시간", type: "string", evidenceHint: "공식 안내 페이지" },
      { id: "spot_review_body", label: "리뷰 본문", type: "rich-text", required: true },
      { id: "visitor_tip", label: "현장 방문 팁", type: "string" },
    ],
  };
  const blogCompiled = compileV2SpecToPreview(blogSpec, "[블로그] 스팟 리뷰 섹션 (v2)", "v2_blog", "blog");

  return [
    {
      version: "2.0.0",
      schemaVersion: "v2",
      assetId: "asset-v2-legal-appeal-brief",
      title: "[서식 예] 상고이유서 (법률 서면 · 글 중심 폼)",
      scope: "document",
      assetKind: "a4-page",
      targetKind: "page",
      category: "A4 법률 · 산문 서식",
      tags: ["v2-primitive", "prose-form", "상고이유서", "법률서면", "무테두리KV", "계층번호"],
      nuance: {
        summary: "상단 좌/우 헤더·QR, 자간 확장 중앙 제목, 무테두리 사건·당사자 KV, '- 아 래 -' 구분자, 법률 계층번호(1.→가.) 내어쓰기 본문으로 구성된 글 중심 표준 법원 서면입니다.",
        structureRules: [
          "표(table-grid)를 쓰지 않고 kv-block(border:none)으로 사건·원고·피고를 정렬",
          "clause-tree(legal-kr, hangingIndent:true)로 상고이유 제N점 및 가. 나. 다. 항목을 반복 확장",
        ],
        visualRules: ["중앙 자간 제목(상 고 이 유 서)", "무테두리 라벨폭 125px", "양쪽 정렬 + 내어쓰기"],
        adaptationHints: ["상고이유 쟁점 수에 따라 clause-tree 를 1..N점으로 자동 반복 확장"],
      },
      structure: {
        outlineDsl: appealCompiled.outlineDsl,
        blocks: appealCompiled.blocks,
        slots: appealCompiled.slots,
        pageMeta: { pageLabel: "상고이유서", unitKind: "page", surfaceWidth: 794 },
      },
      v2: appealSpec,
      origin: { sourceType: "builtin", createdAt: V2_SEED_TIME, updatedAt: V2_SEED_TIME },
    },
    {
      version: "2.0.0",
      schemaVersion: "v2",
      assetId: "asset-v2-legal-contract",
      title: "[표준 계약서] 업무위탁 · 용역 계약서 (조항형 폼)",
      scope: "document",
      assetKind: "a4-page",
      targetKind: "page",
      category: "A4 법률 · 산문 서식",
      tags: ["v2-primitive", "prose-form", "계약서", "조항형", "제1조", "서명란"],
      nuance: {
        summary: "밑줄 KV 요약 메타 아래 제1조 → ① 체계의 반복 조항 트리와 말미 갑/을 서명 블록을 갖춘 표준 계약서 양식입니다.",
        structureRules: [
          "계약 요약은 kv-block(underline), 조항 본문은 clause-tree(article-kr)로 구성",
          "하단에 signoff-block 으로 계약일·갑·을 서명란 배치",
        ],
        adaptationHints: ["특약·비밀유지·지식재산권 등 조항 수에 따라 clause-tree 반복"],
      },
      structure: {
        outlineDsl: contractCompiled.outlineDsl,
        blocks: contractCompiled.blocks,
        slots: contractCompiled.slots,
        pageMeta: { pageLabel: "표준 계약서", unitKind: "page", surfaceWidth: 794 },
      },
      v2: contractSpec,
      origin: { sourceType: "builtin", createdAt: V2_SEED_TIME, updatedAt: V2_SEED_TIME },
    },
    {
      version: "2.0.0",
      schemaVersion: "v2",
      assetId: "asset-v2-attach5-performance",
      title: "[붙임 5호] 사업 실적 증명서 (복합 표 폼 · v2)",
      scope: "section",
      assetKind: "a4-page",
      targetKind: "page",
      category: "A4 공문 · 표 서식",
      tags: ["v2-primitive", "grid-form", "붙임5호", "실적증명서", "복합표"],
      nuance: {
        summary: "좌측 3단 대분류 병합 표(table-grid)와 필수 증빙 필드 계약을 결합한 공공 입찰 실적 증명서입니다.",
        structureRules: ["table-grid 프리미티브로 3단 대분류 복합 병합 표를 유지하고 fields 로 필수 증빙을 바인딩"],
      },
      structure: {
        outlineDsl: attach5Compiled.outlineDsl,
        blocks: attach5Compiled.blocks,
        slots: attach5Compiled.slots,
        pageMeta: { pageLabel: "붙임 5호", unitKind: "page", surfaceWidth: 794 },
      },
      v2: attach5Spec,
      origin: { sourceType: "builtin", createdAt: V2_SEED_TIME, updatedAt: V2_SEED_TIME },
    },
    {
      version: "2.0.0",
      schemaVersion: "v2",
      assetId: "asset-v2-blog-spot",
      title: "[블로그] 스팟 리뷰 섹션 (하이브리드 폼 · v2)",
      scope: "section",
      assetKind: "blog-section",
      targetKind: "section",
      category: "블로그 · 웹 콘텐츠",
      tags: ["v2-primitive", "hybrid", "블로그", "리뷰", "스팟"],
      nuance: {
        summary: "대표 이미지(media) + 밑줄 속성(kv-block) + 본문(prose) + 팁 강조(callout)로 조립한 하이브리드 리뷰 섹션입니다.",
        structureRules: ["media → kv-block(underline) → prose → callout 4단 리듬 유지"],
      },
      structure: {
        outlineDsl: blogCompiled.outlineDsl,
        blocks: blogCompiled.blocks,
        slots: blogCompiled.slots,
        pageMeta: { pageLabel: "스팟 리뷰", unitKind: "section", surfaceWidth: 720 },
      },
      v2: blogSpec,
      origin: { sourceType: "builtin", createdAt: V2_SEED_TIME, updatedAt: V2_SEED_TIME },
    },
  ];
}

export const BUILTIN_V2_ASSETS: readonly VDocAsset[] = buildV2Seeds();

const FLOW_LABEL: Record<AssetFlowMode, string> = {
  "prose-form": "글 중심 폼",
  "grid-form": "표 중심 폼",
  hybrid: "하이브리드",
};

const PRIM_BADGE: Partial<Record<AssetPrimitiveKind, string>> = {
  "kv-block": "KV 정렬",
  "clause-tree": "계층 번호",
  "table-grid": "복합 표",
  "signoff-block": "서명·수신처",
  "divider-band": "구분 표기",
  "header-band": "상단 배지",
};

function tokenizeQuery(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,./()[\]{}|:;\-_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export const V2_PRIMITIVE_ASSET_DRIVER: AssetSchemaDriver = {
  version: "v2",
  label: "v2 · 프리미티브 확장형",
  description: "표(table-grid) + 글 중심 폼(무테두리 KV · 법률/조항 계층번호 · 서명란 · 필드/근거 계약) 통합 스키마",
  vaultSubdir: "v2",

  getSeeds(): readonly VDocAsset[] {
    return BUILTIN_V2_ASSETS;
  },

  compileToPreview(asset: VDocAsset) {
    if (asset.v2) {
      return compileV2SpecToPreview(
        asset.v2,
        asset.title,
        asset.assetId.replace(/[^a-z0-9]/gi, "").slice(0, 14) || "v2",
        asset.assetKind === "blog-section" ? "blog" : "a4"
      );
    }
    return {
      blocks: structuredClone(asset.structure.blocks),
      slots: structuredClone(asset.structure.slots),
      outlineDsl: [...asset.structure.outlineDsl],
    };
  },

  summarizeForSelect(asset: VDocAsset): AssetSelectSummary {
    const spec = asset.v2;
    if (!spec) {
      return {
        schemaVersion: "v2",
        flowMode: "hybrid",
        badges: ["v2 호환"],
        primitiveKinds: ["prose"],
        fieldCount: 0,
        evidenceHintCount: 0,
        agentPromptLine: `[v2] ${asset.assetId} — ${asset.title}: ${asset.nuance.summary}`,
      };
    }
    const allNodes = [
      ...(spec.zones.header ?? []),
      ...spec.zones.body,
      ...(spec.zones.footer ?? []),
    ];
    const primKinds = Array.from(new Set(allNodes.map((n) => n.type)));
    const badges: string[] = [FLOW_LABEL[spec.flowMode]];
    for (const n of allNodes) {
      if (n.type === "kv-block" && n.traits?.border === "none") {
        badges.push("무테두리 KV");
      } else if (n.type === "clause-tree") {
        badges.push(
          n.traits?.numberingScheme === "article-kr"
            ? "조항(제1조→①)"
            : n.traits?.numberingScheme === "legal-kr"
              ? "법률번호(1.→가.)"
              : "계층번호"
        );
      } else if (PRIM_BADGE[n.type]) {
        badges.push(PRIM_BADGE[n.type]!);
      }
      if (n.repeatable) badges.push("반복구간");
    }
    const evidenceHintCount = spec.fields.filter((f) => Boolean(f.evidenceHint)).length;
    if (evidenceHintCount > 0) badges.push(`근거힌트 ${evidenceHintCount}`);
    const uniqueBadges = Array.from(new Set(badges)).slice(0, 6);

    const fieldSummary = spec.fields.map((f) => f.label).slice(0, 6).join(", ");
    return {
      schemaVersion: "v2",
      flowMode: spec.flowMode,
      badges: uniqueBadges,
      primitiveKinds: primKinds,
      fieldCount: spec.fields.length,
      evidenceHintCount,
      agentPromptLine: `[v2|${spec.flowMode}] ${asset.assetId} — ${asset.title} | 구조:[${uniqueBadges.join(", ")}] | 필드:[${fieldSummary}] | ${asset.nuance.summary}`,
    };
  },

  recommendForQuery(query: string, catalog: readonly VDocAsset[]): readonly AssetRecommendationHit[] {
    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) {
      return catalog.slice(0, 3).map((asset) => ({ asset, score: 1, reasons: ["기본 추천"] }));
    }
    const wantsProseForm = /서면|법원|소장|상고|이유서|내용증명|계약서|조항|공문|진술서|위임장|독촉|글로/.test(query);
    const wantsGridForm = /표|증명서|실적|견적|명세|계획표|체크리스트|비교표/.test(query);
    const wantsBlog = /블로그|리뷰|후기|여행|스팟|포스팅|소개/.test(query);

    const scored: AssetRecommendationHit[] = [];
    for (const asset of catalog) {
      let score = 0;
      const reasons: string[] = [];
      const spec = asset.v2;
      const fieldHay = (spec?.fields ?? []).map((f) => `${f.label} ${f.evidenceHint ?? ""}`).join(" ").toLowerCase();
      const baseHay = `${asset.title} ${asset.category} ${asset.tags.join(" ")} ${asset.nuance.summary}`.toLowerCase();

      if (spec) {
        if (wantsProseForm && spec.flowMode === "prose-form") {
          score += 4;
          reasons.push("글 중심 폼(prose-form) 적합");
        }
        if (wantsGridForm && spec.flowMode === "grid-form") {
          score += 4;
          reasons.push("표 중심 폼(grid-form) 적합");
        }
        if (wantsBlog && spec.flowMode === "hybrid") {
          score += 4;
          reasons.push("하이브리드 콘텐츠 적합");
        }
      }

      for (const tok of tokens) {
        if (asset.title.toLowerCase().includes(tok)) {
          score += 3.5;
          reasons.push(`제목 일치('${tok}')`);
        } else if (fieldHay.includes(tok)) {
          score += 2.5;
          reasons.push(`필드/근거 힌트 일치('${tok}')`);
        } else if (baseHay.includes(tok)) {
          score += 1.5;
          reasons.push(`설명/태그 일치('${tok}')`);
        }
      }
      if (score > 0) {
        scored.push({ asset, score, reasons: Array.from(new Set(reasons)).slice(0, 4) });
      }
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 5);
  },
};
