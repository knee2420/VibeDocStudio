import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";

const IGNORED_DIRS = new Set([".git", ".obsidian", ".trash", "node_modules", ".vibe"]);
const INLINE_TEXT_EXTS = new Set([
  "md",
  "markdown",
  "outline",
  "vdoc",
  "json",
  "txt",
  "yaml",
  "yml",
  "base",
  "canvas",
]);

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

interface MountedVaultRecord {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8").trim();
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function toPosixRel(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function resolveSafePath(rootPath: string, relPath: string): string {
  const normRoot = path.resolve(rootPath);
  const cleanRel = toPosixRel(relPath);
  const resolved = cleanRel ? path.resolve(normRoot, cleanRel) : normRoot;
  const relCheck = path.relative(normRoot, resolved);
  if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
    throw new Error(`Path escapes mounted vault root: ${relPath}`);
  }
  return resolved;
}

function scanVaultTree(rootPath: string, includeContents: boolean) {
  const entries: Array<{
    path: string;
    name: string;
    parentPath: string;
    kind: "file" | "folder";
    ctime: number;
    mtime: number;
    extension?: string;
    stem?: string;
    size?: number;
  }> = [];
  const files: Record<string, string> = {};

  const walk = (absDir: string, relDir: string) => {
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const dirent of dirEntries) {
      if (dirent.isDirectory() && IGNORED_DIRS.has(dirent.name)) continue;
      const absChild = path.join(absDir, dirent.name);
      const relChild = relDir ? `${relDir}/${dirent.name}` : dirent.name;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absChild);
      } catch {
        continue;
      }

      if (dirent.isDirectory()) {
        entries.push({
          path: relChild,
          name: dirent.name,
          parentPath: relDir,
          kind: "folder",
          ctime: Math.round(stat.birthtimeMs || stat.ctimeMs),
          mtime: Math.round(stat.mtimeMs),
        });
        walk(absChild, relChild);
      } else if (dirent.isFile()) {
        const dotIdx = dirent.name.lastIndexOf(".");
        const ext = dotIdx > 0 ? dirent.name.slice(dotIdx + 1).toLowerCase() : "";
        const stemName = dotIdx > 0 ? dirent.name.slice(0, dotIdx) : dirent.name;
        entries.push({
          path: relChild,
          name: dirent.name,
          parentPath: relDir,
          kind: "file",
          extension: ext,
          stem: stemName,
          size: stat.size,
          ctime: Math.round(stat.birthtimeMs || stat.ctimeMs),
          mtime: Math.round(stat.mtimeMs),
        });

        if (includeContents && INLINE_TEXT_EXTS.has(ext) && stat.size <= 512 * 1024) {
          try {
            files[relChild] = fs.readFileSync(absChild, "utf-8");
          } catch {
            // Skip unreadable file
          }
        }
      }
    }
  };

  walk(rootPath, "");
  return { entries, files };
}

