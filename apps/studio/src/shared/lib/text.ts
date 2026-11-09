/**
 * 텍스트 처리 및 안전한 자르기 유틸리티.
 */

/**
 * 최대 max 글자(UTF-16 단위)로 자르되, 이모지 같은 서로게이트 쌍을 반으로 쪼개지 않는다.
 * 잘린 지점의 마지막 글자가 고위 서로게이트(0xD800-0xDBFF)이면 그 글자를 포함하지 않고 하나 덜 자른다.
 */
export function clipText(s: string, max: number): string {
  if (s.length <= max) return s;
  let end = max;
  const code = s.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return s.slice(0, end);
}

