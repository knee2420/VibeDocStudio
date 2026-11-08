import { clipText } from "./text";

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

/** HTML → 모델 · 칩용 평문 (태그 제거, 흔한 엔티티 복원, 공백 정리). */
export function htmlToPlain(html: string, maxLength?: number): string {
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();
  return maxLength === undefined || text.length <= maxLength ? text : `${clipText(text, maxLength)}…`;
}
