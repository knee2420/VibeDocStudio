import React from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Eye,
  EyeOff,
  Key,
  Layers,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  X,
  Zap,
} from "lucide-react";

import type { AgentSettingsTransport } from "../contracts/types";
import { useAgentSettings } from "../headless/useAgentSettings";

export interface AgentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transport: AgentSettingsTransport;
}

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  isOpen,
  onClose,
  transport,
}) => {
  const { activeTab, setActiveTab, routing, googleKey, dashboard, isLoading } =
    useAgentSettings({ transport, isOpen });

  const [showKeyText, setShowKeyText] = React.useState(false);

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                에이전트 & LLM 런타임 설정
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-normal">
                  Headless v1.0
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                1순위 실행 엔진(CLI vs Direct API) 및 조항 스캐폴더 모델을 제어합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 bg-white gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("routing")}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "routing"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            1. 실행 엔진 라우팅
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("google")}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "google"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            2. Google API 키 관리
            {googleKey.isConfigured && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("status")}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "status"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            3. 런타임 진단
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 grow">
          {/* Messages */}
          {(routing.error || googleKey.error) && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{routing.error || googleKey.error}</span>
            </div>
          )}
          {(routing.successMessage || googleKey.successMessage) && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{routing.successMessage || googleKey.successMessage}</span>
            </div>
          )}

          {/* TAB 1: 엔진 라우팅 */}
          {activeTab === "routing" && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-900 mb-1">
                  1순위 기본 실행 엔진 (Primary Engine)
                </label>
                <p className="text-[11px] text-slate-500 mb-3">
                  서식 스캐폴딩 및 텍스트 분석 시 우선적으로 호출할 실행 인터페이스를 선택합니다.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {/* CLI Card */}
                  <div
                    onClick={() => routing.selectPrimaryEngine("agy_cli")}
                    className={`p-3.5 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between ${
                      routing.formPolicy.primaryProvider === "agy_cli"
                        ? "border-emerald-600 bg-emerald-50/40 shadow-xs"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-slate-700" />
                          <span className="text-xs font-bold text-slate-900">
                            Antigravity CLI
                          </span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                          기본 권장
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        로컬 <code>agy</code> CLI 서브프로세스를 통해 에이전트 런타임 및 계정 쿼터를 사용합니다.
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">실행 상태:</span>
                      <span
                        className={`font-semibold ${
                          routing.cliAvailable ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {routing.cliAvailable ? "CLI 감지됨" : "CLI 미발견"}
                      </span>
                    </div>
                  </div>

                  {/* Direct API Card */}
                  <div
                    onClick={() => routing.selectPrimaryEngine("google_api")}
                    className={`p-3.5 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between ${
                      routing.formPolicy.primaryProvider === "google_api"
                        ? "border-emerald-600 bg-emerald-50/40 shadow-xs"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-indigo-600" />
                          <span className="text-xs font-bold text-slate-900">
                            Google Direct API
                          </span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                          초고속
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        CLI 프로세스 없이 Google REST API로 직접 통신합니다. (API 키 등록 필요)
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">인증 상태:</span>
                      <span
                        className={`font-semibold ${
                          routing.googleConfigured
                            ? "text-emerald-600"
                            : "text-amber-600"
                        }`}
                      >
                        {routing.googleConfigured ? "API 키 완료" : "키 등록 필요"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Model & Timeout Selection */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-900 mb-1">
                    주력 모델 (Primary Model)
                  </label>
                  <select
                    value={routing.formPolicy.primaryModel}
                    onChange={(e) => routing.updatePrimaryModel(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {routing.modelsForPrimary.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.recommended ? "★ (추천)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-900 mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    타임아웃 (초)
                  </label>
                  <input
                    type="number"
                    value={routing.formPolicy.primaryTimeoutSeconds}
                    onChange={(e) =>
                      routing.updatePrimaryTimeout(Number(e.target.value) || 180)
                    }
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Fallback Settings */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-800">
                    자동 Fallback (장애 복구 보조 엔진)
                  </div>
                  <span className="text-[10px] text-slate-500">
                    1순위 실패 시 자동 전환
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">
                      보조 모델
                    </span>
                    <select
                      value={routing.formPolicy.fallbackModel}
                      onChange={(e) => routing.updateFallbackModel(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                    >
                      {routing.modelsForFallback.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">
                      보조 타임아웃 (초)
                    </span>
                    <input
                      type="number"
                      value={routing.formPolicy.fallbackTimeoutSeconds}
                      onChange={(e) =>
                        routing.updateFallbackTimeout(
                          Number(e.target.value) || 180
                        )
                      }
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Google API 키 */}
          {activeTab === "google" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-900 mb-1">
                  Google Gemini Direct API 키
                </label>
                <p className="text-[11px] text-slate-500 mb-3">
                  Google AI Studio에서 발급받은 API 키를 등록합니다. OS 자격증명 저장소(Keyring)에만 안전하게 보관됩니다.
                </p>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKeyText ? "text" : "password"}
                      value={googleKey.apiKeyInput}
                      onChange={(e) => googleKey.setApiKeyInput(e.target.value)}
                      placeholder={
                        googleKey.isConfigured
                          ? "●●●●●●●●●●●●●●●● (등록됨)"
                          : "AIzaSy..."
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeyText((v) => !v)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showKeyText ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={googleKey.saveApiKey}
                    disabled={googleKey.isSaving || !googleKey.apiKeyInput.trim()}
                    className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50 transition"
                  >
                    {googleKey.isSaving ? "저장 중..." : "키 저장"}
                  </button>

                  {googleKey.isConfigured && (
                    <button
                      type="button"
                      onClick={googleKey.removeApiKey}
                      disabled={googleKey.isSaving}
                      className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-medium transition"
                      title="키 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-600">현재 키 상태:</span>
                <span
                  className={`font-semibold flex items-center gap-1 ${
                    googleKey.isConfigured
                      ? "text-emerald-700"
                      : "text-slate-500"
                  }`}
                >
                  {googleKey.isConfigured ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      정상 등록됨
                    </>
                  ) : (
                    "미등록 (CLI 엔진 우선 사용)"
                  )}
                </span>
              </div>
            </div>
          )}

          {/* TAB 3: 런타임 진단 */}
          {activeTab === "status" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">
                  엔진 및 모델 라인업 진단
                </span>
                <button
                  type="button"
                  onClick={() => routing.reload()}
                  disabled={isLoading}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`}
                  />
                  상태 새로고침
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px]">
                    <tr>
                      <th className="py-2 px-3">모델명</th>
                      <th className="py-2 px-3">공급자</th>
                      <th className="py-2 px-3">역할 / 설명</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(dashboard?.models || []).map((m) => (
                      <tr key={`${m.provider}-${m.id}`} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {m.name}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px]">
                            {m.provider}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">
                          {m.description || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-100 shrink-0">
          <div className="text-[11px] text-slate-400">
            설정 변경 시 백엔드 런타임 정책에 즉시 동기화됩니다.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-white transition"
            >
              닫기
            </button>
            {activeTab === "routing" && (
              <button
                type="button"
                onClick={routing.savePolicy}
                disabled={routing.isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
              >
                {routing.isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    정책 저장
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

