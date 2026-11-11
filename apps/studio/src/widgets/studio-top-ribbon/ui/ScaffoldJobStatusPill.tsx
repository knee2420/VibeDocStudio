import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Square, X } from "lucide-react";

import { usePdfScaffoldJobStore } from "@/entities/scaffold-job";

/**
 * 상단 리본에 비동기 PDF 스캐폴딩 진행 상태와 개별 페이지 대기·완료·중단 팝오버를 표시한다.
 * 자체 스토어만 구독하므로 리본 전체가 불필요하게 다시 그려지지 않는다.
 */
export const ScaffoldJobStatusPill: React.FC = () => {
  const jobs = usePdfScaffoldJobStore((s) => s.jobs);
  const cancelJob = usePdfScaffoldJobStore((s) => s.cancelJob);
  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const popRef = useRef<HTMLDivElement>(null);

  const visibleJobs = Object.values(jobs)
    .filter((j) => j.status === "queued" || j.status === "running" || !dismissedIds.includes(j.jobId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (visibleJobs.length === 0) return null;

  const runningJobs = visibleJobs.filter((j) => j.status === "queued" || j.status === "running");
  const primary = runningJobs[0] ?? visibleJobs[0];
  const isBusy = runningJobs.length > 0;
  const hasError = !isBusy && visibleJobs.some((j) => j.status === "failed");

  return (
    <div ref={popRef} className="relative">
      <button
        type="button"
        data-testid="scaffold-jobs-pill"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold cursor-pointer transition font-mono tabular-nums ${
          isBusy
            ? "bg-emerald-950/90 text-emerald-200 border-emerald-500/60 hover:bg-emerald-900"
            : hasError
              ? "bg-amber-950/80 text-amber-200 border-amber-500/60 hover:bg-amber-900"
              : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
        }`}
        title="비동기 PDF 페이지 변환 작업 현황"
      >
        {isBusy ? (
          <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
        ) : hasError ? (
          <AlertTriangle className="w-3 h-3 text-amber-400" />
        ) : (
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        )}
        <span>
          PDF {primary.completedCount}/{primary.totalCount}p
          {isBusy && primary.currentPageNumber ? ` · ${primary.currentPageNumber}p` : ""}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 rounded-xl border border-slate-200 bg-white text-slate-800 shadow-2xl z-50 overflow-hidden">
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900">PDF 비동기 변환 작업</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {visibleJobs.map((job) => {
              const jobBusy = job.status === "queued" || job.status === "running";
              return (
                <div key={job.jobId} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">{job.title}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {job.fidelityMode} 모드 · {job.completedCount}/{job.totalCount} 완료
                      </div>
                    </div>
                    {jobBusy ? (
                      <button
                        type="button"
                        onClick={() => void cancelJob(job.jobId)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-semibold cursor-pointer shrink-0"
                      >
                        <Square className="w-2.5 h-2.5 fill-current" />
                        중단
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDismissedIds((prev) => [...prev, job.jobId])}
                        className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
                      >
                        숨기기
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    {job.pages.map((p) => (
                      <div
                        key={p.pageNumber}
                        className="flex items-center justify-between gap-2 text-[11px] bg-slate-50 rounded px-2 py-1"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {p.status === "running" && (
                            <Loader2 className="w-3 h-3 animate-spin text-emerald-600 shrink-0" />
                          )}
                          {p.status === "queued" && <Clock className="w-3 h-3 text-slate-400 shrink-0" />}
                          {p.status === "completed" && (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          )}
                          {(p.status === "failed" || p.status === "cancelled") && (
                            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                          <span className="font-mono font-semibold text-slate-700">{p.pageNumber}p</span>
                          <span className="truncate text-slate-500">{p.message || p.status}</span>
                        </div>
                        {p.iter > 0 && (
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">iter {p.iter}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

