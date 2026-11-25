import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Copy, Diamond, RotateCcw, Sparkles, X } from "lucide-react";

import {
  ASSET_VARIANT_LABEL,
  availableVariants,
  buildAssetVariant,
  exposedPropertiesFor,
  readPropertyValues,
  type AssetPropertyDef,
  type AssetPropertyValues,
  type AssetSource,
  type AssetVariantId,
} from "@/entities/asset-library";

import { AssetPreview, defaultPreviewVariant } from "./AssetPreview";
import { insertButtonClass } from "./insertAssetVariant";

export interface AssetDetailPopoverProps {
  source: AssetSource;
  name: string;
  description: string;
  /** 세부 정보 아래 줄 — 이 에셋이 들어 있는 라이브러리 이름. */
  libraryLabel: string;
  /** 이름 아래 한 줄 (예: "3개 블록 · 7개 슬롯"). */
  meta?: string;
  /** 넣을 곳이 없으면 버튼을 막는다. */
  canInsert: boolean;
  /** 버튼 글자의 동사 (에셋은 "삽입", 템플릿 페이지는 "페이지로 추가"). */
  insertVerb?: string;
  /** 페이지 템플릿처럼 큰 단위는 속성을 보이지 않고, 미리보기는 페이지 위쪽부터 폭에 맞춘다. */
  kind?: "asset" | "page";
  /** 사이드바 오른쪽 가장자리 · 카드 위치. */
  anchor: { top: number; left: number };
  onClose: () => void;
  /** 고른 방법 · 속성 값으로 넣는다. 성공하면 true. */
  onInsert: (variant: AssetVariantId, properties: AssetPropertyValues) => boolean;
}

const VARIANT_ICON: Partial<Record<AssetVariantId, React.ReactNode>> = {
  original: <Copy className="w-3.5 h-3.5" />,
  sample: <Sparkles className="w-3.5 h-3.5" />,
};

const VARIANT_HINT: Partial<Record<AssetVariantId, string>> = {
  original: "만든 사람이 넣어 둔 글자 · 이미지를 그대로 복사해 넣습니다.",
  sample: "같은 구조에 더미 문구 · 더미 이미지를 채워 넣습니다. 넣은 뒤 고쳐 쓰세요.",
};

/**
 * 에셋 세부 정보 (피그마 에셋 "세부 정보"와 같은 배치):
 * 큰 미리보기 → 이름 · 설명 → 넣기 (원본 그대로 / 더미 데이터) → 속성.
 * 속성은 만든 사람이 노출한 인스펙터 값이고, 고르는 대로 미리보기와 넣을 내용에 반영된다.
 */
