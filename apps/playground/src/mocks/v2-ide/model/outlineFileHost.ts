import { isWebTarget, type FileDisplay } from "@vibe/outliner";
import type { DroppedItem, OutlineFileHost } from "@vibe/outliner/editor";
import { VIBE_VAULT_PATHS_MIME } from "@vibe/file-explorer/core";
import { basename, dirname, joinPath, normalizeVaultPath, type VaultPort } from "@vibe/vault-core";

/** 아웃라인에 붙인 파일을 보관하는 폴더 (아웃라인 파일 옆). */
export const OUTLINE_ATTACHMENT_FOLDER = "attachments";

/** 끌어다 놓았을 때 파일로 붙이지 않고 위키링크 글자로 넣는 문서 종류. */
const DOCUMENT_EXTENSIONS = new Set(["md", "outline", "vdoc", "ref", "txt", "json"]);

/** 종류별 표시 크기. 그림은 작게 바로 보이고, 나머지는 이름만 보인다. */
const DISPLAY_BY_KIND: Record<string, FileDisplay> = { image: "small" };

function extensionOf(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 클립보드 캡처처럼 이름이 없거나 브라우저가 붙인 뻔한 이름(`image.png`)이면
 * 겹치지 않게 시각을 담은 이름을 준다.
 */
export function attachmentNameFor(file: Blob, now: Date = new Date()): string {
  const given = (file as Partial<File>).name?.trim() ?? "";
  if (given && !/^image\.(png|jpe?g|gif|webp)$/i.test(given)) return given;
  const sub = file.type.split("/")[1]?.toLowerCase() ?? "png";
  const ext = sub === "jpeg" ? "jpg" : /^(png|gif|webp|svg)/.test(sub) ? sub.replace(/\+.*$/, "") : "png";
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `Pasted image ${stamp}.${ext}`;
}

function readVaultDragPaths(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer || !Array.from(dataTransfer.types).includes(VIBE_VAULT_PATHS_MIME)) return [];
  try {
    const parsed = JSON.parse(dataTransfer.getData(VIBE_VAULT_PATHS_MIME)) as unknown;
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function pickFiles(ownerDocument: Document): Promise<File[]> {
  return new Promise((resolve) => {
    const input = ownerDocument.createElement("input");
    input.type = "file";
    input.style.display = "none";
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => finish([]), { once: true });
    ownerDocument.body.appendChild(input);
    input.click();
  });
}

export interface VaultOutlineFilesOptions {
  readonly vault: VaultPort;
  /** 지금 편집 중인 아웃라인 파일 경로 (첨부 폴더 위치의 기준). */
  readonly getOutlinePath: () => string;
  /** 볼트 파일을 워크벤치 탭으로 연다. */
  readonly openFile?: (path: string) => void;
  /** 파일 고르기 창을 띄울 문서 (편집 화면이 떠 있는 창). */
  readonly getDocument?: () => Document;
}

/**
 * 불릿에 딸린 파일을 이 볼트에서 다루는 법 (`@vibe/outliner` 의 `OutlineFileHost`).
 * - 주소: 볼트 안 경로 (`폴더/attachments/그림.png`) 또는 웹 주소
 * - 받기: 끌어다 놓거나 붙여 넣은 파일은 아웃라인 옆 `attachments/` 에 저장
 * - 탐색기에서 끌어온 볼트 파일은 복사하지 않고 그 경로를 가리킨다 (문서는 위키링크 글자로)
 * - 열기: 볼트 파일은 워크벤치 탭(그림·PDF 뷰어)으로, 웹 주소는 새 창으로
 */
export function createVaultOutlineFiles(options: VaultOutlineFilesOptions): OutlineFileHost {
  const { vault, getOutlinePath, openFile } = options;
  const getDocument = options.getDocument ?? (() => document);

  const importFiles = async (files: File[]): Promise<string[]> => {
    if (files.length === 0) return [];
    if (!vault.importBinaryFiles) {
      throw new Error("이 볼트는 파일 저장을 지원하지 않습니다 (로컬 볼트에서만 첨부할 수 있습니다).");
    }
    if (vault.isReadOnly?.()) throw new Error("읽기 전용 볼트입니다 — 잠금을 해제한 뒤 첨부하세요.");
    const folder = joinPath(dirname(getOutlinePath()), OUTLINE_ATTACHMENT_FOLDER);
    const now = new Date();
    return vault.importBinaryFiles(
      folder,
      files,
      files.map((f) => attachmentNameFor(f, now))
    );
  };

  return {
    resolveUrl: (target) => {
      if (isWebTarget(target)) return target;
      const path = normalizeVaultPath(target);
      if (!vault.exists(path) || !vault.getBinaryUrl) return null;
      return vault.getBinaryUrl(path);
    },

    open: (target) => {
      if (isWebTarget(target)) {
        getDocument().defaultView?.open(target, "_blank", "noopener");
        return;
      }
      const path = normalizeVaultPath(target);
      if (vault.exists(path)) openFile?.(path);
    },

    pick: async () => {
      const files = await pickFiles(getDocument());
      const [first] = await importFiles(files.slice(0, 1));
      return first ?? null;
    },

    importFiles,

    isDraggingFile: (event) => {
      const types = Array.from(event.dataTransfer?.types ?? []);
      return types.includes("Files") || types.includes(VIBE_VAULT_PATHS_MIME);
    },

    resolveDrop: async (event) => {
      const dt = event.dataTransfer ?? null;
      const vaultPaths = readVaultDragPaths(dt);
      if (vaultPaths.length > 0) {
        return vaultPaths
          .filter((p) => vault.getNode(p)?.kind === "file")
          .map((p): DroppedItem =>
            DOCUMENT_EXTENSIONS.has(extensionOf(p))
              ? { text: `[[${basename(p).replace(/\.md$/i, "")}]]` }
              : { fileTarget: p }
          );
      }
      const osFiles = Array.from(dt?.files ?? []);
      const stored = await importFiles(osFiles);
      return stored.map((fileTarget) => ({ fileTarget }));
    },

    displayOf: (kindId) => DISPLAY_BY_KIND[kindId] ?? "title",
  };
}
