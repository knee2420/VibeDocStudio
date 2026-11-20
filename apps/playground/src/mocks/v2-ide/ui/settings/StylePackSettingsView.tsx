import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getBuiltinStylePack,
  resolveFrameStyle,
  resolveMediaGridStyle,
  resolvePageGridStyle,
  resolveStylePack,
  resolveTableGridStyle,
  resolveTextRoleStyle,
  type FrameOrnamentKind,
  type GridAlign,
  type StylePack,
} from "@vibe/style-core";
import type { VaultPort } from "@vibe/vault-core";

import { parseStylePackJson, serializeStylePack } from "../../model/settingsRegistry";
import { CodeTabEditor } from "../CodeTabEditor";
import {
  CodeAsDocHeader,
  ColorSwatchControl,
  SegmentedControl,
  SettingRow,
  SettingSectionHeading,
} from "./ObsidianSettingsPrimitives";

type StyleKitTab = "page" | "typography" | "frame" | "table" | "media" | "palette";

const ALIGN_OPTIONS: readonly { value: GridAlign; label: string }[] = [
  { value: "left", label: "좌측" },
  { value: "center", label: "중앙" },
  { value: "right", label: "우측" },
];

const ORNAMENT_OPTIONS: readonly { value: FrameOrnamentKind; label: string }[] = [
  { value: "quote-left-underline", label: "좌측 따옴표 + 하단 밑줄 (블로그)" },
  { value: "left-bar", label: "좌측 컬러 바 (뉴스 · RFP)" },
  { value: "quote-top-bottom", label: "상·하단 중앙 큰따옴표" },
  { value: "outer-sheet-box", label: "외곽 사각 테두리 (공문서)" },
  { value: "pill", label: "강조 필 바" },
  { value: "none", label: "장식 없음" },
];

export interface StylePackSettingsViewProps {
  readonly vault: VaultPort;
  readonly path: string;
  readonly onOpenInTab?: () => void;
}

/**
 * Obsidian 1.15 `외형(Appearance)` 설정 행 규격으로 구현된 `.vstyle` 비주얼 스타일 팩 에디터.
 * 상단 라이브 미니 프리뷰 + 5대 Grid Kit 설정 행 + `[</> JSON 소스]` 토글을 제공한다.
 */