export const AssetDetailPopover: React.FC<AssetDetailPopoverProps> = ({
  source,
  name,
  description,
  libraryLabel,
  meta,
  canInsert,
  insertVerb = "삽입",
  kind = "asset",
  anchor,
  onClose,
  onInsert,
}) => {
  const variants = availableVariants(source);
  const [preview, setPreview] = useState<AssetVariantId>(() => defaultPreviewVariant(source));
  const defs = useMemo(() => (kind === "page" ? [] : exposedPropertiesFor(source)), [source, kind]);
  const firstVariant = variants[0];
  const initialValues = useMemo(
    () => readPropertyValues(buildAssetVariant(source, firstVariant) ?? [], defs),
    [source, firstVariant, defs],
  );
  const [values, setValues] = useState<AssetPropertyValues>(initialValues);
  const changed = defs.some((d) => values[d.id] !== initialValues[d.id]);

  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchor.top);

  // 화면 아래로 넘치지 않게 위로 당긴다 (높이를 잰 뒤).
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    setTop(Math.max(48, Math.min(anchor.top, window.innerHeight - h - 12)));
  }, [anchor.top, preview, defs.length]);

  const setValue = (d: AssetPropertyDef, raw: string) => {
    const option = d.options?.find((o) => String(o.value) === raw);
    setValues((prev) => ({ ...prev, [d.id]: option ? option.value : raw }));
  };

  return (
    <div
      ref={ref}
      data-testid="asset-detail-popover"
      style={{ top, left: anchor.left }}
      className="fig-panel fixed z-50 w-[300px] max-h-[calc(100vh-60px)] overflow-y-auto bg-white rounded-[13px] shadow-[0_5px_17px_rgba(0,0,0,0.2),0_2px_7px_rgba(0,0,0,0.15),0_0_0_0.5px_rgba(0,0,0,0.12)]"
    >
      <div className="h-12 pl-4 pr-2 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">세부 정보</div>
          <div className="text-black/50 truncate">{libraryLabel}</div>
        </div>
        <button type="button" onClick={onClose} className="fig-icon-btn" title="닫기">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-[#f5f5f5] px-4 py-4 border-y border-[var(--fig-border)]">
        <div className="rounded-[4px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] p-3">
          {kind === "page" ? (
            <AssetPreview source={source} variant={preview} height={300} fit="width" contentWidth={714} />
          ) : (
            <AssetPreview source={source} variant={preview} height={190} properties={values} />
          )}
        </div>
        {variants.length > 1 && (
          <div className="mt-3 fig-seg !bg-white" role="group" aria-label="미리보기 내용">
            {variants.map((v) => (
              <button key={v} type="button" aria-pressed={preview === v} onClick={() => setPreview(v)} data-testid={`asset-preview-variant-${v}`}>
                {ASSET_VARIANT_LABEL[v]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-3 pb-4">
        <div className="text-[15px] font-semibold leading-5">{name}</div>
        <div className="mt-1 text-black/50 leading-4">{description}</div>
        {meta && <div className="mt-1 text-black/40">{meta}</div>}

        <div className="mt-3 space-y-1.5">
          {variants.map((v, i) => (
            <button
              key={v}
              type="button"
              data-testid={i === 0 ? "asset-insert-instance-btn" : `asset-insert-${v}-btn`}
              disabled={!canInsert}
              onMouseEnter={() => setPreview(v)}
              onFocus={() => setPreview(v)}
              onClick={() => {
                if (onInsert(v, values)) onClose();
              }}
              title={VARIANT_HINT[v]}
              className={insertButtonClass(i === 0)}
            >
              {VARIANT_ICON[v]}
              {v === "original" ? `원본 그대로 ${insertVerb}` : `더미 데이터로 ${insertVerb}`}
            </button>
          ))}
        </div>
      </div>

      {defs.length > 0 && (
        <div className="px-4 pt-3 pb-4 border-t border-[var(--fig-border)]" data-testid="asset-properties">
          <div className="flex items-center justify-between mb-2">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
              <Diamond className="w-3 h-3 text-[var(--fig-component,var(--vds-accent))]" />
              속성
            </span>
            <button
              type="button"
              className="fig-icon-btn disabled:opacity-30"
              disabled={!changed}
              onClick={() => setValues(initialValues)}
              title="저장된 값으로 되돌리기"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            {defs.map((d) => (
              <label key={d.id} className="grid grid-cols-[96px_1fr] items-center gap-2">
                <span className="text-black/50 truncate">{d.label}</span>
                <span className="fig-input">
                  {d.control === "select" ? (
                    <select
                      value={String(values[d.id] ?? d.fallback)}
                      onChange={(e) => setValue(d, e.target.value)}
                      data-testid={`asset-prop-${d.id}`}
                    >
                      {d.options!.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={String(values[d.id] ?? "")}
                      placeholder="비워 두면 미지정"
                      onChange={(e) => setValue(d, e.target.value)}
                      data-testid={`asset-prop-${d.id}`}
                    />
                  )}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] leading-4 text-black/40">
            만든 사람이 노출한 값만 바꿀 수 있어요. 나머지는 넣은 뒤 인스펙터에서 고치세요.
          </p>
        </div>
      )}
    </div>
  );
};
