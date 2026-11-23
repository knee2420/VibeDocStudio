import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractStylePackFromRef,
  isValidStylePack,
  resolveFrameStyle,
  resolvePageGridStyle,
  resolveStylePack,
  resolveTableGridStyle,
  resolveTextRoleStyle,
  type RefStyleInput,
} from "../src/index";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VAULT_ROOT = path.resolve(HERE, "../../../apps/playground/data/vaults/default-vault");
const STANDARD_STYLE_FILE = path.join(VAULT_ROOT, ".vibedoc", "standard.vstyle");
const BLOG_STYLE_FILE = path.join(
  VAULT_ROOT,
  "문서 스키마 표준 정비 프로젝트",
  "naver-travel-blog.vstyle"
);
const SAMPLES_DIR = path.join(VAULT_ROOT, "신규 스키마 스펙 정리", "samples");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

describe("@vibe/style-core — Real .ref Style Extraction & Vault .vstyle.json Verification", () => {
  it("extracts appropriate grid style packs from all 4 real .ref files in default-vault", () => {
    const blogRef = readJson<RefStyleInput>(
      path.join(
        VAULT_ROOT,
        "신규 스키마 스펙 정리/samples/미국 여행 라스베가스 스피어 하이롤러 할인 및 가볼만한 곳 정리.ref"
      )
    );
    const newsRef = readJson<RefStyleInput>(
      path.join(
        VAULT_ROOT,
        "01. Architecture/배민, 신형 배달 로봇 '딜리' 투입…무게 줄이고 시속 15㎞ 주행 연합뉴스.ref"
      )
    );
    const yesformRef = readJson<RefStyleInput>(
      path.join(VAULT_ROOT, "신규 스키마 스펙 정리/samples/예스폼_INS2010회의의사록무료양식및작성예시.ref")
    );
    const rfpRef = readJson<RefStyleInput>(
      path.join(VAULT_ROOT, "신규 스키마 스펙 정리/samples/제안요청서_통합AX포탈사이트구축_수정본_1P.ref")
    );

    const blogStyle = resolveStylePack(extractStylePackFromRef(blogRef));
    assert.equal(resolveTextRoleStyle(blogStyle, "body").align, "center");
    assert.equal(resolveFrameStyle(blogStyle, "info-frame").ornament, "quote-left-underline");

    const newsStyle = resolveStylePack(extractStylePackFromRef(newsRef));
    assert.equal(resolveTextRoleStyle(newsStyle, "body").align, "left");
    assert.equal(resolveFrameStyle(newsStyle, "info-frame").ornament, "left-bar");

    const yesStyle = resolveStylePack(extractStylePackFromRef(yesformRef));
    assert.equal(resolvePageGridStyle(yesStyle, "a4").width, 794);
    assert.equal(resolveTableGridStyle(yesStyle).borders.outer, "2px solid #000000");

    const rfpStyle = resolveStylePack(extractStylePackFromRef(rfpRef));
    assert.equal(resolveTableGridStyle(rfpStyle).headerFill, "#e6ecf5");
  });

  it("validates the global standard CSS base .vstyle (.vibedoc) and individual applied .vstyle files", () => {
    const targets = [
      STANDARD_STYLE_FILE,
      BLOG_STYLE_FILE,
      path.join(SAMPLES_DIR, "yonhap-news.vstyle"),
      path.join(SAMPLES_DIR, "yesform-official.vstyle"),
      path.join(SAMPLES_DIR, "gov-rfp.vstyle"),
    ];
    for (const fullPath of targets) {
      assert.equal(fs.existsSync(fullPath), true, `Missing style pack file: ${fullPath}`);
      const parsed = readJson<unknown>(fullPath);
      assert.equal(isValidStylePack(parsed), true, `Invalid StylePack format: ${fullPath}`);
    }
  });
});
