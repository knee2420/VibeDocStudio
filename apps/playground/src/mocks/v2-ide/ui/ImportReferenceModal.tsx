import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ClipboardPaste,
  Download,
  FileUp,
  FolderSearch,
  Globe,
  Loader2,
  X,
} from "lucide-react";
import {
  createRefFromImageDataUrl,
  isRefPath,
  type RefDocument,
} from "@vibe/ref-canvas/core";
import type { VaultPort } from "@vibe/vault-core";

import {
  importLocalFileAsRef,
  importWebUrlAsRef,
  listRegisteredReferences,
  loadNormalizedRegisteredReference,
  type RegisteredReferenceSummary,
} from "../model/refClient";

export interface ImportReferenceModalProps {
  readonly open: boolean;
  readonly targetFolder: string;
  /** When replacing an existing empty `.ref` file, write directly into this path. */
  readonly replaceRefPath?: string | null;
  readonly vault: VaultPort;
  readonly onClose: () => void;
  readonly onImportedDoc: (doc: RefDocument, options?: { readonly replacePath?: string | null }) => void;
  readonly onStartAsyncUrlImport?: (url: string, title?: string) => void;
  readonly onPromoteVaultFile: (vaultPath: string) => void;
}

export const ImportReferenceModal: React.FC<ImportReferenceModalProps> = ({
  open,
  targetFolder,
  replaceRefPath,
  vault,
  onClose,
  onImportedDoc,
  onStartAsyncUrlImport,
  onPromoteVaultFile,
}) => {
  const [tab, setTab] = useState<"library" | "url" | "file" | "vault">("library");
  const [libState, setLibState] = useState<{
    readonly loaded: boolean;
    readonly items: RegisteredReferenceSummary[];
  }>({ loaded: false, items: [] });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [vaultQuery, setVaultQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listRegisteredReferences().then((items) => {
      if (!cancelled) {
        setLibState({ loaded: true, items });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const libraryItems = libState.items;
  const loadingLib = open && !libState.loaded;

  const promotableVaultFiles = useMemo(() => {
    if (!open) return [];
    const q = vaultQuery.trim().toLowerCase();
    return vault
      .listAll()
      .filter((n) => n.kind === "file" && !isRefPath(n.path))
      .filter((n) => !q || n.path.toLowerCase().includes(q))
      .slice(0, 60);
  }, [open, vault, vaultQuery]);

  if (!open) return null;

  const handleImportRegistered = async (item: RegisteredReferenceSummary) => {
    setBusyId(item.refId);
    setError(null);
    try {
      const doc = await loadNormalizedRegisteredReference(item.refId);
      onImportedDoc(doc, { replacePath: replaceRefPath });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "레퍼런스 Import 실패");
    } finally {
      setBusyId(null);
    }
  };

  const handleImportAllRegistered = async () => {
    if (libraryItems.length === 0) return;
    setBusyId("__all__");
    setError(null);
    try {
      for (const item of libraryItems) {
        const doc = await loadNormalizedRegisteredReference(item.refId);
        onImportedDoc(doc, { replacePath: null });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "일괄 Import 실패");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label="Import Reference (.ref)"
        onMouseDown={(ev) => ev.stopPropagation()}
        className="flex max-h-[82vh] w-full max-w-[600px] flex-col overflow-hidden rounded-xl border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] text-[12px] text-[var(--obs-text-normal,#dadada)] shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-4 py-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-amber-400" />
            <span className="font-semibold">Import Reference (.ref)</span>
            <span className="rounded bg-white/8 px-1.5 py-0.5 font-code text-[10px] text-[var(--obs-text-muted,#b3b3b3)]">
              {replaceRefPath ? replaceRefPath : targetFolder || "/ (루트)"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--obs-text-muted,#b3b3b3)] hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Tabs */}
        <div className="flex shrink-0 gap-1 border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary-alt,#1a1a1a)] px-3 py-1.5">
          {(
            [
              { id: "library", icon: BookOpen, label: `등록 라이브러리 (${libraryItems.length})` },
              { id: "url", icon: Globe, label: "웹 URL" },
              { id: "file", icon: FileUp, label: "로컬 파일 · 클립보드" },
              { id: "vault", icon: FolderSearch, label: "Vault 파일 승격" },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setError(null);
                }}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11.5px] font-medium transition ${
                  tab === t.id
                    ? "bg-amber-600 text-white"
                    : "text-[var(--obs-text-muted,#b3b3b3)] hover:bg-white/8"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "library" && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11.5px] text-[var(--obs-text-muted,#b3b3b3)]">
                  현재 프로젝트에 등록된 레퍼런스를 단일 2D Canvas + Block IR `.ref` 파일로 정규화해
                  가져옵니다.
                </p>
                {libraryItems.length > 0 && !replaceRefPath && (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void handleImportAllRegistered()}
                    className="flex shrink-0 items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-500 disabled:opacity-40"
                  >
                    {busyId === "__all__" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span>전체 {libraryItems.length}종 일괄 Import</span>
                  </button>
                )}
              </div>

              {loadingLib ? (
                <div className="flex items-center justify-center gap-2 py-10 text-[var(--obs-text-muted,#b3b3b3)]">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                  <span>등록된 레퍼런스 목록 불러오는 중...</span>
                </div>
              ) : libraryItems.length === 0 ? (
                <div className="py-10 text-center text-[var(--obs-text-faint,#777)]">
                  등록된 레퍼런스가 없습니다.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {libraryItems.map((item) => (
                    <div
                      key={item.refId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 font-code text-[9.5px] font-semibold uppercase ${
                              item.kind === "pdf"
                                ? "bg-rose-500/20 text-rose-300"
                                : "bg-sky-500/20 text-sky-300"
                            }`}
                          >
                            {item.kind}
                          </span>
                          <span className="truncate font-medium">{item.title}</span>
                        </div>
                        <div className="mt-0.5 font-code text-[10px] text-[var(--obs-text-faint,#888)]">
                          {item.refId} · {item.layerSet} ·{" "}
                          {item.kind === "pdf"
                            ? `${item.pageCount}p`
                            : item.shotsCount > 0
                              ? `${item.shotsCount} tiles`
                              : "semantic-canvas"}{" "}
                          · {item.blocksCount} blocks
                          {item.pinsCount > 0 ? ` · 📌${item.pinsCount}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void handleImportRegistered(item)}
                        className="shrink-0 rounded bg-white/10 px-2.5 py-1 text-[11px] font-medium hover:bg-amber-600 hover:text-white disabled:opacity-40"
                      >
                        {busyId === item.refId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Import"
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "url" && (
            <form
              onSubmit={async (ev) => {
                ev.preventDefault();
                if (!urlInput.trim() || busyId) return;
                if (onStartAsyncUrlImport) {
                  onStartAsyncUrlImport(urlInput.trim(), titleInput.trim() || undefined);
                  setUrlInput("");
                  setTitleInput("");
                  onClose();
                  return;
                }
                setBusyId("url");
                setError(null);
                try {
                  const doc = await importWebUrlAsRef(urlInput.trim(), titleInput.trim() || undefined);
                  onImportedDoc(doc, { replacePath: replaceRefPath });
                  onClose();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "URL Import 실패");
                } finally {
                  setBusyId(null);
                }
              }}
              className="space-y-3"
            >
              <p className="text-[11.5px] text-[var(--obs-text-muted,#b3b3b3)]">
                웹페이지 URL을 헤드리스 브라우저로 실측 캡처해 2D 타일 프레임 + Block IR `.ref`로
                정규화합니다.
              </p>
              <input
                type="url"
                required
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/article"
                className="w-full rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-3 py-2 font-code text-[12px] outline-none focus:border-amber-500"
              />
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="표시 제목 (선택)"
                className="w-full rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-3 py-2 text-[12px] outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={!urlInput.trim() || busyId !== null}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-600 py-2 text-[12px] font-medium text-white hover:bg-amber-500 disabled:opacity-40"
              >
                {busyId === "url" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                <span>웹페이지 캡처 &amp; .ref 생성</span>
              </button>
            </form>
          )}

          {tab === "file" && (
            <div className="space-y-3">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 px-4 py-8 text-center hover:bg-amber-500/10">
                {busyId === "file" ? (
                  <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                ) : (
                  <FileUp className="h-6 w-6 text-amber-400" />
                )}
                <div className="font-medium">PDF · HTML · 이미지 파일 선택</div>
                <div className="text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
                  이미지는 오프라인 즉시 정규화, PDF/HTML은 로컬 API(:8090)로 블록·좌표 추출
                </div>
                <input
                  type="file"
                  accept=".pdf,.html,.htm,.png,.jpg,.jpeg,.webp,.gif"
                  className="hidden"
                  onChange={async (ev) => {
                    const file = ev.target.files?.[0];
                    ev.target.value = "";
                    if (!file) return;
                    setBusyId("file");
                    setError(null);
                    try {
                      const doc = await importLocalFileAsRef(file);
                      onImportedDoc(doc, { replacePath: replaceRefPath });
                      onClose();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "파일 Import 실패");
                    } finally {
                      setBusyId(null);
                    }
                  }}
                />
              </label>

              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  try {
                    const clipItems = await navigator.clipboard.read();
                    for (const ci of clipItems) {
                      const imgType = ci.types.find((t) => t.startsWith("image/"));
                      if (imgType) {
                        const blob = await ci.getType(imgType);
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                          const r = new FileReader();
                          r.onload = () => resolve(String(r.result ?? ""));
                          r.onerror = () => reject(new Error("클립보드 이미지 변환 실패"));
                          r.readAsDataURL(blob);
                        });
                        const doc = createRefFromImageDataUrl({
                          title: `Clipboard-${new Date().toTimeString().slice(0, 8).replace(/:/g, "")}`,
                          dataUrl,
                        });
                        onImportedDoc(doc, { replacePath: replaceRefPath });
                        onClose();
                        return;
                      }
                    }
                    setError("클립보드에 이미지가 없습니다.");
                  } catch {
                    setError("클립보드 읽기 권한이 필요하거나 이미지가 없습니다.");
                  }
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] py-2 text-[12px] hover:border-amber-400/60"
              >
                <ClipboardPaste className="h-4 w-4 text-emerald-400" />
                <span>클립보드 이미지 바로 Import</span>
              </button>
            </div>
          )}

          {tab === "vault" && (
            <div className="space-y-2.5">
              <input
                type="text"
                value={vaultQuery}
                onChange={(e) => setVaultQuery(e.target.value)}
                placeholder="Vault 파일 검색 (.pdf, .png, .md, .vdoc...)"
                className="w-full rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-3 py-1.5 text-[12px] outline-none focus:border-amber-500"
              />
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {promotableVaultFiles.map((node) => (
                  <button
                    key={node.path}
                    type="button"
                    onClick={() => {
                      onPromoteVaultFile(node.path);
                      onClose();
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-3 py-1.5 text-left hover:border-amber-500/60"
                  >
                    <span className="truncate font-code text-[11px]">{node.path}</span>
                    <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                      .ref 승격
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
