import React from "react";
import { Code2, ExternalLink, RotateCcw } from "lucide-react";

export interface SettingSectionHeadingProps {
  readonly title: string;
  readonly description?: string;
}

export const SettingSectionHeading: React.FC<SettingSectionHeadingProps> = ({
  title,
  description,
}) => (
  <div className="mt-6 mb-2 first:mt-0">
    <h3 className="text-[15px] font-semibold tracking-tight text-[var(--obs-text-normal,#e6e6e6)]">
      {title}
    </h3>
    {description && (
      <p className="mt-0.5 text-[12px] text-[var(--obs-text-muted,#9a9a9a)]">{description}</p>
    )}
  </div>
);

export interface SettingRowProps {
  readonly title: string;
  readonly description?: string;
  readonly onReset?: () => void;
  readonly resetTitle?: string;
  readonly children: React.ReactNode;
}

/**
 * Obsidian 표준 `setting-item` 행 — 좌측 제목/설명, 우측 컨트롤(+ 선택적 ↺ 복원).
 */
export const SettingRow: React.FC<SettingRowProps> = ({
  title,
  description,
  onReset,
  resetTitle = "기본값으로 복원",
  children,
}) => (
  <div className="flex items-center justify-between gap-4 border-b border-[var(--obs-border-subtle,#2c2c2c)] py-3.5 last:border-b-0">
    <div className="min-w-0 flex-1">
      <div className="text-[13.5px] font-medium text-[var(--obs-text-normal,#e2e2e2)]">{title}</div>
      {description && (
        <div className="mt-0.5 text-[12px] leading-snug text-[var(--obs-text-muted,#949494)]">
          {description}
        </div>
      )}
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          title={resetTitle}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--obs-text-faint,#777)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      {children}
    </div>
  </div>
);

export interface ColorSwatchControlProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly fallbackHex?: string;
}

export const ColorSwatchControl: React.FC<ColorSwatchControlProps> = ({
  value,
  onChange,
  fallbackHex = "#334155",
}) => {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : fallbackHex;
  return (
    <div className="flex items-center gap-1.5 rounded-[5px] border border-[var(--obs-border,#383838)] bg-[var(--obs-bg-primary,#1a1a1a)] px-1.5 py-0.5">
      <input
        type="color"
        value={safeColor}
        onChange={(e) => onChange(e.target.value)}
        aria-label="색상 선택"
        className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-[88px] bg-transparent font-code text-[11.5px] text-[var(--obs-text-normal,#dadada)] outline-none"
      />
    </div>
  );
};

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  readonly value: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex rounded-[6px] border border-[var(--obs-border,#383838)] bg-[var(--obs-bg-primary,#1a1a1a)] p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-[4px] px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
              active
                ? "bg-[var(--obs-accent,#8a5cf5)] text-white"
                : "text-[var(--obs-text-muted,#a3a3a3)] hover:text-[var(--obs-text-normal,#e2e2e2)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export interface CodeAsDocHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly sourceMode: boolean;
  readonly onToggleSource: () => void;
  readonly onOpenInTab?: () => void;
}

export const CodeAsDocHeader: React.FC<CodeAsDocHeaderProps> = ({
  title,
  subtitle,
  sourceMode,
  onToggleSource,
  onOpenInTab,
}) => (
  <div className="mb-4 flex items-center justify-between gap-3">
    <div className="min-w-0">
      <h2 className="truncate text-[18px] font-semibold tracking-tight text-[var(--obs-text-normal,#ececec)]">
        {title}
      </h2>
      {subtitle && (
        <div className="mt-0.5 truncate font-code text-[11px] text-[var(--obs-text-faint,#7a7a7a)]">
          {subtitle}
        </div>
      )}
    </div>
    <div className="flex shrink-0 items-center gap-1.5">
      {onOpenInTab && (
        <button
          type="button"
          onClick={onOpenInTab}
          className="flex items-center gap-1 rounded-[5px] border border-[var(--obs-border,#383838)] bg-[var(--obs-bg-secondary,#262626)] px-2.5 py-1 text-[11.5px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#e2e2e2)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>탭으로 열기</span>
        </button>
      )}
      <button
        type="button"
        onClick={onToggleSource}
        className={`flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
          sourceMode
            ? "border-[var(--obs-accent,#8a5cf5)] bg-[rgba(138,92,245,0.2)] text-[#d8ccff]"
            : "border-[var(--obs-border,#383838)] bg-[var(--obs-bg-secondary,#262626)] text-[var(--obs-text-muted,#b3b3b3)] hover:text-[var(--obs-text-normal,#e2e2e2)]"
        }`}
      >
        <Code2 className="h-3.5 w-3.5" />
        <span>{sourceMode ? "설정 뷰" : "JSON 소스"}</span>
      </button>
    </div>
  </div>
);
