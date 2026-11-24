import React, { useMemo, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronRight, Crosshair, Folder, FolderOpen, Plus, Trash2, X } from "lucide-react";
import { useStore } from "zustand";

import { activeOutlinePath, currentOutlineScope, currentScope, listReferences, readOutline, readVDoc } from "@vibe/ai-vault";
import type { V2AiWorkspace } from "@vibe/ai-vault";
import type { OutlineScopeMode, ScopeMode } from "@vibe/ai-scope";
import { collectOutlineResources } from "@vibe/outline-sync";
import { isOutlinePath } from "@vibe/vault-formats";

/**
 * v2 Composer 설정바 — studio `ComposerSettingsBar` 의 세 슬롯(레퍼런스 · 리소스 · 범위)을 볼트 모델로.
 *   레퍼런스: 볼트의 `.ref` 파일을 켜고 끈다 (라이브러리 연결이면 서버가 원문을 직접 읽는다)
 *   리소스: 볼트 폴더 · 외부 폴더(절대 경로)를 마운트한다 — AI 가 직접 찾아 읽는다
 *   범위: 문서 끔 · 선택만 · 이 페이지 · 문서 전체
 */
type Slot = "references" | "resources" | "scope" | null;

const chipCls = (active: boolean) =>
  `flex min-w-0 flex-1 items-center gap-1 rounded-md border px-2 py-1 text-left text-[11px] transition-colors ${
    active ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
  }`;

