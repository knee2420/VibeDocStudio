/**
 * 클라이언트 워크스페이스 도구의 명세(이름 · 설명 · 위험도 · 인자 스키마) — 하네스 팩이 정본이다.
 * 실행(run) · 한 줄 요약(describe) 만 이 앱 코드에 있다. 도구는 영역별 팩에 나뉘어 있다:
 * editor(문서 · 캔버스 · Staged) · resource(백데이터 · 근거 · RM 발췌) · reference(레퍼런스).
 */
import type { WorkspaceTool } from "@vibe/ai-kernel";
import editorTools from "@vibe/harness-packs/editor/tools.client.json";
import referenceTools from "@vibe/harness-packs/reference/tools.client.json";
import resourceTools from "@vibe/harness-packs/resource/tools.client.json";

type ClientToolSpec = Pick<WorkspaceTool, "name" | "description" | "risk" | "inputSchema">;

const SPECS = new Map<string, ClientToolSpec>(
  ([...editorTools, ...resourceTools, ...referenceTools] as ClientToolSpec[]).map((spec) => [spec.name, spec])
);

export function clientTool(name: string): ClientToolSpec {
  const spec = SPECS.get(name);
  if (!spec) throw new Error(`하네스 팩에 클라이언트 도구 명세가 없습니다: ${name}`);
  return spec;
}