export const StylePackSettingsView: React.FC<StylePackSettingsViewProps> = ({
  vault,
  path,
  onOpenInTab,
}) => {
  const [pack, setPack] = useState<StylePack | null>(() =>
    vault.exists(path) ? parseStylePackJson(vault.read(path)) : null
  );
  const [sourceMode, setSourceMode] = useState(false);
  const [activeTab, setActiveTab] = useState<StyleKitTab>("typography");
  const localWriteRef = useRef(false);

  useEffect(() => {
    const reload = () => {
      if (!vault.exists(path)) return;
      setPack(parseStylePackJson(vault.read(path)));
    };
    reload();
    return vault.subscribe((ev) => {
      if (localWriteRef.current) return;
      if ((ev.type === "modify" && ev.path === path) || ev.type === "vault-reset") {
        reload();
      }
    });
  }, [vault, path]);

  const commitPack = (updater: (prev: StylePack) => StylePack) => {
    if (!pack) return;
    const next = updater(pack);
    setPack(next);
    localWriteRef.current = true;
    try {
      vault.write(path, serializeStylePack(next));
    } finally {
      localWriteRef.current = false;
    }
  };

  const resolved = useMemo(() => (pack ? resolveStylePack(pack, "default") : null), [pack]);
  const pageKey = useMemo(() => {
    if (!pack) return "blog";
    return Object.keys(pack.styles.pageChrome)[0] ?? "blog";
  }, [pack]);

  const previewData = useMemo(() => {
    if (!resolved) return null;
    return {
      page: resolvePageGridStyle(resolved, pageKey),
      body: resolveTextRoleStyle(resolved, "body"),
      infoFrame: resolveFrameStyle(resolved, "info-frame"),
      accentBar: resolveFrameStyle(resolved, "accent-bar"),
      cta: resolveFrameStyle(resolved, "cta"),
      table: resolveTableGridStyle(resolved, "default"),
      media: resolveMediaGridStyle(resolved, "strip"),
    };
  }, [resolved, pageKey]);

  const builtinBaseline = useMemo(
    () => (pack ? getBuiltinStylePack(pack.id) : undefined),
    [pack]
  );

  if (!pack || !resolved || !previewData || sourceMode) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)]">
        <div className="shrink-0 border-b border-[var(--obs-border-subtle,#2d2d2d)] px-6 pt-4 pb-1">
          <CodeAsDocHeader
            title={pack?.name ?? "스타일 팩 (.vstyle)"}
            subtitle={path}
            sourceMode={true}
            onToggleSource={() => {
              if (pack) setSourceMode(false);
            }}
            onOpenInTab={onOpenInTab}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <CodeTabEditor vault={vault} path={path} />
        </div>
      </div>
    );
  }

  const pageChrome = pack.styles.pageChrome[pageKey] ?? {};
  const bodyDef = pack.styles.text.body ?? {};
  const infoDef = pack.styles.frame["info-frame"] ?? {};
  const ctaDef = pack.styles.frame.cta ?? {};
  const tableDef = pack.styles.table.default ?? {};
  const mediaDef = pack.styles.media.strip ?? {};
  const colorPrimitives = pack.primitives.color ?? {};

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--obs-bg-primary,#1e1e1e)] px-6 py-7 text-[var(--obs-text-normal,#dadada)]">
      <div className="mx-auto max-w-[780px]">
        <CodeAsDocHeader
          title={pack.name}
          subtitle={`${path} · ${pack.protocol} · v${pack.version}`}
          sourceMode={sourceMode}
          onToggleSource={() => setSourceMode(true)}
          onOpenInTab={onOpenInTab}
        />

        {/* Live Mini Preview Strip (Powered by @vibe/style-core 5 Grid Kits!) */}
        <div className="mb-4 overflow-hidden rounded-xl border border-[var(--obs-border-subtle,#2d2d2d)] bg-[#2a2a2e] p-4">
          <div className="mb-2 flex items-center justify-between text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#888)] uppercase">
            <span>실시간 스타일 프리뷰 ({previewData.page.width}px · {previewData.page.surfaceKind})</span>
            {builtinBaseline && (
              <button
                type="button"
                onClick={() => commitPack(() => JSON.parse(JSON.stringify(builtinBaseline)) as StylePack)}
                className="font-normal normal-case text-[var(--obs-text-muted,#a3a3a3)] hover:text-white"
              >
                팩 전체 기본값 복원
              </button>
            )}
          </div>

          <div
            className="mx-auto rounded-md shadow-sm"
            style={{
              maxWidth: "560px",
              backgroundColor: previewData.page.background,
              padding: "16px 22px",
              color: previewData.body.color,
            }}
          >
            {/* Info-Frame Preview */}
            <div
              style={{
                backgroundColor: previewData.infoFrame.fill,
                border: previewData.infoFrame.border,
                borderTop: previewData.infoFrame.borderTop,
                borderBottom: previewData.infoFrame.borderBottom,
                borderLeft: previewData.infoFrame.borderLeft,
                borderRadius: previewData.infoFrame.radius,
                padding: "8px 10px",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  color: previewData.infoFrame.titleColor,
                  fontWeight: 600,
                  fontSize: "13.5px",
                }}
              >
                {previewData.infoFrame.ornament === "quote-left-underline" && (
                  <span style={{ color: previewData.infoFrame.ornamentColor, marginRight: 6 }}>“</span>
                )}
                스팟 정보 프레임 예시
              </div>
              <div style={{ fontSize: "11.5px", color: previewData.infoFrame.kvTextColor, marginTop: 4 }}>
                {previewData.infoFrame.kvMarker} 입장료 : 무료 · {previewData.infoFrame.kvMarker} 운영시간 : 12:00 ~ 22:00
              </div>
            </div>

            {/* Body Prose Preview */}
            <p
              style={{
                fontSize: previewData.body.fontSize,
                lineHeight: previewData.body.lineHeight,
                color: previewData.body.color,
                textAlign: previewData.body.align,
                marginBottom: "10px",
              }}
            >
              본문 텍스트가 현재 선택된 정렬 · 크기 · 행간으로 렌더링됩니다.
            </p>

            {/* Media Strip + Mini Table Preview */}
            <div className="grid grid-cols-2 items-center gap-3">
              <div
                className="grid"
                style={{
                  gridTemplateColumns: "2fr 1fr",
                  gap: `${previewData.media.stripGap}px`,
                }}
              >
                <div
                  className="flex h-10 items-center justify-center bg-slate-200 text-[10px] text-slate-500"
                  style={{ borderRadius: previewData.media.radius }}
                >
                  2fr 사진
                </div>
                <div
                  className="flex h-10 items-center justify-center bg-slate-300 text-[10px] text-slate-600"
                  style={{ borderRadius: previewData.media.radius }}
                >
                  1fr
                </div>
              </div>

              <table
                className="w-full border-collapse text-[11px]"
                style={{ border: previewData.table.borders.outer }}
              >
                <tbody>
                  <tr>
                    <td
                      style={{
                        backgroundColor: previewData.table.headerFill,
                        color: previewData.table.headerTextColor,
                        fontWeight: previewData.table.headerFontWeight,
                        letterSpacing: previewData.table.headerLetterSpacing,
                        borderBottom: previewData.table.borders.headerBottom,
                        borderRight: previewData.table.borders.vertical,
                        padding: "4px 6px",
                        textAlign: "center",
                      }}
                    >
                      항목
                    </td>
                    <td
                      style={{
                        borderBottom: previewData.table.borders.rowBottom,
                        padding: "4px 6px",
                        color: "#334155",
                      }}
                    >
                      표 셀 예시
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* CTA Preview */}
            <div
              className="mt-2.5 flex flex-col"
              style={{
                alignItems:
                  previewData.cta.align === "left"
                    ? "flex-start"
                    : previewData.cta.align === "right"
                      ? "flex-end"
                      : "center",
              }}
            >
              {previewData.cta.chevron && (
                <span style={{ color: previewData.cta.chevronColor, fontSize: "9px", letterSpacing: "0.2em" }}>
                  ▼▼▼
                </span>
              )}
              <span
                className="inline-block text-[11.5px] font-semibold"
                style={{
                  backgroundColor: previewData.cta.fill,
                  color: previewData.cta.color,
                  border: previewData.cta.border,
                  borderRadius: previewData.cta.radius,
                  padding: "3px 10px",
                }}
              >
                할인 링크 CTA 버튼 예시
              </span>
            </div>
          </div>
        </div>

        {/* Obsidian-style Kit Tab Pills */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "typography", label: "타이포그래피" },
              { id: "page", label: "지면 그리드" },
              { id: "frame", label: "프레임 · 인용구 · CTA" },
              { id: "table", label: "표 5선 테두리" },
              { id: "media", label: "미디어 · 콜라주" },
              { id: "palette", label: "색상 팔레트" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-[var(--obs-accent,#8a5cf5)] text-white"
                  : "bg-[#2a2a2a] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[#353535] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Obsidian Setting Rows Card */}
        <div className="rounded-xl border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#242424)] px-5 py-3">
          {activeTab === "typography" && (
            <>
              <SettingSectionHeading
                title="본문 타이포그래피 (Typography Kit)"
                description="문서 전체 본문 단락의 기본 정렬, 크기, 행간, 글자 색상을 제어합니다."
              />
              <SettingRow title="본문 정렬" description="블로그는 중앙, 뉴스·공문서는 좌측 정렬이 표준입니다.">
                <SegmentedControl
                  value={previewData.body.align}
                  options={ALIGN_OPTIONS}
                  onChange={(align) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        text: { ...prev.styles.text, body: { ...bodyDef, align } },
                      },
                    }))
                  }
                />
              </SettingRow>
              <SettingRow title="본문 글자 크기" description="CSS 크기 단위 (예: 14px, 16px, 13.5px)">
                <input
                  type="text"
                  value={bodyDef.fontSize ?? previewData.body.fontSize}
                  onChange={(e) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        text: { ...prev.styles.text, body: { ...bodyDef, fontSize: e.target.value } },
                      },
                    }))
                  }
                  className="h-7 w-24 rounded border border-[#383838] bg-[#1a1a1a] px-2 text-right font-code text-[12px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                />
              </SettingRow>
              <SettingRow title="본문 행간 (Line Height)" description="모바일 블로그는 1.8, 공문서는 1.65를 권장합니다.">
                <input
                  type="text"
                  value={bodyDef.lineHeight ?? previewData.body.lineHeight}
                  onChange={(e) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        text: { ...prev.styles.text, body: { ...bodyDef, lineHeight: e.target.value } },
                      },
                    }))
                  }
                  className="h-7 w-24 rounded border border-[#383838] bg-[#1a1a1a] px-2 text-right font-code text-[12px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                />
              </SettingRow>
              <SettingRow title="본문 글자 색상" description="원시 토큰({text.body}) 또는 Hex 색상을 지정합니다.">
                <ColorSwatchControl
                  value={previewData.body.color}
                  onChange={(color) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        text: { ...prev.styles.text, body: { ...bodyDef, color } },
                      },
                    }))
                  }
                />
              </SettingRow>
            </>
          )}

          {activeTab === "page" && (
            <>
              <SettingSectionHeading
                title="지면 그리드 (Page Grid Kit)"
                description="문서 지면의 가로 폭, 좌우 여백, 블록 간 세로 간격을 제어합니다."
              />
              <SettingRow title="지면 가로 폭 (px)" description="블로그 720px · 뉴스 740px · A4 794px · 웹 960px">
                <input
                  type="number"
                  min={480}
                  max={1280}
                  step={10}
                  value={pageChrome.width ?? previewData.page.width}
                  onChange={(e) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        pageChrome: {
                          ...prev.styles.pageChrome,
                          [pageKey]: { ...pageChrome, width: Number(e.target.value) || 720 },
                        },
                      },
                    }))
                  }
                  className="h-7 w-24 rounded border border-[#383838] bg-[#1a1a1a] px-2 text-right font-code text-[12px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                />
              </SettingRow>
              <SettingRow title="블록 간 세로 간격 (px)" description="각 블록 사이의 기본 vertical rhythm 간격">
                <input
                  type="number"
                  min={0}
                  max={48}
                  value={pageChrome.blockGap ?? previewData.page.blockGap}
                  onChange={(e) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        pageChrome: {
                          ...prev.styles.pageChrome,
                          [pageKey]: { ...pageChrome, blockGap: Number(e.target.value) || 0 },
                        },
                      },
                    }))
                  }
                  className="h-7 w-24 rounded border border-[#383838] bg-[#1a1a1a] px-2 text-right font-code text-[12px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                />
              </SettingRow>
              <SettingRow title="지면 배경색" description="캔버스 용지 배경 채움 색">
                <ColorSwatchControl
                  value={previewData.page.background}
                  fallbackHex="#ffffff"
                  onChange={(background) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        pageChrome: {
                          ...prev.styles.pageChrome,
                          [pageKey]: { ...pageChrome, background },
                        },
                      },
                    }))
                  }
                />
              </SettingRow>
            </>
          )}

          {activeTab === "frame" && (
            <>
              <SettingSectionHeading
                title="프레임 · 정보 카드 · CTA (Frame Kit)"
                description="> 정보 프레임, ! 강조 바, [cta] 링크 배너의 장식과 강조 색상을 설정합니다."
              />
              <SettingRow title="스팟 정보 프레임 장식" description="> + :: 정보 카드의 시각 프레임 스타일">
                <select
                  value={previewData.infoFrame.ornament}
                  onChange={(e) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        frame: {
                          ...prev.styles.frame,
                          "info-frame": {
                            ...infoDef,
                            ornament: e.target.value as FrameOrnamentKind,
                          },
                        },
                      },
                    }))
                  }
                  className="h-7 rounded border border-[#383838] bg-[#1a1a1a] px-2 text-[12px] text-[var(--obs-text-normal,#dadada)] outline-none"
                >
                  {ORNAMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow title="정보 프레임 제목 색상" description="스팟명 · 강조 헤더에 쓰이는 포인트 컬러">
                <ColorSwatchControl
                  value={previewData.infoFrame.titleColor}
                  onChange={(titleColor) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        frame: {
                          ...prev.styles.frame,
                          "info-frame": { ...infoDef, titleColor },
                        },
                      },
                    }))
                  }
                />
              </SettingRow>
              <SettingRow title="Key-Value 불릿 마커" description="입장료 · 운영시간 앞에 붙는 기호 (예: ▫️, •, ▪)">
                <input
                  type="text"
                  value={infoDef.kvMarker ?? previewData.infoFrame.kvMarker}
                  onChange={(e) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        frame: {
                          ...prev.styles.frame,
                          "info-frame": { ...infoDef, kvMarker: e.target.value },
                        },
                      },
                    }))
                  }
                  className="h-7 w-20 rounded border border-[#383838] bg-[#1a1a1a] px-2 text-center font-code text-[12px] outline-none"
                />
              </SettingRow>
              <SettingRow title="CTA 배너 배경색" description="[cta:라벨 -> url] 블록의 배경 채움">
                <ColorSwatchControl
                  value={previewData.cta.fill}
                  fallbackHex="#fef08a"
                  onChange={(fill) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        frame: { ...prev.styles.frame, cta: { ...ctaDef, fill } },
                      },
                    }))
                  }
                />
              </SettingRow>
              <SettingRow title="CTA 상단 ▼▼▼ 유도 화살표" description="블로그 제휴 CTA 위에 화살표 표시 여부">
                <button
                  type="button"
                  onClick={() =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        frame: {
                          ...prev.styles.frame,
                          cta: { ...ctaDef, chevron: !previewData.cta.chevron },
                        },
                      },
                    }))
                  }
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    previewData.cta.chevron ? "bg-[var(--obs-accent,#8a5cf5)]" : "bg-[#3f3f46]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      previewData.cta.chevron ? "left-4.5" : "left-0.5"
                    }`}
                  />
                </button>
              </SettingRow>
            </>
          )}

          {activeTab === "table" && (
            <>
              <SettingSectionHeading
                title="표 5선 테두리 & 헤더 (Table Grid Kit)"
                description="예스폼 2px 흑색 격자, 공공 RFP 연청 헤더 등 한국형 표 조판 규칙을 제어합니다."
              />
              <SettingRow title="표 외곽 테두리 (outer)" description="예: 2px solid #000000, 1px solid #94a3b8, none">
                <input
                  type="text"
                  value={tableDef.borders?.outer ?? previewData.table.borders.outer}
                  onChange={(e) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        table: {
                          ...prev.styles.table,
                          default: {
                            ...tableDef,
                            borders: { ...(tableDef.borders ?? {}), outer: e.target.value },
                          },
                        },
                      },
                    }))
                  }
                  className="h-7 w-44 rounded border border-[#383838] bg-[#1a1a1a] px-2 font-code text-[11.5px] outline-none"
                />
              </SettingRow>
              <SettingRow title="세로 구분선 (vertical)" description="예스폼은 1px solid #000000, 뉴스 표는 none">
                <input
                  type="text"
                  value={tableDef.borders?.vertical ?? previewData.table.borders.vertical}
                  onChange={(e) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        table: {
                          ...prev.styles.table,
                          default: {
                            ...tableDef,
                            borders: { ...(tableDef.borders ?? {}), vertical: e.target.value },
                          },
                        },
                      },
                    }))
                  }
                  className="h-7 w-44 rounded border border-[#383838] bg-[#1a1a1a] px-2 font-code text-[11.5px] outline-none"
                />
              </SettingRow>
              <SettingRow title="헤더 셀 배경 음영" description="RFP 연청(#e6ecf5) · 예스폼 무음영(#ffffff)">
                <ColorSwatchControl
                  value={previewData.table.headerFill}
                  fallbackHex="#e6ecf5"
                  onChange={(headerFill) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        table: {
                          ...prev.styles.table,
                          default: { ...tableDef, headerFill },
                        },
                      },
                    }))
                  }
                />
              </SettingRow>
              <SettingRow title="헤더 자간 (Letter Spacing)" description="예스폼 균등자간(0.35em) 또는 normal">
                <input
                  type="text"
                  value={tableDef.headerLetterSpacing ?? previewData.table.headerLetterSpacing}
                  onChange={(e) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        table: {
                          ...prev.styles.table,
                          default: { ...tableDef, headerLetterSpacing: e.target.value },
                        },
                      },
                    }))
                  }
                  className="h-7 w-24 rounded border border-[#383838] bg-[#1a1a1a] px-2 text-right font-code text-[12px] outline-none"
                />
              </SettingRow>
            </>
          )}

          {activeTab === "media" && (
            <>
              <SettingSectionHeading
                title="미디어 · 콜라주 그리드 (Media Grid Kit)"
                description="1+2 사진 콜라주 간격, 사진 라운딩, 캡션 정렬을 제어합니다."
              />
              <SettingRow title="사진 스트립 간격 (px)" description="네이버 블로그 콜라주는 4px, 뉴스는 10px">
                <input
                  type="number"
                  min={0}
                  max={32}
                  value={mediaDef.stripGap ?? previewData.media.stripGap}
                  onChange={(e) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        media: {
                          ...prev.styles.media,
                          strip: { ...mediaDef, stripGap: Number(e.target.value) || 0 },
                        },
                      },
                    }))
                  }
                  className="h-7 w-24 rounded border border-[#383838] bg-[#1a1a1a] px-2 text-right font-code text-[12px] outline-none"
                />
              </SettingRow>
              <SettingRow title="이미지 모서리 둥글기" description="예: 0px, 4px, 8px">
                <input
                  type="text"
                  value={mediaDef.radius ?? previewData.media.radius}
                  onChange={(e) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        media: {
                          ...prev.styles.media,
                          strip: { ...mediaDef, radius: e.target.value },
                        },
                      },
                    }))
                  }
                  className="h-7 w-24 rounded border border-[#383838] bg-[#1a1a1a] px-2 text-right font-code text-[12px] outline-none"
                />
              </SettingRow>
              <SettingRow title="캡션 정렬" description="블로그 중앙 정렬 · 연합뉴스 좌측 정렬">
                <SegmentedControl
                  value={previewData.media.captionAlign}
                  options={ALIGN_OPTIONS}
                  onChange={(captionAlign) =>
                    commitPack((prev) => ({
                      ...prev,
                      styles: {
                        ...prev.styles,
                        media: { ...prev.styles.media, strip: { ...mediaDef, captionAlign } },
                      },
                    }))
                  }
                />
              </SettingRow>
            </>
          )}

          {activeTab === "palette" && (
            <>
              <SettingSectionHeading
                title="원시 색상 팔레트 (Primitives)"
                description="Semantic 토큰이 {color.키} 형태로 참조하는 기본 색상 팔레트입니다."
              />
              {Object.entries(colorPrimitives).map(([colorKey, hex]) => (
                <SettingRow key={colorKey} title={`color.${colorKey}`} description={`alias: {color.${colorKey}}`}>
                  <ColorSwatchControl
                    value={hex}
                    onChange={(nextHex) =>
                      commitPack((prev) => ({
                        ...prev,
                        primitives: {
                          ...prev.primitives,
                          color: { ...(prev.primitives.color ?? {}), [colorKey]: nextHex },
                        },
                      }))
                    }
                  />
                </SettingRow>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
