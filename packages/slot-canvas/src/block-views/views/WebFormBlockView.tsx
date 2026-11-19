import { useState } from "react";
import { Check, Circle, ListChecks, Square } from "lucide-react";

import type { WebFormBlockDef, WebFormFieldDef } from "@vibe/vdoc-schema";

import { defineBlockView } from "../contract";

/**
 * 웹 설문 폼 뷰 — 4종 웹 UI 스타일(구글 폼 카드 / Tally 미니멀 / 칩 버튼 그리드 / 스텝 좌측 액센트)을
 * 인터랙티브 라디오·체크박스·입력 필드로 렌더링한다.
 */
export const webFormView = defineBlockView<WebFormBlockDef>({
  kinds: ["web-form"],
  View: ({ block, ctx }) => {
    const [singleAnswers, setSingleAnswers] = useState<Record<string, string>>({});
    const [multiAnswers, setMultiAnswers] = useState<Record<string, string[]>>({});
    const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});

    const toggleMultiOption = (fieldId: string, option: string) => {
      setMultiAnswers((prev) => {
        const cur = prev[fieldId] ?? [];
        const next = cur.includes(option) ? cur.filter((x) => x !== option) : [...cur, option];
        return { ...prev, [fieldId]: next };
      });
    };

    const renderInputValue = (key: string, defaultValue?: string) => textAnswers[key] ?? defaultValue ?? "";
    const setInputValue = (key: string, next: string) =>
      setTextAnswers((prev) => ({ ...prev, [key]: next }));

    const kvFields = block.fields.filter((f) => f.inputKind === "info-kv");
    const questionFields = block.fields.filter((f) => f.inputKind !== "info-kv");
    const variant = block.variant;

    const headerSlot = block.headerSlotId
      ? ctx.renderSlot(block.headerSlotId, {
          className:
            variant === "webform-minimal-tally"
              ? "text-[17px] font-bold text-slate-900 tracking-tight"
              : "text-[15.5px] font-bold text-slate-900 tracking-tight",
        })
      : null;

    if (variant === "webform-minimal-tally") {
      return (
        <div className="space-y-4 py-1 font-sans">
          {(headerSlot || block.badge) && (
            <div className="border-b border-slate-200 pb-2.5 space-y-1">
              {block.badge && (
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {block.badge}
                </span>
              )}
              {headerSlot}
            </div>
          )}

          {kvFields.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {kvFields.map((f) => (
                <div
                  key={f.fieldId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-[12px] text-slate-700"
                >
                  <span className="font-semibold text-slate-500">{f.label}:</span>
                  <span className="font-medium text-slate-900">{f.value || "-"}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-4">
            {questionFields.map((field) => (
              <div key={field.fieldId} className="space-y-1.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[13.5px] font-semibold text-slate-900">{field.label}</span>
                  {field.required && <span className="text-rose-500 text-xs font-bold">*</span>}
                  {field.helperText && (
                    <span className="text-[11.5px] text-slate-400">{field.helperText}</span>
                  )}
                </div>

                {field.inputKind === "multi-input" && field.subFields ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {field.subFields.map((sf) => {
                      const key = `${field.fieldId}:${sf.id}`;
                      return (
                        <div key={sf.id} className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-500">
                            {sf.label}
                          </label>
                          <input
                            type="text"
                            value={renderInputValue(key, sf.value)}
                            onChange={(e) => setInputValue(key, e.target.value)}
                            placeholder={sf.placeholder ?? `${sf.label} 입력`}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-100/80 border border-transparent text-[13px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-slate-300 focus:outline-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : field.inputKind === "single-choice" || field.inputKind === "multi-choice" ? (
                  <div className="flex flex-col gap-1.5">
                    {(field.options ?? []).map((opt) => {
                      const isMulti = field.inputKind === "multi-choice";
                      const active = isMulti
                        ? (multiAnswers[field.fieldId] ?? []).includes(opt)
                        : singleAnswers[field.fieldId] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            isMulti
                              ? toggleMultiOption(field.fieldId, opt)
                              : setSingleAnswers((p) => ({ ...p, [field.fieldId]: opt }))
                          }
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] text-left border transition cursor-pointer ${
                            active
                              ? "bg-slate-900 text-white border-slate-900 font-medium"
                              : "bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100"
                          }`}
                        >
                          {isMulti ? (
                            <span
                              className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                                active ? "bg-white text-slate-900 border-white" : "border-slate-400"
                              }`}
                            >
                              {active && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </span>
                          ) : (
                            <span
                              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${
                                active ? "border-white" : "border-slate-400"
                              }`}
                            >
                              {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                          )}
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={renderInputValue(field.fieldId, field.value)}
                    onChange={(e) => setInputValue(field.fieldId, e.target.value)}
                    placeholder={field.placeholder ?? "답변을 입력해 주세요"}
                    className="w-full px-3 py-2 rounded-lg bg-slate-100/80 border border-transparent text-[13px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-slate-300 focus:outline-none"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (variant === "webform-pill-chips") {
      return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3.5 font-sans">
          {(headerSlot || block.badge) && (
            <div className="flex items-center justify-between gap-2 pb-1">
              <div className="min-w-0 flex-1">{headerSlot}</div>
              {block.badge && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10.5px] font-bold shrink-0">
                  {block.badge}
                </span>
              )}
            </div>
          )}

          {kvFields.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {kvFields.map((f) => (
                <div
                  key={f.fieldId}
                  className="rounded-xl bg-white border border-slate-200/90 px-3 py-2"
                >
                  <div className="text-[10.5px] font-semibold text-slate-400">{f.label}</div>
                  <div className="text-[12.5px] font-semibold text-slate-800 mt-0.5">
                    {f.value || "-"}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {questionFields.map((field) => (
              <div
                key={field.fieldId}
                className="rounded-xl bg-white border border-slate-200 p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-slate-900">{field.label}</span>
                    {field.required && <span className="text-indigo-600 text-xs font-bold">*</span>}
                  </div>
                  {(field.inputKind === "single-choice" || field.inputKind === "multi-choice") && (
                    <span className="text-[10px] font-semibold text-slate-400">
                      {field.inputKind === "multi-choice" ? "복수 선택" : "1개 선택"}
                    </span>
                  )}
                </div>

                {field.inputKind === "multi-input" && field.subFields ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {field.subFields.map((sf) => {
                      const key = `${field.fieldId}:${sf.id}`;
                      return (
                        <div
                          key={sf.id}
                          className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 focus-within:border-indigo-500 focus-within:bg-white transition"
                        >
                          <div className="text-[10px] font-bold text-slate-400">{sf.label}</div>
                          <input
                            type="text"
                            value={renderInputValue(key, sf.value)}
                            onChange={(e) => setInputValue(key, e.target.value)}
                            placeholder={sf.placeholder ?? "입력"}
                            className="w-full bg-transparent text-[12.5px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none mt-0.5"
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : field.inputKind === "single-choice" || field.inputKind === "multi-choice" ? (
                  <div
                    className={`grid gap-2 ${
                      (field.options?.length ?? 0) >= 4
                        ? "grid-cols-2"
                        : "grid-cols-1 sm:grid-cols-3"
                    }`}
                  >
                    {(field.options ?? []).map((opt) => {
                      const isMulti = field.inputKind === "multi-choice";
                      const active = isMulti
                        ? (multiAnswers[field.fieldId] ?? []).includes(opt)
                        : singleAnswers[field.fieldId] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            isMulti
                              ? toggleMultiOption(field.fieldId, opt)
                              : setSingleAnswers((p) => ({ ...p, [field.fieldId]: opt }))
                          }
                          className={`rounded-lg border px-3 py-2 text-[12.5px] text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                            active
                              ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-semibold ring-1 ring-indigo-600/30"
                              : "border-slate-200 bg-slate-50/60 text-slate-700 hover:border-slate-300 hover:bg-slate-100/70"
                          }`}
                        >
                          <span className="leading-snug">{opt}</span>
                          {active && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={renderInputValue(field.fieldId, field.value)}
                    onChange={(e) => setInputValue(field.fieldId, e.target.value)}
                    placeholder={field.placeholder ?? "자유롭게 입력해 주세요"}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (variant === "webform-step-accent") {
      return (
        <div className="rounded-r-xl rounded-l-sm border border-slate-200 border-l-4 border-l-indigo-600 bg-white overflow-hidden font-sans shadow-2xs">
          {(headerSlot || block.badge) && (
            <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {block.badge && (
                  <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold tracking-wide shrink-0">
                    {block.badge}
                  </span>
                )}
                <div className="min-w-0 flex-1">{headerSlot}</div>
              </div>
              <ListChecks className="w-4 h-4 text-indigo-500 shrink-0" />
            </div>
          )}

          {kvFields.length > 0 && (
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-b border-slate-200">
              {kvFields.map((f) => (
                <div key={f.fieldId} className="px-4 py-2.5 flex items-baseline gap-2">
                  <span className="text-[11px] font-bold text-slate-500 shrink-0">{f.label}</span>
                  <span className="text-[12.5px] text-slate-900 font-medium">{f.value || "-"}</span>
                </div>
              ))}
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {questionFields.map((field) => (
              <div
                key={field.fieldId}
                className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-2 sm:gap-4 items-start"
              >
                <div className="pt-0.5">
                  <div className="text-[12.5px] font-bold text-slate-800 leading-snug">
                    {field.label}
                    {field.required && <span className="text-rose-500 ml-1">*</span>}
                  </div>
                  {field.helperText && (
                    <div className="text-[11px] text-slate-400 mt-0.5">{field.helperText}</div>
                  )}
                </div>

                <div>
                  {field.inputKind === "multi-input" && field.subFields ? (
                    <div className="flex flex-wrap gap-2">
                      {field.subFields.map((sf) => {
                        const key = `${field.fieldId}:${sf.id}`;
                        return (
                          <label
                            key={sf.id}
                            className="flex-1 min-w-[110px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50/50 focus-within:border-indigo-500 focus-within:bg-white"
                          >
                            <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                              {sf.label}
                            </span>
                            <input
                              type="text"
                              value={renderInputValue(key, sf.value)}
                              onChange={(e) => setInputValue(key, e.target.value)}
                              placeholder={sf.placeholder ?? "입력"}
                              className="w-full min-w-0 bg-transparent text-[12.5px] text-slate-900 focus:outline-none"
                            />
                          </label>
                        );
                      })}
                    </div>
                  ) : field.inputKind === "single-choice" || field.inputKind === "multi-choice" ? (
                    <div className="flex flex-wrap gap-2">
                      {(field.options ?? []).map((opt) => {
                        const isMulti = field.inputKind === "multi-choice";
                        const active = isMulti
                          ? (multiAnswers[field.fieldId] ?? []).includes(opt)
                          : singleAnswers[field.fieldId] === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              isMulti
                                ? toggleMultiOption(field.fieldId, opt)
                                : setSingleAnswers((p) => ({ ...p, [field.fieldId]: opt }))
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px] transition cursor-pointer ${
                              active
                                ? "border-indigo-600 bg-indigo-600 text-white font-semibold"
                                : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300"
                            }`}
                          >
                            {isMulti ? (
                              <Square className="w-3 h-3 shrink-0" />
                            ) : (
                              <Circle className="w-3 h-3 shrink-0" />
                            )}
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={renderInputValue(field.fieldId, field.value)}
                      onChange={(e) => setInputValue(field.fieldId, e.target.value)}
                      placeholder={field.placeholder ?? "내용을 입력해 주세요"}
                      className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50/40 text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Default: "webform-card-google" — 구글 폼 카드형
    return (
      <div className="space-y-2.5 font-sans">
        {(headerSlot || kvFields.length > 0) && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="h-1.5 bg-indigo-600" />
            <div className="p-3.5 space-y-2.5">
              {(headerSlot || block.badge) && (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">{headerSlot}</div>
                  {block.badge && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold shrink-0">
                      {block.badge}
                    </span>
                  )}
                </div>
              )}
              {kvFields.length > 0 && (
                <div className={`grid grid-cols-2 gap-2 ${headerSlot ? "pt-1 border-t border-slate-100" : ""}`}>
                  {kvFields.map((f) => (
                    <div key={f.fieldId} className="text-[12px]">
                      <span className="font-semibold text-slate-500">{f.label}: </span>
                      <span className="text-slate-800">{f.value || "-"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {questionFields.map((field: WebFormFieldDef) => (
          <div
            key={field.fieldId}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-2xs space-y-2.5"
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13.5px] font-semibold text-slate-900">{field.label}</span>
              {field.required && <span className="text-rose-600 text-xs font-bold">*</span>}
              {field.helperText && (
                <span className="text-[11px] text-slate-400">({field.helperText})</span>
              )}
            </div>

            {field.inputKind === "multi-input" && field.subFields ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-0.5">
                {field.subFields.map((sf) => {
                  const key = `${field.fieldId}:${sf.id}`;
                  return (
                    <div key={sf.id} className="space-y-0.5">
                      <div className="text-[11px] font-medium text-slate-500">{sf.label}</div>
                      <input
                        type="text"
                        value={renderInputValue(key, sf.value)}
                        onChange={(e) => setInputValue(key, e.target.value)}
                        placeholder={sf.placeholder ?? "단답형 텍스트"}
                        className="w-full border-b border-slate-300 pb-1 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                  );
                })}
              </div>
            ) : field.inputKind === "single-choice" || field.inputKind === "multi-choice" ? (
              <div className="space-y-1.5">
                {(field.options ?? []).map((opt) => {
                  const isMulti = field.inputKind === "multi-choice";
                  const active = isMulti
                    ? (multiAnswers[field.fieldId] ?? []).includes(opt)
                    : singleAnswers[field.fieldId] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        isMulti
                          ? toggleMultiOption(field.fieldId, opt)
                          : setSingleAnswers((p) => ({ ...p, [field.fieldId]: opt }))
                      }
                      className="w-full flex items-center gap-2.5 py-1 text-left group cursor-pointer"
                    >
                      {isMulti ? (
                        <span
                          className={`w-4 h-4 rounded-[3px] border flex items-center justify-center shrink-0 transition ${
                            active
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "border-slate-400 group-hover:border-indigo-500"
                          }`}
                        >
                          {active && <Check className="w-3 h-3 stroke-[3]" />}
                        </span>
                      ) : (
                        <span
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                            active
                              ? "border-indigo-600"
                              : "border-slate-400 group-hover:border-indigo-500"
                          }`}
                        >
                          {active && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
                        </span>
                      )}
                      <span
                        className={`text-[13px] ${
                          active ? "text-slate-900 font-medium" : "text-slate-700"
                        }`}
                      >
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                type="text"
                value={renderInputValue(field.fieldId, field.value)}
                onChange={(e) => setInputValue(field.fieldId, e.target.value)}
                placeholder={field.placeholder ?? "단답형 텍스트"}
                className="w-full sm:w-4/5 border-b border-slate-300 pb-1 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
              />
            )}
          </div>
        ))}
      </div>
    );
  },
});
