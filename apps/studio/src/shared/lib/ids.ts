/**
 * 클라이언트 측 식별자 발급의 단일 출처. 서버(`app.core.storage.ids.new_id`)와 같은
 * `{prefix}-{밀리초 16진}-{난수 8자}` 형식이라 사전순 정렬이 곧 생성순 정렬이다.
 */
export function newId(prefix: string): string {
  const millis = Date.now().toString(16).padStart(11, "0");
  const random = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
  return `${prefix}-${millis}-${random}`;
}