export const V2ComposerSettingsBar: React.FC<{ readonly ai: V2AiWorkspace; readonly revision: number }> = ({ ai, revision }) => {
  const [open, setOpen] = useState<Slot>(null);
  const s = useStore(ai.store);
  const refs = useMemo(() => listReferences(ai.env), [ai, s.referencePaths, s.loadedRevision, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const enabledRefs = refs.filter((r) => r.enabled);
  const path = ai.env.activeDocPath();
  const doc = readVDoc(ai.env, path);
  const tab = ai.env.activeTabPath();
  const isOutlineTab = Boolean(tab && isOutlinePath(tab));
  const olPath = isOutlineTab ? tab : activeOutlinePath(ai.env);
  const olScope = isOutlineTab && olPath ? currentOutlineScope(ai.env, olPath) : null;
  const scope = doc && path ? currentScope(ai.env, doc, path) : null;
  const scopeLabel = isOutlineTab ? (olScope?.label ?? "아웃라인 범위") : (doc ? (scope?.label ?? "범위") : "문서 없음");
  const resourceCount = s.resourceFolders.length + s.externalFolders.length;

  return (
    <div data-testid="v2-composer-settings-bar" className="relative border-t border-slate-200 bg-slate-50 px-2 py-1.5">
      <div className="flex items-center gap-1">
        <button type="button" data-testid="v2-slot-references" className={chipCls(open === "references" || enabledRefs.length > 0)} onClick={() => setOpen(open === "references" ? null : "references")} title="레퍼런스 (.ref) — 결정 궤적, 사실 근거 아님">
          <BookOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">레퍼런스 {enabledRefs.length}/{refs.length}</span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-60" />
        </button>
        <button type="button" data-testid="v2-slot-resources" className={chipCls(open === "resources" || (s.sourcesOn && resourceCount > 0))} onClick={() => setOpen(open === "resources" ? null : "resources")} title="리소스 — 사실 근거 (AI 가 직접 찾아 읽는다)">
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{s.sourcesOn ? `리소스 ${resourceCount}곳` : "리소스 끔"}</span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-60" />
        </button>
        <button type="button" data-testid="v2-slot-scope" className={chipCls(open === "scope")} onClick={() => setOpen(open === "scope" ? null : "scope")} title={scopeLabel}>
          <Crosshair className="h-3 w-3 shrink-0" />
          <span className="truncate">{scopeLabel}</span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-60" />
        </button>
      </div>

      {open && (
        <div className="absolute bottom-full left-2 right-2 z-50 mb-1 max-h-[420px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-[12px] text-slate-700 shadow-xl">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-semibold text-slate-800">{open === "references" ? "레퍼런스" : open === "resources" ? "리소스" : "고칠 범위"}</span>
            <button type="button" onClick={() => setOpen(null)} className="rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="닫기">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {open === "references" && <ReferencesMenu ai={ai} refs={refs} />}
          {open === "resources" && <ResourcesMenu ai={ai} />}
          {open === "scope" &&
            (isOutlineTab && olPath ? (
              <OutlineScopeMenu ai={ai} outlinePath={olPath} />
            ) : (
              <ScopeMenu ai={ai} path={path} hasDoc={Boolean(doc)} />
            ))}
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ readonly on: boolean; readonly onClick: () => void; readonly label: React.ReactNode; readonly hint?: string; readonly testId?: string }> = ({ on, onClick, label, hint, testId }) => (
  <button type="button" data-testid={testId} onClick={onClick} className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left hover:bg-slate-50">
    <span className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${on ? "border-violet-500 bg-violet-500 text-white" : "border-slate-300 bg-white"}`}>
      {on && <Check className="h-2.5 w-2.5" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate">{label}</span>
      {hint && <span className="block truncate text-[10.5px] text-slate-400">{hint}</span>}
    </span>
  </button>
);

const ReferencesMenu: React.FC<{ readonly ai: V2AiWorkspace; readonly refs: ReturnType<typeof listReferences> }> = ({ ai, refs }) => {
  const [q, setQ] = useState("");
  const shown = refs.filter((r) => !q || r.title.toLowerCase().includes(q.toLowerCase()) || r.path.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <p className="mb-1.5 text-[11px] leading-4 text-slate-500">남이 비슷한 문제를 풀며 내린 결정의 궤적 — 모양 · 뼈대 · 리듬만 가져오고, 수치 · 고유명사는 사실로 쓰지 않는다.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="레퍼런스 찾기" className="mb-1 w-full rounded border border-slate-200 px-2 py-1 text-[11.5px] outline-none focus:border-violet-400" />
      {shown.length === 0 && <p className="px-1.5 py-2 text-slate-400">볼트에 .ref 파일이 없습니다.</p>}
      {shown.map((r) => (
        <Row
          key={r.path}
          testId={`v2-ref-row-${r.number}`}
          on={r.enabled}
          onClick={() => ai.store.getState().toggleReference(r.path)}
          label={`참조${r.number} · ${r.title}`}
          hint={`${r.libraryRefId ? "라이브러리 연결" : "볼트 전용"} · ${r.kind}${r.pageCount ? ` · ${r.pageCount}쪽` : ""} · ${r.path}`}
        />
      ))}
      {refs.some((r) => r.enabled) && (
        <button type="button" onClick={() => refs.filter((r) => r.enabled).forEach((r) => ai.store.getState().toggleReference(r.path, false))} className="mt-1 text-[11px] text-slate-500 hover:text-slate-800">
          모두 끄기
        </button>
      )}
    </div>
  );
};

interface FolderNode {
  readonly path: string;
  readonly name: string;
  readonly depth: number;
  readonly fileCount: number;
  readonly children: FolderNode[];
}

function buildVaultFolderTree(ai: V2AiWorkspace): { roots: FolderNode[]; flat: FolderNode[] } {
  const all = ai.env.vault.listAll().filter((n) => !n.path.split("/").some((seg) => seg.startsWith(".")));
  const files = all.filter((n) => n.kind === "file");
  const folderPaths = all
    .filter((n) => n.kind === "folder")
    .map((n) => n.path)
    .sort((a, b) => a.localeCompare(b));

  const countByFolder = new Map<string, number>();
  for (const f of files) {
    const parts = f.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const fp = parts.slice(0, i).join("/");
      countByFolder.set(fp, (countByFolder.get(fp) ?? 0) + 1);
    }
  }

  const map = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];
  const flat: FolderNode[] = [];
  for (const fp of folderPaths) {
    const parts = fp.split("/");
    const node: FolderNode = {
      path: fp,
      name: parts[parts.length - 1] ?? fp,
      depth: parts.length - 1,
      fileCount: countByFolder.get(fp) ?? 0,
      children: [],
    };
    map.set(fp, node);
    flat.push(node);
    const parentPath = parts.slice(0, -1).join("/");
    const parent = parentPath ? map.get(parentPath) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return { roots, flat };
}

const ResourcesMenu: React.FC<{ readonly ai: V2AiWorkspace }> = ({ ai }) => {
  const s = useStore(ai.store);
  const [ext, setExt] = useState("");
  const [extError, setExtError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const { roots, flat } = buildVaultFolderTree(ai);
  const local = Boolean(ai.env.vaultRootPath);
  const trimmedQ = query.trim().toLowerCase();

  const toggleExpand = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderTree = (nodes: readonly FolderNode[]): React.ReactNode =>
    nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isOpen = expanded.has(node.path) || node.depth === 0;
      const checked = s.resourceFolders.includes(node.path);
      return (
        <div key={node.path}>
          <div className="flex items-center gap-0.5 rounded hover:bg-slate-50" style={{ paddingLeft: `${node.depth * 12}px` }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpand(node.path)}
                className="flex h-5 w-4 shrink-0 items-center justify-center text-slate-400 hover:text-slate-700"
                aria-label={isOpen ? "접기" : "펼치기"}
              >
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            ) : (
              <span className="inline-block w-4 shrink-0" />
            )}
            <button
              type="button"
              data-testid={`v2-res-folder-${node.path}`}
              onClick={() => ai.store.getState().toggleResourceFolder(node.path)}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1.5 text-left"
            >
              <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${checked ? "border-violet-500 bg-violet-500 text-white" : "border-slate-300 bg-white"}`}>
                {checked && <Check className="h-2.5 w-2.5" />}
              </span>
              <Folder className="h-3 w-3 shrink-0 text-amber-500/80" />
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              <span className="shrink-0 text-[10px] text-slate-400">{node.fileCount}</span>
            </button>
          </div>
          {hasChildren && isOpen && renderTree(node.children)}
        </div>
      );
    });

  const filteredFlat = trimmedQ ? flat.filter((n) => n.path.toLowerCase().includes(trimmedQ) || n.name.toLowerCase().includes(trimmedQ)) : [];
  const olPath = activeOutlinePath(ai.env);
  const olPayload = readOutline(ai.env, olPath);
  const outlineSuggestedFolders = useMemo(
    () => (olPath && olPayload ? collectOutlineResources(ai.env.vault, olPath, olPayload.rootNodes, olPayload.nodeEvidence).folders : []),
    [ai.env.vault, olPath, olPayload]
  );

  return (
    <div>
      <Row testId="v2-resources-on" on={s.sourcesOn} onClick={() => ai.store.getState().setSourcesOn(!s.sourcesOn)} label="이 대화에 리소스 쓰기" hint="끄면 마운트를 빼고 자료 도구를 거부한다" />
      {local && s.sourcesOn && outlineSuggestedFolders.length > 0 && (
        <div className="mt-1 rounded border border-sky-200 bg-sky-50/60 p-1.5">
          <p className="mb-1 text-[10.5px] font-semibold text-sky-900">아웃라인 연결 리소스 폴더 (옵트인)</p>
          <div className="flex flex-wrap gap-1">
            {outlineSuggestedFolders.map((fp) => {
              const on = s.resourceFolders.includes(fp);
              return (
                <button
                  key={fp}
                  type="button"
                  data-testid={`v2-res-outline-optin-${fp}`}
                  onClick={() => ai.store.getState().toggleResourceFolder(fp)}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] border ${
                    on ? "border-violet-400 bg-violet-100 text-violet-900" : "border-sky-200 bg-white text-sky-800 hover:bg-sky-100"
                  }`}
                >
                  {on && <Check className="h-2.5 w-2.5" />}
                  <span>{fp}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {s.resourceFolders.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1 px-1">
          {s.resourceFolders.map((f) => (
            <span key={f || "/"} className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[10.5px] text-violet-800 border border-violet-200">
              <span className="max-w-[140px] truncate">{f || "볼트 전체"}</span>
              <button
                type="button"
                onClick={() => ai.store.getState().toggleResourceFolder(f, false)}
                className="hover:text-violet-950"
                aria-label="선택 해제"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="my-1.5 border-t border-slate-100" />
      <div className="mb-1 flex items-center justify-between px-1.5">
        <p className="text-[11px] font-semibold text-slate-500">볼트 폴더 ({flat.length})</p>
      </div>
      {!local && <p className="px-1.5 pb-1 text-[11px] text-amber-600">메모리 볼트라 AI 가 파일을 직접 읽지 못합니다 (로컬 볼트에서만).</p>}
      {local && (
        <>
          <input
            data-testid="v2-res-folder-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="볼트 폴더 검색 (모든 깊이)"
            className="mb-1 w-full rounded border border-slate-200 px-2 py-1 text-[11.5px] outline-none focus:border-violet-400"
          />
          <Row testId="v2-res-vault-root" on={s.resourceFolders.includes("")} onClick={() => ai.store.getState().toggleResourceFolder("")} label="볼트 전체" hint={ai.env.vaultRootPath ?? ""} />
          <div className="max-h-[180px] overflow-y-auto">
            {trimmedQ ? (
              filteredFlat.length > 0 ? (
                filteredFlat.map((n) => (
                  <Row
                    key={n.path}
                    testId={`v2-res-folder-${n.path}`}
                    on={s.resourceFolders.includes(n.path)}
                    onClick={() => ai.store.getState().toggleResourceFolder(n.path)}
                    label={n.name}
                    hint={`${n.path} · 파일 ${n.fileCount}개`}
                  />
                ))
              ) : (
                <p className="px-1.5 py-2 text-[11px] text-slate-400">일치하는 폴더가 없습니다.</p>
              )
            ) : (
              renderTree(roots)
            )}
          </div>
        </>
      )}
      <div className="my-1.5 border-t border-slate-100" />
      <p className="mb-1 px-1.5 text-[11px] font-semibold text-slate-500">외부 폴더 (절대 경로 · 읽기 전용)</p>
      {s.externalFolders.map((p) => (
        <div key={p} className="flex items-center gap-1 px-1.5 py-0.5">
          <FolderOpen className="h-3 w-3 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate text-[11.5px]" title={p}>{p}</span>
          <button type="button" onClick={() => ai.store.getState().removeExternalFolder(p)} className="text-slate-400 hover:text-rose-600" aria-label="빼기">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <form
        className="mt-1 flex items-center gap-1 px-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const clean = ext.trim();
          if (!clean) return;
          if (!/^([a-zA-Z]:[\\/]|\/)/.test(clean)) {
            setExtError("절대 경로를 입력하세요 (예: C:/자료/프로젝트 또는 /Users/...)");
            return;
          }
          setExtError(null);
          ai.store.getState().addExternalFolder(clean);
          setExt("");
        }}
      >
        <input data-testid="v2-res-external-input" value={ext} onChange={(e) => { setExt(e.target.value); if (extError) setExtError(null); }} placeholder="C:/자료/프로젝트" className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-[11.5px] outline-none focus:border-violet-400" />
        <button type="submit" data-testid="v2-res-external-add" className="flex items-center gap-0.5 rounded bg-slate-800 px-2 py-1 text-[11px] text-white hover:bg-slate-700">
          <Plus className="h-3 w-3" />
          추가
        </button>
      </form>
      {extError && <p className="mt-1 px-1.5 text-[10.5px] text-rose-600">{extError}</p>}
    </div>
  );
};

const MODES: Array<{ id: ScopeMode | "off"; label: string; hint: string }> = [
  { id: "selection", label: "선택만", hint: "고른 칸 · 블록만 (캔버스 초점을 따른다)" },
  { id: "page", label: "이 페이지", hint: "보고 있는 페이지만" },
  { id: "document", label: "문서 전체 (빼 둔 페이지 제외)", hint: "문서 전체" },
  { id: "off", label: "문서 끔", hint: "문서를 읽지도 고치지도 않는다" },
];

const ScopeMenu: React.FC<{ readonly ai: V2AiWorkspace; readonly path: string | null; readonly hasDoc: boolean }> = ({ ai, path, hasDoc }) => {
  const s = useStore(ai.store);
  if (!hasDoc || !path) return <p className="px-1.5 py-2 text-slate-400">열린 .vdoc 문서가 없습니다.</p>;
  const setting = s.settingFor(path);
  const current: ScopeMode | "off" = s.scopeOn ? setting.mode : "off";
  return (
    <div>
      {MODES.map((m) => (
        <Row
          key={m.id}
          testId={`v2-scope-${m.id}`}
          on={current === m.id}
          onClick={() => {
            if (m.id === "off") ai.store.getState().setScopeOn(false);
            else {
              ai.store.getState().setScopeOn(true);
              ai.store.getState().setScopeMode(path, m.id);
            }
          }}
          label={m.label}
          hint={m.hint}
        />
      ))}
      {setting.fixed && setting.target && (
        <div className="mt-1 flex items-center justify-between rounded bg-violet-50 px-2 py-1 text-[11px] text-violet-800">
          <span className="truncate">📌 고정: {setting.target.label}</span>
          <button type="button" onClick={() => ai.store.getState().clearPin(path)} className="shrink-0 hover:text-violet-950">
            해제
          </button>
        </div>
      )}
    </div>
  );
};

const OUTLINE_MODES: Array<{ id: OutlineScopeMode | "off"; label: string; hint: string }> = [
  { id: "selection", label: "선택 불릿만", hint: "고른 불릿과 그 하위 노드만 수정 허용" },
  { id: "subtree", label: "현재 서브트리", hint: "현재 집중한 섹션·문서 하위만 수정 허용" },
  { id: "document", label: "아웃라인 전체", hint: "이 .outline 파일 전체 수정 허용" },
  { id: "off", label: "문서 끔", hint: "수정 차단" },
];

const OutlineScopeMenu: React.FC<{ readonly ai: V2AiWorkspace; readonly outlinePath: string }> = ({ ai, outlinePath }) => {
  const s = useStore(ai.store);
  const setting = s.outlineSettingFor(outlinePath);
  const current: OutlineScopeMode | "off" = s.scopeOn ? setting.mode : "off";
  return (
    <div>
      {OUTLINE_MODES.map((m) => (
        <Row
          key={m.id}
          testId={`v2-outline-scope-${m.id}`}
          on={current === m.id}
          onClick={() => {
            if (m.id === "off") ai.store.getState().setScopeOn(false);
            else {
              ai.store.getState().setScopeOn(true);
              ai.store.getState().setOutlineScopeMode(outlinePath, m.id);
            }
          }}
          label={m.label}
          hint={m.hint}
        />
      ))}
      {setting.fixed && setting.rootNodeIds.length > 0 && (
        <div className="mt-1 flex items-center justify-between rounded bg-violet-50 px-2 py-1 text-[11px] text-violet-800">
          <span className="truncate">📌 고정 불릿 {setting.rootNodeIds.length}개</span>
          <button type="button" onClick={() => ai.store.getState().clearOutlinePin(outlinePath)} className="shrink-0 hover:text-violet-950">
            해제
          </button>
        </div>
      )}
    </div>
  );
};
