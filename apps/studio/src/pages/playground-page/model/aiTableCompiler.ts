import { AssistantClient, type ContextRef } from "@vibe/ai-kernel";
import { env } from "../../../shared/config/env";
import { parseContainerDirective, stripLinkTags } from "./documentLinkParser";
import { type BlockAssetMeta, parseThreeRuleTextToNodes } from "./formAssets";
import type { PlaygroundNode } from "./types";

export { parseThreeRuleTextToNodes };

const playgroundAssistantClient = new AssistantClient({
  baseUrl: env.apiBaseUrl,
});

/** `<<table>>` 원문(`<<view:...>>` 제외)을 들여쓰기 기반 텍스트로 직렬화한다. */
export function serializeNodesToOutlineText(
  nodes: readonly PlaygroundNode[],
  depth = 0
): string {
  const lines: string[] = [];
  for (const node of nodes) {
    if (parseContainerDirective(node.text).kind === "view") continue;
    const clean = stripLinkTags(node.text);
    const validChildren = node.children.filter(
      (c) => parseContainerDirective(c.text).kind !== "view"
    );
    if (!clean && validChildren.length === 0) continue;
    const indent = "  ".repeat(depth);
    const noteSuffix = node.note?.trim() ? `  // 메모: ${node.note.trim()}` : "";
    lines.push(`${indent}${clean || "(그룹)"}${noteSuffix}`);
    if (validChildren.length > 0) {
      const nested = serializeNodesToOutlineText(validChildren, depth + 1);
      if (nested) lines.push(nested);
    }
  }
  return lines.join("\n");
}

/** 원문 트리 변경 감지를 위한 결정론적 FNV-1a 해시. */
export function computeSourceHash(sourceRows: readonly PlaygroundNode[]): string {
  const text = serializeNodesToOutlineText(sourceRows);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 에이전트(`/api/assistant/inline/run`)에 전달할 지시문과 컨텍스트를 구성한다. */
export function buildTableCompilePromptPayload(options: {
  sourceRows: readonly PlaygroundNode[];
  asset: BlockAssetMeta;
  sectionTitle?: string;
  currentViewRows?: readonly PlaygroundNode[];
  userFeedback?: string;
}): { instruction: string; contexts: ContextRef[] } {
  const { sourceRows, asset, sectionTitle, currentViewRows, userFeedback } = options;
  const sourceText = serializeNodesToOutlineText(sourceRows);

  const assetLines = [
    `에셋명: ${asset.title} (${asset.id})`,
    asset.reference ? `레퍼런스 출처: ${asset.reference}` : null,
    asset.transformRule ? `변환 규칙: ${asset.transformRule}` : `설명: ${asset.description}`,
    asset.visualStyle ? `시각 스타일: ${asset.visualStyle}` : null,
    asset.templateSnippet
      ? `\n<<template:table>> 3규칙 뼈대 예시:\n${asset.templateSnippet}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const contexts: ContextRef[] = [
    {
      kind: "playground-table-source",
      id: "source-rows",
      label: sectionTitle ? `나이브 원문 (${sectionTitle})` : "나이브 원문",
      role: "target",
      handle: "원문",
      content: sourceText,
    },
    {
      kind: "playground-table-asset",
      id: asset.id,
      label: `에셋 레퍼런스: ${asset.title}`,
      role: "reference",
      handle: "에셋",
      content: assetLines,
    },
  ];

  if (currentViewRows && currentViewRows.length > 0 && userFeedback?.trim()) {
    contexts.push({
      kind: "playground-table-view",
      id: "current-view",
      label: "현재 <<view:table>> 컴파일본",
      role: "reference",
      handle: "현재뷰",
      content: serializeNodesToOutlineText(currentViewRows),
    });
  }

  const instructionLines = [
    "당신은 문서 구조 컴파일 에이전트입니다.",
    "`@원문` 의 나이브 텍스트 데이터를 `@에셋` 레퍼런스의 규칙과 `<<template:table>>` 뼈대에 맞춰 3규칙 표 DSL로 재구성하세요.",
    "",
    "[3규칙 문법]",
    "1. 줄바꿈(enter) 하나가 표의 한 행(row)입니다.",
    "2. 같은 줄 안의 `|` 기호로 열(column)을 나눕니다. (맨 앞/뒤에 여분의 `|`를 붙이지 마세요. 마크다운 구분선 `|---|` 금지)",
    "3. 사용자가 직접 기입하거나 작성해야 할 빈 셀(응답란, 확인란, 상태, 비고 등)은 반드시 `[-]` 로 표기합니다.",
    "4. 좌측 대분류 세로 병합(`rowSpan`)이 필요한 경우에만 부모 줄(단일 셀 텍스트) 아래에 스페이스 2칸(`  `) 들여쓰기로 하위 행들을 배치합니다.",
    "5. 선택지가 여러 개면 체크박스 기호 `□ ` 를 사용합니다.",
    "6. 중간·우측 열에서 세로 병합이 필요하면 아래 행 해당 칸에 `[^]` 를, 가로 병합이 필요하면 오른쪽 인접 칸에 `[<]` 를 적어 열 개수를 맞춥니다.",
    "",
    "[엄수 사항]",
    "- `@원문` 의 모든 질문·항목·선택지·세부 값을 누락 없이 반영하세요.(`{{...}}` 플레이스홀더를 그대로 남기지 말고 실제 원문 데이터로 치환)",
    "- `@원문` 에 없는 선택지(예: `□ 예  □ 아니오`, `□ 지참  □ 미지참`)나 임의의 비고 문구(예: `불참자만 작성`)를 새로 창작하지 마세요. 원문에 선택지가 없고 사용자가 작성해야 하는 기입란·비고란은 반드시 `[-]` 로 둡니다.",
    "- `불참 사유(불참자만)` 처럼 괄호 조건이 붙은 항목명도 원문 표현을 임의로 분리·축약하지 말고 그대로 유지하세요.",
    "- 설명 문장, 인사말, 코드펜스(```), `<<view:table>>` 태그 줄 없이 오직 3규칙 본문 줄들만 출력하세요.",
  ];

  if (userFeedback?.trim()) {
    instructionLines.push(
      "",
      `[사용자 부분 수정 지시]\n${userFeedback.trim()}\n(@현재뷰 를 참고하되 사용자 지시에 해당하는 부분 위주로 조정하고 나머지 구조와 데이터는 유지하세요.)`
    );
  }

  return {
    instruction: instructionLines.join("\n"),
    contexts,
  };
}

