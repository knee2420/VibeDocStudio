/**
 * WHATWG HTML5 파서(`htmlparser2`) · 엔티티 코덱(`entities`) 기반 HTML ↔ 평문 변환기.
 *
 * 정규식 예외 추가 없이 모든 HTML 태그(단락/줄바꿈/표 셀/스크립트 제외)와
 * 모든 표준 엔티티(`&amp;`, `&nbsp;`, `&lt;`, `&#...;` 등)를 일관되게 처리한다.
 */
import { decodeHTML, escapeText } from "entities";
import { Parser } from "htmlparser2";

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tr",
  "ul",
]);

const CELL_TAGS = new Set(["td", "th"]);
const SKIP_TAGS = new Set(["script", "style", "noscript"]);

function normalizeNbsp(text: string): string {
  return text.replace(/\u00a0/g, " ");
}

/** HTML 엔티티만 디코딩해 일반 공백 기준으로 정규화한다. */
export function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  return text.includes("&") ? normalizeNbsp(decodeHTML(text)) : normalizeNbsp(text);
}

function extractTextWithHtmlParser(html: string, preserveNewlines: boolean): string {
  if (!html) return "";

  const separator = preserveNewlines ? "\n" : " ";
  const hasTag = html.includes("<");
  if (!hasTag) {
    const decoded = decodeHtmlEntities(html);
    return preserveNewlines
      ? decoded.replace(/\n{3,}/g, "\n\n").trim()
      : decoded.replace(/\s+/g, " ").trim();
  }

  const parts: string[] = [];
  let skipDepth = 0;

  const parser = new Parser(
    {
      onopentag(name) {
        const tag = name.toLowerCase();
        if (SKIP_TAGS.has(tag)) {
          skipDepth += 1;
          return;
        }
        if (skipDepth > 0) return;
        if (tag === "br") {
          parts.push(separator);
        } else if (!preserveNewlines && BLOCK_TAGS.has(tag)) {
          parts.push(" ");
        } else if (CELL_TAGS.has(tag)) {
          parts.push(" ");
        }
      },
      ontext(data) {
        if (skipDepth === 0 && data) {
          parts.push(normalizeNbsp(data));
        }
      },
      onclosetag(name) {
        const tag = name.toLowerCase();
        if (SKIP_TAGS.has(tag)) {
          skipDepth = Math.max(0, skipDepth - 1);
          return;
        }
        if (skipDepth > 0) return;
        if (BLOCK_TAGS.has(tag)) {
          parts.push(separator);
        } else if (CELL_TAGS.has(tag)) {
          parts.push(" ");
        }
      },
    },
    { decodeEntities: true }
  );

  parser.write(html);
  parser.end();

  const joined = parts.join("");
  return preserveNewlines
    ? joined.replace(/\n{3,}/g, "\n\n").trim()
    : joined.replace(/\s+/g, " ").trim();
}

/** 슬롯 HTML 을 사람이 읽는 평문으로 (`<br>` · 블록 경계는 줄바꿈으로). */
export function htmlToPlainText(html: string): string {
  return extractTextWithHtmlParser(html ?? "", true);
}

/** 한 줄 요약용: 태그를 걷어내고 공백을 하나로 모아 선택적 최대 길이로 자른다. */
export function htmlToSummary(html: string, maxLength?: number): string {
  const text = extractTextWithHtmlParser(html ?? "", false);
  return maxLength === undefined ? text : text.slice(0, maxLength);
}

/** 평문 입력을 슬롯 HTML 로 (특수문자 이스케이프, 줄바꿈은 `<br/>`). */
export function plainTextToHtml(text: string): string {
  const escaped = escapeText(text ?? "");
  return `<p>${escaped.replace(/\n/g, "<br/>")}</p>`;
}
