/**
 * HarnessResolver — (초점, 지시) → 어떤 하네스를 어떤 실행 방식 · 범위로 돌릴지.
 *
 * 하네스 사양(서버 `assistant/harness.py`)은 바뀌지 않는다. 초점에 따른 변주는 전부 여기 규칙 표 하나다:
 *   칸 하나 → 단발(inline) · 범위 · 블록 · 페이지 · 문서 → 칸마다 하네스를 도는 일괄 작업(job)
 *   채워진 칸 → 채우기 대신 출처 달기 · 검증이 앞에 선다
 */

export type FocusLevel = "document" | "page" | "block" | "slot-range" | "slot";

export interface FocusContext {
  level: FocusLevel;
  docId: string;
  pageId?: string;
  blockId?: string;
  /** 초점이 가리키는 칸 (slot · slot-range) */
  slotIds: string[];
  /** 초점 범위 안의 모든 칸 (block · page · document) — 일괄 작업 대상 후보 */
  scopeSlotIds: string[];
  label: string;
}

export type Intent = "fill" | "cite" | "verify" | "variables" | "ask";

export interface HarnessPlan {
  intent: Intent;
  harnessId: "fill.slot" | "ground.cite" | "verify.slot" | "fill.variable" | "composer";
  executor: "inline" | "job" | "loop";
  /** 실제로 돌릴 칸 */
  slotIds: string[];
  label: string;
  /** 못 하는 이유 (버튼 비활성 툴팁) */
  disabled?: string;
}

export interface SlotStateLookup {
  empty: (slotId: string) => boolean;
  editable: (slotId: string) => boolean;
}

export function planHarness(focus: FocusContext, intent: Intent, slots: SlotStateLookup): HarnessPlan {
  const pool = focus.level === "slot" || focus.level === "slot-range" ? focus.slotIds : focus.scopeSlotIds;
  const editable = pool.filter(slots.editable);
  const empty = editable.filter(slots.empty);
  const filled = editable.filter((id) => !slots.empty(id));
  switch (intent) {
    case "fill": {
      if (focus.level === "slot") {
        const id = focus.slotIds[0];
        return {
          intent, harnessId: "fill.slot", executor: "inline", slotIds: id && slots.editable(id) ? [id] : [],
          label: slots.empty(id ?? "") ? "근거로 채우기" : "근거로 다시 쓰기",
          disabled: id && slots.editable(id) ? undefined : "잠기거나 고정된 칸입니다",
        };
      }
      return {
        intent, harnessId: "fill.slot", executor: "job", slotIds: empty,
        label: `빈 칸 ${empty.length}개 일괄 채우기`,
        disabled: empty.length ? undefined : "이 범위에 빈 칸이 없습니다",
      };
    }
    case "cite": {
      const targets = focus.level === "slot" ? filled.slice(0, 1) : filled;
      return {
        intent, harnessId: "ground.cite", executor: targets.length > 1 ? "job" : "inline", slotIds: targets,
        label: targets.length > 1 ? `출처 달기 (${targets.length}칸)` : "출처 달기",
        disabled: targets.length ? undefined : "내용이 있는 칸이 없습니다",
      };
    }
    case "verify":
      return {
        intent, harnessId: "verify.slot", executor: "inline", slotIds: focus.level === "slot" ? filled.slice(0, 1) : [],
        label: "사실 확인",
        disabled: focus.level === "slot" && filled.length ? undefined : "내용이 있는 칸 하나를 고르세요",
      };
    case "variables":
      return { intent, harnessId: "fill.variable", executor: "inline", slotIds: [], label: "변수 채우기" };
    default:
      return { intent, harnessId: "composer", executor: "loop", slotIds: focus.slotIds, label: "Composer 에 묻기" };
  }
}