export interface AgentCompileResult {
  viewNodes: PlaygroundNode[];
  rawText: string;
  modelLabel: string;
}

/** 백엔드 인라인 에이전트(`/api/assistant/inline/run`)를 호출해 3규칙 `<<view:table>>` 을 생성한다. */
export async function compileTableViewWithAgent(options: {
  sourceRows: readonly PlaygroundNode[];
  asset: BlockAssetMeta;
  sectionTitle?: string;
  currentViewRows?: readonly PlaygroundNode[];
  userFeedback?: string;
  idPrefix?: string;
  signal?: AbortSignal;
  onStatus?: (patch: { engineLabel?: string; streamPreview?: string }) => void;
}): Promise<AgentCompileResult> {
  const { instruction, contexts } = buildTableCompilePromptPayload(options);
  const idPrefix = options.idPrefix ?? "pg_ai_view";

  let engineLabel = "agent";
  let accumulated = "";
  let finalResult = "";
  let streamError: string | null = null;

  await playgroundAssistantClient.runInline(
    {
      actionId: "playground-table-compile",
      instruction,
      contexts,
      outputFormat: "text",
    },
    (event) => {
      if (event.type === "turn_start") {
        engineLabel = `${event.provider}:${event.model}`;
        options.onStatus?.({ engineLabel });
      } else if (event.type === "text_delta") {
        accumulated += event.text;
        options.onStatus?.({ streamPreview: accumulated });
      } else if (event.type === "result") {
        finalResult = event.text ?? accumulated;
      } else if (event.type === "error") {
        streamError = event.message;
      }
    },
    options.signal
  );

  if (streamError) {
    throw new Error(streamError);
  }

  const rawText = (finalResult || accumulated).trim();
  const viewNodes = parseThreeRuleTextToNodes(rawText, idPrefix);
  if (viewNodes.length === 0) {
    throw new Error("에이전트가 유효한 3규칙 표 행을 반환하지 않았습니다.");
  }

  return {
    viewNodes,
    rawText,
    modelLabel: engineLabel,
  };
}
