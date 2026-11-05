/**
 * 참조 PDF 의 사각 영역 → 그 안의 글자 (pdf.js 텍스트 레이어).
 * 좌표는 뷰어 계약과 같은 `[ymin, xmin, ymax, xmax]` 0~1000 (페이지 기준).
 * 스캔 이미지 PDF 처럼 텍스트 레이어가 없으면 빈 문자열.
 */
import { pdfjs } from "react-pdf";

type PdfDoc = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

const docs = new Map<string, Promise<PdfDoc>>();

function loadPdf(url: string): Promise<PdfDoc> {
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  let pending = docs.get(url);
  if (!pending) {
    pending = pdfjs.getDocument({ url }).promise;
    pending.catch(() => docs.delete(url));
    docs.set(url, pending);
  }
  return pending;
}

interface Word {
  x: number;
  y: number;
  h: number;
  text: string;
}

export async function extractPdfRegionText(url: string, pageNumber: number, box: [number, number, number, number]): Promise<string> {
  const pdf = await loadPdf(url);
  const page = await pdf.getPage(pageNumber);
  const [x0, y0, x1, y1] = page.view; // PDF 좌표 (아래가 0)
  const width = x1 - x0;
  const height = y1 - y0;
  const [ymin, xmin, ymax, xmax] = box;
  const content = await page.getTextContent();
  const words: Word[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const [, , , , tx, ty] = item.transform as number[];
    const h = Math.abs((item as { height?: number }).height ?? 0) || 8;
    const w = (item as { width?: number }).width ?? 0;
    // 글자 상자의 가운데가 영역 안이면 포함한다.
    const cx = ((tx - x0 + w / 2) / width) * 1000;
    const cy = ((y1 - (ty + h / 2)) / height) * 1000;
    if (cx < xmin || cx > xmax || cy < ymin || cy > ymax) continue;
    words.push({ x: tx, y: ty, h, text: item.str });
  }
  // 위 → 아래, 같은 줄은 왼쪽 → 오른쪽. 줄 높이의 절반 안이면 같은 줄로 본다.
  words.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Word[][] = [];
  for (const word of words) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - word.y) <= Math.max(line[0].h, word.h) * 0.5) line.push(word);
    else lines.push([word]);
  }
  return lines
    .map((line) =>
      line
        .sort((a, b) => a.x - b.x)
        .map((w) => w.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n");
}
