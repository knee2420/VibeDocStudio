import assert from "node:assert/strict";
import { test } from "node:test";

import { changeSnippet, diffParagraphs, diffWords, htmlToDocLines, paraStat } from "../src/shared/lib/docDiff";

test("htmlToDocLines: 문단 · 줄바꿈 · 목록 · 표 · 이미지가 각각 한 줄", () => {
  assert.deepEqual(htmlToDocLines("<p>첫 줄</p><p>둘째&nbsp;줄<br>셋째</p>"), ["첫 줄", "둘째 줄", "셋째"]);
  assert.deepEqual(htmlToDocLines("<ul><li>가</li><li>나</li></ul>"), ["가", "나"]);
  assert.deepEqual(htmlToDocLines("<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>"), ["a | b", "c | d"]);
  assert.deepEqual(htmlToDocLines('<img src="x.png" alt="로고">'), ["[이미지] 로고"]);
  assert.deepEqual(htmlToDocLines(""), []);
  assert.deepEqual(htmlToDocLines("<p></p><p> </p>"), []);
});

test("diffWords: 바뀐 낱말만 빨강/초록", () => {
  assert.deepEqual(diffWords("상금 100만원 수여", "상금 200만원 수여"), [
    { kind: "same", text: "상금 " },
    { kind: "del", text: "100만원" },
    { kind: "add", text: "200만원" },
    { kind: "same", text: " 수여" },
  ]);
});

test("diffWords: 바뀐 낱말 사이 공백 때문에 잘게 끊기지 않는다", () => {
  assert.deepEqual(diffWords("가 나 다 라", "가 X Y 라"), [
    { kind: "same", text: "가 " },
    { kind: "del", text: "나 다" },
    { kind: "add", text: "X Y" },
    { kind: "same", text: " 라" },
  ]);
});

test("diffParagraphs: 같은 쌍은 다시 계산하지 않는다", () => {
  const a = diffParagraphs("<p>하나</p>", "<p>둘</p>");
  assert.equal(diffParagraphs("<p>하나</p>", "<p>둘</p>"), a);
});

test("diffParagraphs: 비슷한 문단은 고친 문단, 전혀 다르면 삭제 + 추가", () => {
  const paras = diffParagraphs("<p>머리</p><p>상금 100만원 수여</p><p>꼬리</p>", "<p>머리</p><p>상금 200만원 수여</p><p>완전히 새로운 문단</p>");
  assert.deepEqual(
    paras.map((p) => p.kind),
    ["same", "changed", "removed", "added"],
  );
  // 100만원(5) → 200만원(5), 꼬리(2) → 완전히새로운문단(8)
  assert.deepEqual(paraStat(paras), { added: 13, removed: 7 });
});

test("diffParagraphs: 새 칸은 모두 추가, 서식만 바뀐 칸은 변경 없음", () => {
  assert.deepEqual(paraStat(diffParagraphs("", "<p>가나</p><p>다</p>")), { added: 3, removed: 0 });
  assert.deepEqual(paraStat(diffParagraphs("<p>같음</p>", "<p><b>같음</b></p>")), { added: 0, removed: 0 });
});

test("changeSnippet: 바뀐 곳 앞뒤만 남긴다", () => {
  const snip = changeSnippet(diffParagraphs("<p>아주 길고 긴 앞부분 설명이 계속 이어진 다음 상금 100만원 수여</p>", "<p>아주 길고 긴 앞부분 설명이 계속 이어진 다음 상금 200만원 수여</p>"));
  assert.equal(snip[0].kind, "same");
  assert.ok(snip[0].text.startsWith("…"));
  assert.deepEqual(snip.slice(1, 3), [
    { kind: "del", text: "100만원" },
    { kind: "add", text: "200만원" },
  ]);
});
