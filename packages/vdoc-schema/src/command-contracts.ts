/**
 * @vibe/vdoc-schema — 서버 원장(`/api/projects/{id}/commands`)에 보내는 아웃라인 노드 명령 계약.
 *
 * 트리 불변식(깊이 파생 · 형제 이동 · 하위 노드 연쇄 삭제 · 읽기 전용 보호)은 서버 애그리거트가
 * 지킨다. 클라이언트는 명령을 보내고 돌아온 매니페스트로 상태를 교체할 뿐이다.
 * 백엔드 짝: `apps/api/app/projects/schemas.py` (`OutlineCommandRequest`).
 */
import type { OutlinerNode, WorkbenchPhase } from "./project-manifest";

/** 노드에서 바꿀 수 있는 필드. 구조(부모 · 깊이)와 출처는 전용 명령으로만 바뀐다. */
export type OutlineNodeFields = Partial<
  Pick<
    OutlinerNode,
    | "title"
    | "summary"
    | "zoomLevel"
    | "targetDocId"
    | "targetPageId"
    | "targetBlockId"
    | "targetSlotId"
    | "recommendedTemplateId"
    | "aiStatus"
  >
>;

export type OutlineCommand =
  | {
      kind: "insert_node";
      title: string;
      /** 없으면 아웃라인 루트 아래. */
      parentId?: string | null;
      nodeId?: string;
      fields?: OutlineNodeFields;
      provenanceSourceProjectId?: string | null;
      provenanceSourceNodeId?: string | null;
    }
  | { kind: "update_node"; nodeId: string; patch: OutlineNodeFields }
  | { kind: "delete_node"; nodeId: string }
  | { kind: "move_node"; nodeId: string; direction: -1 | 1 }
  | { kind: "indent_node"; nodeId: string; delta: -1 | 1 }
  | { kind: "assign_template"; nodeId: string; templateId: string }
  | { kind: "set_phase"; phase: WorkbenchPhase };

export type OutlineCommandKind = OutlineCommand["kind"];
