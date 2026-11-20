import {
  createRefFromImageDataUrl,
  normalizeLegacyReferenceBundle,
  type LegacyReferenceBundleInput,
  type RefDocument,
} from "@vibe/ref-canvas/core";

export interface RegisteredReferenceSummary {
  readonly refId: string;
  readonly kind: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly sourceName: string;
  readonly pageCount: number;
  readonly layerSet: string;
  readonly status: string;
  readonly blocksCount: number;
  readonly pinsCount: number;
  readonly shotsCount: number;
}

/**
 * Lists all registered references from FastAPI (`/api/reference/normalized`) if online,
 * or transparently falls back to Vite's read-only `/local-ref-library/items` bridge.
 */
export async function listRegisteredReferences(): Promise<RegisteredReferenceSummary[]> {
  try {
    const res = await fetch("/local-ref-library/items");
    if (res.ok) {
      const data = (await res.json()) as { items?: RegisteredReferenceSummary[] };
      if (Array.isArray(data.items) && data.items.length > 0) {
        return data.items;
      }
    }
  } catch {
    // Fallback to FastAPI
  }

  try {
    const res = await fetch("/api/reference/normalized");
    if (!res.ok) return [];
    const docs = (await res.json()) as RefDocument[];
    return docs.map((d) => ({
      refId: d.refId,
      kind: d.source.originType,
      title: d.title,
      sourceUrl: d.source.sourceUrl ?? "",
      sourceName: d.source.sourceName ?? "",
      pageCount: d.frames.length,
      layerSet: d.layerSet,
      status: d.status,
      blocksCount: d.blocks.length,
      pinsCount: d.pins.length,
      shotsCount: d.frames.filter((f) => f.surfaceKind === "web-tile").length,
    }));
  } catch {
    return [];
  }
}

/**
 * Loads a single registered reference as a normalized `.ref` v1 `RefDocument`.
 * Prefers `/local-ref-library/items/:id/bundle` (works even when `:8090` is offline),
 * with seamless fallback to `/api/reference/items/:id/normalized`.
 */
export async function loadNormalizedRegisteredReference(refId: string): Promise<RefDocument> {
  try {
    const res = await fetch(`/local-ref-library/items/${encodeURIComponent(refId)}/bundle`);
    if (res.ok) {
      const bundle = (await res.json()) as LegacyReferenceBundleInput;
      return normalizeLegacyReferenceBundle(bundle);
    }
  } catch {
    // Fallback to FastAPI
  }

  const res = await fetch(`/api/reference/items/${encodeURIComponent(refId)}/normalized`);
  if (!res.ok) {
    throw new Error(`레퍼런스 '${refId}' 를 불러오지 못했습니다 (${res.status})`);
  }
  return (await res.json()) as RefDocument;
}

export interface RefImportProgressEvent {
  readonly stage: string;
  readonly percent: number;
  readonly message: string;
}

/**
 * Streams real-time URL import progress via SSE (`POST /api/reference/items/url/stream`),
 * falling back cleanly to `POST /api/reference/items/url` if the stream endpoint is unavailable.
 */
export async function importWebUrlAsRefStream(
  url: string,
  title: string | undefined,
  onProgress: (ev: RefImportProgressEvent) => void
): Promise<RefDocument> {
  onProgress({ stage: "init", percent: 5, message: `요청 전송 중: ${url}` });

  const res = await fetch("/api/reference/items/url/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ url, title: title ?? "" }),
  });

  if (res.status === 404 || res.status === 405 || !res.body) {
    onProgress({
      stage: "browser",
      percent: 25,
      message: "웹페이지 렌더링 · 블록 추출 중 (단일 요청 폴백)...",
    });
    return importWebUrlAsRef(url, title);
  }

  if (!res.ok) {
    let detail = `웹 URL 가져오기 실패 (${res.status})`;
    try {
      const err = (await res.json()) as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch {
      // ignore
    }
    throw new Error(`${detail} — 로컬 API(:8090) 상태를 확인하세요.`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalDoc: RefDocument | null = null;

  const processFrame = (frame: string) => {
    const lines = frame.split(/\r?\n/);
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) return;
    const payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
    if (eventName === "progress") {
      onProgress({
        stage: String(payload.stage ?? "working"),
        percent: Number(payload.percent ?? 50),
        message: String(payload.message ?? "진행 중..."),
      });
    } else if (eventName === "done") {
      finalDoc = (payload.normalized ?? null) as RefDocument | null;
    } else if (eventName === "error") {
      throw new Error(String(payload.detail ?? "웹 URL Import 중 오류가 발생했습니다."));
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIdx = buffer.indexOf("\n\n");
    while (sepIdx !== -1) {
      const frame = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      if (frame.trim()) processFrame(frame);
      sepIdx = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) processFrame(buffer);

  if (!finalDoc) {
    throw new Error("스트림이 정상 결과 없이 종료되었습니다.");
  }
  return finalDoc;
}

/**
 * Imports a live web URL through FastAPI `/api/reference/items/url` -> `/normalized`.
 */
export async function importWebUrlAsRef(url: string, title?: string): Promise<RefDocument> {
  const createRes = await fetch("/api/reference/items/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, title: title ?? "" }),
  });
  if (!createRes.ok) {
    let detail = `웹 URL 가져오기 실패 (${createRes.status})`;
    try {
      const err = (await createRes.json()) as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch {
      // ignore
    }
    throw new Error(
      `${detail} — 웹 URL 실측 캡처에는 로컬 API(:8090) 실행이 필요합니다.`
    );
  }
  const item = (await createRes.json()) as { refId: string };
  const normRes = await fetch(`/api/reference/items/${encodeURIComponent(item.refId)}/normalized`);
  if (!normRes.ok) {
    throw new Error(`정규화 결과 조회 실패 (${normRes.status})`);
  }
  return (await normRes.json()) as RefDocument;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

/**
 * Imports a local file (PDF / HTML / Image) via FastAPI `/api/reference/items/file` -> `/normalized`.
 * If `:8090` is offline and the file is an image, falls back cleanly to client-side normalized image `.ref`!
 */
export async function importLocalFileAsRef(file: File): Promise<RefDocument> {
  const form = new FormData();
  form.append("file", file);
  form.append("title", file.name.replace(/\.[^.]+$/, ""));
  try {
    const res = await fetch("/api/reference/items/file", {
      method: "POST",
      body: form,
    });
    if (res.ok) {
      const item = (await res.json()) as { refId: string };
      const normRes = await fetch(`/api/reference/items/${encodeURIComponent(item.refId)}/normalized`);
      if (normRes.ok) {
        return (await normRes.json()) as RefDocument;
      }
    }
  } catch {
    // Fall through to offline fallback for images
  }

  if (file.type.startsWith("image/")) {
    const dataUrl = await readAsDataUrl(file);
    return createRefFromImageDataUrl({
      title: file.name.replace(/\.[^.]+$/, ""),
      dataUrl,
    });
  }

  throw new Error(
    "PDF/HTML 파일 추출에는 로컬 API(:8090) 실행이 필요합니다. 이미지는 오프라인에서도 바로 Import 가능합니다."
  );
}
