import React, { useState } from "react";
import { Download, FileJson, Sparkles, Upload, X } from "lucide-react";
import { useKnowledgeDeckStore } from "@/entities/knowledge-deck";

interface ImportDeckModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ImportDeckModal: React.FC<ImportDeckModalProps> = ({ projectId, isOpen, onClose }) => {
  const importDeck = useKnowledgeDeckStore((s) => s.importDeck);
  const [jsonText, setJsonText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setJsonText(text);
        setErrorMsg(null);
      } catch (err) {
        setErrorMsg("파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonText.trim()) {
      setErrorMsg("지식 덱 JSON 데이터를 입력하거나 파일을 업로드해주세요.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const parsed = JSON.parse(jsonText.trim());
      const res = await importDeck(projectId, parsed);
      if (res) {
        setJsonText("");
        onClose();
      } else {
        setErrorMsg("지식 덱 임포트에 실패했습니다. 형식을 확인해주세요.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "올바른 JSON 형식이 아닙니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 프리셋 샘플 지식 덱 주입
  const handleLoadSample = (sampleType: "form_standard" | "whitepaper") => {
    const sample =
      sampleType === "form_standard"
        ? {
            title: "사내 공통 서식 표준 지식 덱 (Standard)",
            description: "사내 결재문서, 기안서, 품의서 등 30개 핵심 표준 양식 구조화 인덱스",
            tags: ["공통표준", "서식가이드", "결재규정"],
            status: "ready",
            progress: 100,
            stat: { topicsCount: 28, tablesCount: 14, chunksCount: 42, filesCount: 6 },
            topics: [
              {
                id: "topic_1",
                title: "1. 기안문 작성 원칙 및 결재선 규정",
                level: 1,
                snippet: "기안자는 결재 권한 규정에 따라 전결권자를 지정해야 하며...",
                children: [
                  { id: "topic_1_1", title: "1.1 전결권자 지정 기준표", level: 2, snippet: "부서장 전결: 1천만원 이하..." },
                  { id: "topic_1_2", title: "1.2 필수 첨부 서식 양식", level: 2, snippet: "견적서 원본, 비교견적서 2부..." },
                ],
              },
              {
                id: "topic_2",
                title: "2. 품의서 및 지출결의서 작성 표준",
                level: 1,
                snippet: "법인카드 및 현금성 경비 집행 시 준수해야 하는 계정과목 분류...",
              },
            ],
          }
        : {
            title: "2026 디지털 문서 플랫폼 백서 지식 덱",
            description: "글로벌 문서 표준화 및 컴포넌트 캔버스 아키텍처 기술 사양",
            tags: ["기술백서", "캔버스엔진", "도메인중립"],
            status: "ready",
            progress: 100,
            stat: { topicsCount: 35, tablesCount: 19, chunksCount: 60, filesCount: 4 },
            topics: [
              {
                id: "wp_1",
                title: "제1장. 블록 기반 슬롯 캔버스 렌더링 파이프라인",
                level: 1,
                snippet: "Tiptap 리치텍스트와 CSS Grid 슬롯 간의 양방향 앵커 바인딩 프로토콜...",
              },
              {
                id: "wp_2",
                title: "제2장. 오토-인덱싱 RAG와 다차원 메타데이터",
                level: 1,
                snippet: "단순 벡터 검색의 한계를 극복하는 계층형 목차 및 도표 시각화 추적 체계...",
              },
            ],
          };

    setJsonText(JSON.stringify(sample, null, 2));
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
        {/* 모달 헤더 */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-violet-600" />
            <h3 className="text-sm font-bold text-slate-800">지식 덱 가져오기 (Import Deck)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 폼 본문 */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <p className="text-xs text-slate-600">
            외부에서 사전 구축된 구조화 지식 덱 파일(<code>.deck.json</code>)을 업로드하거나 JSON 데이터를 직접 붙여넣으세요.
          </p>

          {/* 파일 업로드 버튼 */}
          <div className="flex items-center gap-2">
            <label className="flex-1 border-2 border-dashed border-slate-300 hover:border-violet-400 rounded-lg p-3 text-center cursor-pointer transition bg-slate-50/50 hover:bg-violet-50/30 flex items-center justify-center gap-2 text-xs font-semibold text-slate-700">
              <Upload className="w-4 h-4 text-violet-600" />
              <span>.deck.json 파일 선택</span>
              <input type="file" accept=".json,.deck.json" onChange={handleFileChange} className="hidden" />
            </label>

            {/* 빠른 프리셋 샘플 불러오기 */}
            <button
              type="button"
              onClick={() => handleLoadSample("form_standard")}
              className="px-2.5 py-3 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer flex items-center gap-1 shrink-0"
              title="사내 공통 서식 표준 지식 덱 샘플 로드"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>서식 표준 덱</span>
            </button>
            <button
              type="button"
              onClick={() => handleLoadSample("whitepaper")}
              className="px-2.5 py-3 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer flex items-center gap-1 shrink-0"
              title="디지털 문서 플랫폼 백서 덱 샘플 로드"
            >
              <FileJson className="w-3.5 h-3.5 text-blue-500" />
              <span>백서 덱</span>
            </button>
          </div>

          {/* JSON 텍스트에어리어 */}
          <div>
            <textarea
              rows={8}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder="또는 지식 덱 JSON 데이터를 여기에 붙여넣으세요..."
              className="w-full text-xs font-mono p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-slate-50/40 resize-none"
            />
          </div>

          {errorMsg && (
            <div className="p-2 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              {errorMsg}
            </div>
          )}

          {/* 모달 푸터 */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !jsonText.trim()}
              className="px-4 py-1.5 rounded-md text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white cursor-pointer disabled:opacity-50 transition shadow-xs"
            >
              {isSubmitting ? "가져오는 중..." : "지식 덱에 등록하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

