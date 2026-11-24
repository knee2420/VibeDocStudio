import type { ContextRef } from "@vibe/ai-kernel";
import type { V2AiEnv } from "./contexts";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const TEXT_UPLOAD_EXT = /\.(md|markdown|txt|outline|json|vsyntax|vstyle|vasset|csv|ya?ml|html?|xml|ts|tsx|js|jsx|py|css|sql)$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 16_000;
const ATTACHMENTS_FOLDER = "_attachments";

export function isImageFilePath(path: string): boolean {
  return IMAGE_EXT.test(path);
}

export function guessImageMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function readFileAsBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsArrayBuffer(file);
  });
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  const bytes = await readFileAsBytes(file);
  return new TextDecoder("utf-8").decode(bytes);
}

/** 이미 볼트 안에 있는 이미지 파일 → Composer 멀티모달 첨부 ContextRef. */
export function imageVaultRef(env: Pick<V2AiEnv, "vault" | "apiBaseUrl">, path: string): ContextRef {
  const name = path.split("/").pop() ?? path;
  const mimeType = guessImageMime(path);
  const base = (env.apiBaseUrl ?? "").replace(/\/$/, "");
  const previewUrl = `${base}/api/vaults/${encodeURIComponent(env.vault.id)}/raw?path=${encodeURIComponent(path)}`;
  return {
    kind: "image",
    id: `vault:${path}`,
    label: name,
    hint: `${path} · 이미지`,
    content: `[볼트 이미지] ${path} (문서 삽입 시 resource:vault:${path})`,
    access: "read",
    role: "reference",
    media: {
      mimeType,
      previewUrl,
      vaultPath: path,
      fileName: name,
    },
    meta: { path, entityKind: "file" },
  };
}

export interface AttachUploadOptions {
  readonly folder?: string;
  readonly fetchFn?: typeof fetch;
}

/**
 * OS 파일 선택 · 클립보드 붙여넣기(Ctrl+V) · OS 드래그 앤 드롭으로 받은 파일들을
 * 볼트(`_attachments/`)에 업로드(가능할 때)하고 Composer 첨부 ContextRef 목록으로 변환한다.
 */
export async function attachUploadedFiles(
  env: Pick<V2AiEnv, "vault" | "vaultRootPath" | "apiBaseUrl" | "pushLog">,
  files: readonly File[],
  options: AttachUploadOptions = {}
): Promise<ContextRef[]> {
  const folder = options.folder ?? ATTACHMENTS_FOLDER;
  const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const base = (env.apiBaseUrl ?? "").replace(/\/$/, "");
  const canUploadToApi = Boolean(env.vaultRootPath && env.vault.id);
  const out: ContextRef[] = [];

  for (const file of files) {
    const fileName = file.name || `pasted-${Date.now()}.png`;
    const isImage = file.type.startsWith("image/") || IMAGE_EXT.test(fileName);
    const isText = !isImage && (file.type.startsWith("text/") || TEXT_UPLOAD_EXT.test(fileName));

    let vaultPath: string | undefined;
    if (canUploadToApi) {
      try {
        const form = new FormData();
        form.append("file", file, fileName);
        form.append("folder", folder);
        const res = await fetchFn(`${base}/api/vaults/${encodeURIComponent(env.vault.id)}/upload`, {
          method: "POST",
          body: form,
        });
        if (res.ok) {
          const dto = (await res.json()) as { path?: string };
          if (typeof dto.path === "string" && dto.path) vaultPath = dto.path;
        }
      } catch {
        /* 업로드 실패 시에도 인라인 첨부는 계속 진행 */
      }
    }

    if (isImage) {
      if (file.size > MAX_IMAGE_BYTES) {
        env.pushLog("warn", `이미지 '${fileName}' 크기가 10MB를 넘어 첨부에서 제외했습니다.`);
        continue;
      }
      const bytes = await readFileAsBytes(file);
      const mimeType = file.type || guessImageMime(fileName);
      const dataBase64 = bytesToBase64(bytes);
      const previewUrl = `data:${mimeType};base64,${dataBase64}`;
      const sizeText = formatBytes(file.size || bytes.length);
      out.push({
        kind: "image",
        id: vaultPath ? `vault:${vaultPath}` : `img:${fileName}:${Date.now().toString(36)}`,
        label: fileName,
        hint: vaultPath ? `${vaultPath} · ${sizeText}` : `첨부 이미지 · ${sizeText}`,
        content: vaultPath
          ? `[첨부 이미지] ${fileName} (${mimeType}, ${sizeText}) · 볼트 경로: ${vaultPath} (문서 삽입 시 resource:vault:${vaultPath})`
          : `[첨부 이미지] ${fileName} (${mimeType}, ${sizeText})`,
        access: "read",
        role: "reference",
        media: {
          mimeType,
          dataBase64,
          previewUrl,
          vaultPath,
          sizeBytes: file.size || bytes.length,
          fileName,
        },
        meta: vaultPath ? { path: vaultPath, entityKind: "file" } : undefined,
      });
      continue;
    }

    if (isText) {
      const rawText = await readFileAsText(file);
      const clipped = rawText.length > MAX_TEXT_CHARS ? `${rawText.slice(0, MAX_TEXT_CHARS)}…` : rawText;
      const sizeText = formatBytes(file.size || rawText.length);
      out.push({
        kind: "file",
        id: vaultPath ?? `upload:${fileName}:${Date.now().toString(36)}`,
        label: fileName,
        hint: vaultPath ? `${vaultPath} · ${sizeText}` : `첨부 파일 · ${sizeText}`,
        content: `[첨부 파일] ${vaultPath ?? fileName}\n${clipped}`,
        access: "read",
        role: "reference",
        media: {
          mimeType: file.type || "text/plain",
          vaultPath,
          sizeBytes: file.size,
          fileName,
        },
        meta: vaultPath ? { path: vaultPath, entityKind: "file" } : undefined,
      });
      continue;
    }

    const sizeText = formatBytes(file.size);
    out.push({
      kind: "file",
      id: vaultPath ?? `upload:${fileName}:${Date.now().toString(36)}`,
      label: fileName,
      hint: vaultPath ? `${vaultPath} · ${sizeText}` : `첨부 파일 · ${sizeText}`,
      content: vaultPath
        ? `[첨부 바이너리 파일] ${fileName} (${file.type || "application/octet-stream"}, ${sizeText}) · 볼트 경로: ${vaultPath}`
        : `[첨부 바이너리 파일] ${fileName} (${file.type || "application/octet-stream"}, ${sizeText})`,
      access: "read",
      role: "reference",
      media: {
        mimeType: file.type || "application/octet-stream",
        vaultPath,
        sizeBytes: file.size,
        fileName,
      },
      meta: vaultPath ? { path: vaultPath, entityKind: "file" } : undefined,
    });
  }

  return out;
}