function makeUniqueFsPath(absTarget: string): string {
  if (!fs.existsSync(absTarget)) return absTarget;
  const dir = path.dirname(absTarget);
  const parsed = path.parse(absTarget);
  let i = 1;
  while (true) {
    const candidate = path.join(dir, `${parsed.name} ${i}${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    i += 1;
  }
}

/**
 * Vite Dev Server 로컬 FS 볼트 브릿지 미들웨어 (`/local-vault-api/api/vaults/*`).
 *
 * - 외부 볼트를 전혀 변형하지 않고 임의의 로컬 폴더(전체 또는 부분 이관 폴더)를 즉시 마운트
 * - 메타데이터 트리만 먼저 반환(`includeContents=false`), 텍스트는 `/file`, 이미지/PDF는 `/raw`로 스트리밍
 * - 쓰기 API는 명시적 `X-Vault-Writable: true` 헤더 + path-traversal 검증을 통과할 때만 허용
 */
export function localVaultBridgePlugin(): Plugin {
  const mounted = new Map<string, MountedVaultRecord>();
  let activeVaultId = "";

  const attachMiddleware = (server: ViteDevServer) => {
    server.middlewares.use(async (req, res, next) => {
      const rawUrl = req.url ?? "";
      if (!rawUrl.startsWith("/local-vault-api/")) {
        next();
        return;
      }

      const urlObj = new URL(rawUrl, "http://127.0.0.1");
      const subPath = urlObj.pathname.slice("/local-vault-api".length);
      const method = (req.method ?? "GET").toUpperCase();

      try {
        // 1. List / mount local vaults
        if (subPath === "/api/vaults" && method === "GET") {
          const vaults = Array.from(mounted.values()).map((v) => ({
            ...v,
            isDefault: false,
            exists: fs.existsSync(v.rootPath),
          }));
          sendJson(res, 200, { vaults, activeVaultId });
          return;
        }

        if (subPath === "/api/vaults" && method === "POST") {
          const body = await readJsonBody(req);
          const rawRoot = typeof body.rootPath === "string" ? body.rootPath.trim() : "";
          if (!rawRoot) {
            sendJson(res, 400, { detail: "rootPath is required" });
            return;
          }
          const resolvedRoot = path.resolve(rawRoot);
          if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
            sendJson(res, 404, { detail: `Directory does not exist: ${resolvedRoot}` });
            return;
          }
          const name =
            typeof body.name === "string" && body.name.trim()
              ? body.name.trim()
              : path.basename(resolvedRoot) || "Local Vault";
          const id =
            typeof body.id === "string" && body.id.trim()
              ? body.id.trim()
              : `local-${Buffer.from(resolvedRoot).toString("base64url").slice(0, 16)}`;

          const record: MountedVaultRecord = { id, name, rootPath: resolvedRoot };
          mounted.set(id, record);
          activeVaultId = id;
          sendJson(res, 200, { ...record, isDefault: false, exists: true });
          return;
        }

        const vaultMatch = /^\/api\/vaults\/([^/]+)(\/.*)?$/.exec(subPath);
        if (!vaultMatch) {
          sendJson(res, 404, { detail: `Unknown local-vault endpoint: ${subPath}` });
          return;
        }

        const vaultId = decodeURIComponent(vaultMatch[1]);
        const actionPath = vaultMatch[2] ?? "";
        const record = mounted.get(vaultId);

        if (actionPath === "" && method === "DELETE") {
          mounted.delete(vaultId);
          if (activeVaultId === vaultId) activeVaultId = "";
          sendJson(res, 200, { status: "unmounted" });
          return;
        }

        if (!record) {
          sendJson(res, 404, { detail: `Mounted vault not found: ${vaultId}` });
          return;
        }

        // 2. Read-only endpoints (tree, file text, raw binary stream)
        if (actionPath === "/tree" && method === "GET") {
          const includeContents = urlObj.searchParams.get("includeContents") === "true";
          const { entries, files } = scanVaultTree(record.rootPath, includeContents);
          sendJson(res, 200, {
            vault: { ...record, isDefault: false, exists: true },
            entries,
            files,
            revision: Date.now(),
          });
          return;
        }

        if (actionPath === "/file" && method === "GET") {
          const relPath = urlObj.searchParams.get("path") ?? "";
          const absPath = resolveSafePath(record.rootPath, relPath);
          if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
            sendJson(res, 404, { detail: `File not found: ${relPath}` });
            return;
          }
          const content = fs.readFileSync(absPath, "utf-8");
          sendJson(res, 200, { path: toPosixRel(relPath), content });
          return;
        }

        if (actionPath === "/raw" && method === "GET") {
          const relPath = urlObj.searchParams.get("path") ?? "";
          const absPath = resolveSafePath(record.rootPath, relPath);
          if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
            sendJson(res, 404, { detail: `Binary file not found: ${relPath}` });
            return;
          }
          const ext = path.extname(absPath).slice(1).toLowerCase();
          res.statusCode = 200;
          res.setHeader("Content-Type", MIME_BY_EXT[ext] ?? "application/octet-stream");
          res.setHeader("Cache-Control", "private, max-age=60");
          fs.createReadStream(absPath).pipe(res);
          return;
        }

        // 3. Mutating endpoints (strictly gated by X-Vault-Writable: true)
        const writableHeader = req.headers["x-vault-writable"];
        if (writableHeader !== "true") {
          sendJson(res, 403, {
            detail: "Local vault mount is read-only. Enable write mode to modify disk files.",
          });
          return;
        }

        if (actionPath === "/file" && (method === "PUT" || method === "POST")) {
          const body = await readJsonBody(req);
          const relPath = typeof body.path === "string" ? body.path : "";
          const content = typeof body.content === "string" ? body.content : "";
          const absPath = resolveSafePath(record.rootPath, relPath);
          fs.mkdirSync(path.dirname(absPath), { recursive: true });
          fs.writeFileSync(absPath, content, "utf-8");
          sendJson(res, 200, { ok: true, path: toPosixRel(relPath) });
          return;
        }

        if (actionPath === "/folder" && method === "POST") {
          const body = await readJsonBody(req);
          const relPath = typeof body.path === "string" ? body.path : "";
          const absPath = resolveSafePath(record.rootPath, relPath);
          fs.mkdirSync(absPath, { recursive: true });
          sendJson(res, 200, { ok: true, path: toPosixRel(relPath) });
          return;
        }

        if ((actionPath === "/rename" || actionPath === "/move") && method === "POST") {
          const body = await readJsonBody(req);
          const srcRel =
            typeof body.oldPath === "string"
              ? body.oldPath
              : typeof body.sourcePath === "string"
                ? body.sourcePath
                : "";
          const dstRel =
            typeof body.newNameOrPath === "string"
              ? body.newNameOrPath
              : typeof body.targetFolderPath === "string"
                ? toPosixRel(
                    body.targetFolderPath
                      ? `${body.targetFolderPath}/${path.basename(srcRel)}`
                      : path.basename(srcRel)
                  )
                : "";
          const absSrc = resolveSafePath(record.rootPath, srcRel);
          const absDst = resolveSafePath(record.rootPath, dstRel);
          fs.mkdirSync(path.dirname(absDst), { recursive: true });
          fs.renameSync(absSrc, absDst);
          sendJson(res, 200, { ok: true, oldPath: toPosixRel(srcRel), newPath: toPosixRel(dstRel) });
          return;
        }

        if (actionPath === "/duplicate" && method === "POST") {
          const body = await readJsonBody(req);
          const srcRel = typeof body.sourcePath === "string" ? body.sourcePath : "";
          const absSrc = resolveSafePath(record.rootPath, srcRel);
          const absDst = makeUniqueFsPath(absSrc);
          fs.cpSync(absSrc, absDst, { recursive: true });
          sendJson(res, 200, {
            ok: true,
            path: toPosixRel(path.relative(record.rootPath, absDst)),
          });
          return;
        }

        if (actionPath === "/entry" && method === "DELETE") {
          const relPath = urlObj.searchParams.get("path") ?? "";
          const absPath = resolveSafePath(record.rootPath, relPath);
          if (absPath === path.resolve(record.rootPath)) {
            sendJson(res, 400, { detail: "Cannot delete vault root directory" });
            return;
          }
          fs.rmSync(absPath, { recursive: true, force: true });
          sendJson(res, 200, { ok: true, path: toPosixRel(relPath) });
          return;
        }

        sendJson(res, 404, { detail: `Unsupported action: ${method} ${actionPath}` });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Local vault bridge error";
        sendJson(res, 500, { detail: message });
      }
    });
  };

  return {
    name: "vibe-local-vault-bridge",
    configureServer: attachMiddleware,
  };
}
