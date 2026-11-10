import type { ContextSlot } from "./types";
import { referencesSlot } from "./referencesSlot";
import { resourcesSlot } from "./resourcesSlot";
import { scopeSlot } from "./scopeSlot";

/**
 * Composer 컨텍스트 슬롯 레지스트리 (P1, §5.1)
 *
 * 새 슬롯을 추가하려면:
 * 1. 슬롯 정의 파일 작성 (ContextSlot 인터페이스 구현)
 * 2. 아래 배열에 슬롯을 추가 (바와 메뉴 코드는 수정 불필요)
 */
export const CONTEXT_SLOTS: ContextSlot[] = [
  referencesSlot,
  resourcesSlot,
  scopeSlot,
];

