/**
 * clipText UTF-16 이모지 서로게이트 절단 방지 검증 단위 테스트.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clipText } from "../src/shared/lib/text";

describe("clipText - Safe UTF-16 Text Truncation", () => {
  it("max 보다 짧거나 같은 문자열은 그대로 반환한다", () => {
    assert.strictEqual(clipText("hello", 10), "hello");
    assert.strictEqual(clipText("안녕", 2), "안녕");
  });

  it("이모지 서로게이트 쌍의 앞 반쪽(0xD800-0xDBFF)에 잘림 위치가 걸리면 하나 덜 자른다", () => {
    // '🐕' 는 UTF-16 에서 2글자: \uD83D\uDC15
    // "ab🐕" 의 길이는 2 + 2 = 4
    // max=3 으로 자르면 "ab" + "\uD83D" 가 될 뻔하지만, 앞 반쪽이므로 하나 덜 잘라 "ab" 가 된다.
    assert.strictEqual(clipText("ab🐕", 3), "ab");

    // max=4 로 자르면 "ab🐕" 온전히 잘린다.
    assert.strictEqual(clipText("ab🐕c", 4), "ab🐕");
  });

  it("🎯(Project) 및 🐕망고독 같은 실제 도메인 경로명에서 이모지 절단이 일어나지 않는다", () => {
    const text1 = "🎯(Project)"; // '🎯' 는 2글자
    assert.strictEqual(clipText(text1, 1), ""); // 1로 자르면 이모지 앞 반쪽이므로 ""
    assert.strictEqual(clipText(text1, 2), "🎯"); // 2로 자르면 "🎯"

    const text2 = "🐕망고독/자료";
    assert.strictEqual(clipText(text2, 1), ""); // 앞 반쪽 절단 방지 -> ""
    assert.strictEqual(clipText(text2, 2), "🐕");
    assert.strictEqual(clipText(text2, 4), "🐕망고");
    assert.strictEqual(clipText(text2, 5), "🐕망고독");
  });
});
