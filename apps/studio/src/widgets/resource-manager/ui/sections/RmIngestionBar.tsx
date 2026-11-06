import React, { useState } from "react";
import { FolderDown, Globe, Loader2, Plus, Sparkles } from "lucide-react";
import { useResourceStore } from "@/entities/resource";
import { useKnowledgeDeckStore } from "@/entities/knowledge-deck";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";

export const RmIngestionBar: React.FC = () => {
  const activeProject = useProjectStore(selectActiveProject);
  const projectId = activeProject?.projectId || "default_project";

  const ingestDirectory = useResourceStore((s) => s.ingestDirectory);
  const ingestWebUrl = useResourceStore((s) => s.ingestWebUrl);
  const isLoading = useResourceStore((s) => s.isLoading);
  const promoteToDeck = useKnowledgeDeckStore((s) => s.promoteToDeck);

  const [dirInputOpen, setDirInputOpen] = useState(false);
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const [dirPath, setDirPath] = useState("");
  const [url, setUrl] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [autoIndexToDeck, setAutoIndexToDeck] = useState(false);

  const handleIngestDir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirPath.trim()) return;
    const targetPath = dirPath.trim();
    await ingestDirectory(projectId, targetPath);

    if (autoIndexToDeck) {
      const folderName = targetPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "폴더 지식 덱";
      await promoteToDeck(projectId, { title: `${folderName} 지식 덱`, sourcePaths: [targetPath], tags: ["폴더덤핑"] });
    }

    setDirPath("");
    setDirInputOpen(false);
    setAutoIndexToDeck(false);
  };

  const handleIngestUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    const targetUrl = url.trim();
    const title = urlTitle.trim() || undefined;
    await ingestWebUrl(projectId, targetUrl, title);

    if (autoIndexToDeck) {
      await promoteToDeck(projectId, { title: `${title || "웹 아티클"} 지식 덱`, sourcePaths: [targetUrl], tags: ["웹URL"] });
    }

    setUrl("");
    setUrlTitle("");
    setUrlInputOpen(false);
    setAutoIndexToDeck(false);
  };

  return (
    <div className="p-2 border-b border-slate-200 bg-white space-y-2 shrink-0">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setDirInputOpen((v) => !v);
            setUrlInputOpen(false);
          }}
          className={`flex-1 px-2 py-1 rounded-md border text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-1.5 ${
            dirInputOpen
              ? "bg-violet-50 text-violet-800 border-violet-300"
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300"
          }`}
          title="로컬 폴더 경로를 입력하여 수십~수백 개 파일을 뭉탱이로 덤핑"
        >
          <FolderDown className="w-3.5 h-3.5 text-violet-600" />
          <span>폴더 덤핑</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setUrlInputOpen((v) => !v);
            setDirInputOpen(false);
          }}
          className={`flex-1 px-2 py-1 rounded-md border text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-1.5 ${
            urlInputOpen
              ? "bg-blue-50 text-blue-800 border-blue-300"
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300"
          }`}
          title="외부 웹페이지 링크를 아티클로 등록"
        >
          <Globe className="w-3.5 h-3.5 text-blue-600" />
          <span>웹 URL</span>
        </button>
      </div>

      {dirInputOpen && (
        <form onSubmit={handleIngestDir} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
          <label className="text-[11px] font-bold text-slate-700 block">로컬 폴더 절대 경로</label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={dirPath}
              onChange={(e) => setDirPath(e.target.value)}
              placeholder="예: C:\자료\레퍼런스_문서"
              className="flex-1 px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-violet-500 font-mono"
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || !dirPath.trim()}
              className="px-2.5 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-xs font-bold disabled:opacity-50 flex items-center gap-1 cursor-pointer"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              추가
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={autoIndexToDeck}
              onChange={(e) => setAutoIndexToDeck(e.target.checked)}
              className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 w-3 h-3"
            />
            <Sparkles className="w-3 h-3 text-amber-500 fill-amber-200" />
            <span>Knowledge Deck(구조화 지식 덱)에도 즉시 색인 등록</span>
          </label>
        </form>
      )}

      {urlInputOpen && (
        <form onSubmit={handleIngestUrl} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
          <label className="text-[11px] font-bold text-slate-700 block">웹 아티클 URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-blue-500 font-mono"
            autoFocus
          />
          <div className="flex gap-1.5">
            <input
              type="text"
              value={urlTitle}
              onChange={(e) => setUrlTitle(e.target.value)}
              placeholder="제목 (선택사항)"
              className="flex-1 px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-blue-500"
            />
            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold disabled:opacity-50 flex items-center gap-1 cursor-pointer"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              추가
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={autoIndexToDeck}
              onChange={(e) => setAutoIndexToDeck(e.target.checked)}
              className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 w-3 h-3"
            />
            <Sparkles className="w-3 h-3 text-amber-500 fill-amber-200" />
            <span>Knowledge Deck(구조화 지식 덱)에도 즉시 색인 등록</span>
          </label>
        </form>
      )}
    </div>
  );
};
