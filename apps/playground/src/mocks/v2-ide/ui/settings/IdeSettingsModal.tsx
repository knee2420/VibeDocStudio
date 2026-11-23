import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Cpu,
  FileCode2,
  FolderCog,
  Globe,
  Keyboard,
  Layers,
  Link2,
  Palette,
  Plus,
  Search,
  Sliders,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import {
  createDefaultRegistrySnapshot,
  type ElementRegistrySnapshot,
} from "@vibe/vdoc-schema";
import {
  resolveFrameStyle,
  resolvePageGridStyle,
  resolveStylePack,
} from "@vibe/style-core";
import { basename, dirname, type VaultPort } from "@vibe/vault-core";

import {
  SETTINGS_GROUPS,
  STANDARD_STYLE_PATH,
  STANDARD_SYNTAX_PATH,
  createDefaultStylePackJson,
  createDefaultSyntaxJson,
  createSettingsSectionRegistry,
  createStandardBaseStyleJson,
  detectSyntaxRuleConflicts,
  isStylePath,
  isSyntaxPath,
  isSystemSettingsPath,
  parseStylePackJson,
  parseSyntaxSnapshot,
  serializeSyntaxSnapshot,
  type SettingsSectionDefinition,
} from "../../model/settingsRegistry";
import {
  SegmentedControl,
  SettingRow,
  SettingSectionHeading,
} from "./ObsidianSettingsPrimitives";
import { StylePackSettingsView } from "./StylePackSettingsView";
import { SyntaxSettingsView } from "./SyntaxSettingsView";

export interface IdeSettingsModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly vault: VaultPort;
  readonly theme: "dark" | "light";
  readonly onChangeTheme: (next: "dark" | "light") => void;
  readonly initialSectionId?: string;
  readonly onOpenFileInTab?: (path: string) => void;
  /** Optional external/plugin-registered settings sections (AI, harnesses, custom kits). */
  readonly extraSections?: readonly SettingsSectionDefinition[];
}

function collectVaultPaths(vault: VaultPort): {
  standardSyntaxPath: string | null;
  standardStylePath: string | null;
  syntaxPaths: string[];
  individualStylePaths: string[];
} {
  const syntaxPaths: string[] = [];
  const individualStylePaths: string[] = [];
  let standardSyntaxPath: string | null = null;
  let standardStylePath: string | null = null;

  for (const node of vault.listAll()) {
    if (node.kind !== "file") continue;
    if (isSyntaxPath(node.path)) {
      syntaxPaths.push(node.path);
      if (
        node.path === STANDARD_SYNTAX_PATH ||
        (!standardSyntaxPath && isSystemSettingsPath(node.path))
      ) {
        standardSyntaxPath = node.path;
      }
    } else if (isStylePath(node.path)) {
      if (node.path === STANDARD_STYLE_PATH || isSystemSettingsPath(node.path)) {
        if (!standardStylePath || node.path === STANDARD_STYLE_PATH) {
          standardStylePath = node.path;
        }
      } else {
        individualStylePaths.push(node.path);
      }
    }
  }
  syntaxPaths.sort((a, b) => a.localeCompare(b));
  individualStylePaths.sort((a, b) => a.localeCompare(b));
  if (!standardSyntaxPath && syntaxPaths.length > 0) {
    standardSyntaxPath = syntaxPaths[0];
  }
  return { standardSyntaxPath, standardStylePath, syntaxPaths, individualStylePaths };
}

/**
 * Obsidian 1.15 설정 모달을 80%+ 패리티로 재현한 VibeDoc 통합 설정 플랫폼.
 * `SettingsSectionRegistry` 기반으로 옵션 · 요소 규격(.vsyntax) · 스타일 팩(.vstyle) · AI & 하네스 섹션을 동적 등록한다.
 */
export const IdeSettingsModal: React.FC<IdeSettingsModalProps> = ({
  open,
  onClose,
  vault,
  theme,
  onChangeTheme,
  initialSectionId,
  onOpenFileInTab,
  extraSections = [],
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState<string>(
    initialSectionId || "options:syntax"
  );
  const [vaultTick, setVaultTick] = useState(0);
  const [creatingStyle, setCreatingStyle] = useState(false);
  const [newStyleName, setNewStyleName] = useState("");

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Subscribe to vault changes while open
  useEffect(() => {
    if (!open) return;
    return vault.subscribe(() => {
      setVaultTick((t) => t + 1);
    });
  }, [open, vault]);

  const { standardSyntaxPath, standardStylePath, syntaxPaths, individualStylePaths } = useMemo(() => {
    void vaultTick;
    return collectVaultPaths(vault);
  }, [vault, vaultTick]);

  // Ensure lazy-loaded .vsyntax and .vstyle files are hydrated when modal opens
  useEffect(() => {
    if (!open || !vault.ensureLoaded) return;
    const targets = [
      ...syntaxPaths,
      ...(standardStylePath ? [standardStylePath] : []),
      ...individualStylePaths,
    ];
    let cancelled = false;
    const unloaded = targets.filter((p) => vault.isLoaded && !vault.isLoaded(p));
    if (unloaded.length === 0) return;
    Promise.all(unloaded.map((p) => vault.ensureLoaded!(p).catch(() => {}))).then(() => {
      if (!cancelled) setVaultTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [open, vault, syntaxPaths, standardStylePath, individualStylePaths]);

  const primarySyntaxPath = standardSyntaxPath;

  const syntaxSnapshot = useMemo<ElementRegistrySnapshot>(() => {
    void vaultTick;
    if (!primarySyntaxPath || !vault.exists(primarySyntaxPath)) {
      return createDefaultRegistrySnapshot();
    }
    if (vault.isLoaded && !vault.isLoaded(primarySyntaxPath)) {
      return createDefaultRegistrySnapshot();
    }
    return parseSyntaxSnapshot(vault.read(primarySyntaxPath));
  }, [vault, primarySyntaxPath, vaultTick]);

  const conflictSummary = useMemo(
    () => detectSyntaxRuleConflicts(syntaxSnapshot),
    [syntaxSnapshot]
  );

  const styleCatalog = useMemo(() => {
    void vaultTick;
    return individualStylePaths.map((p) => {
      const loaded = !vault.isLoaded || vault.isLoaded(p);
      const pack = loaded && vault.exists(p) ? parseStylePackJson(vault.read(p)) : null;
      const resolved = pack ? resolveStylePack(pack, "default") : null;
      const pageKey = pack ? (Object.keys(pack.styles.pageChrome)[0] ?? "blog") : "blog";
      const frame = resolved ? resolveFrameStyle(resolved, "info-frame") : null;
      const page = resolved ? resolvePageGridStyle(resolved, pageKey) : null;
      const accentCandidate =
        frame?.titleColor ??
        frame?.ornamentColor ??
        resolved?.tokens["brand.accent"] ??
        pack?.primitives.color?.accent;
      const canvasCandidate =
        page?.background ??
        resolved?.tokens["surface.canvas"] ??
        pack?.primitives.color?.paper;
      return {
        path: p,
        fileName: basename(p),
        folder: dirname(p),
        name: pack?.name ?? basename(p).replace(/\.(vstyle|vstyle\.json)$/i, ""),
        description: pack?.description ?? "",
        primaryAccent: typeof accentCandidate === "string" ? accentCandidate : "#8a5cf5",
        canvasBg: typeof canvasCandidate === "string" ? canvasCandidate : "#ffffff",
        pack,
      };
    });
  }, [vault, individualStylePaths, vaultTick]);

  const ensurePrimarySyntaxFile = useCallback((): string => {
    if (primarySyntaxPath && vault.exists(primarySyntaxPath)) return primarySyntaxPath;
    if (!vault.exists(STANDARD_SYNTAX_PATH)) {
      vault.createFile(STANDARD_SYNTAX_PATH, createDefaultSyntaxJson("VibeDoc 표준 규격"));
    }
    setVaultTick((t) => t + 1);
    return STANDARD_SYNTAX_PATH;
  }, [primarySyntaxPath, vault]);

  const ensureStandardStyleFile = useCallback((): string => {
    if (standardStylePath && vault.exists(standardStylePath)) return standardStylePath;
    if (!vault.exists(STANDARD_STYLE_PATH)) {
      vault.createFile(STANDARD_STYLE_PATH, createStandardBaseStyleJson());
    }
    setVaultTick((t) => t + 1);
    return STANDARD_STYLE_PATH;
  }, [standardStylePath, vault]);

  const handleUpdateProfileWidth = useCallback(
    (profileId: string, width: number) => {
      const path = ensurePrimarySyntaxFile();
      const cur = parseSyntaxSnapshot(vault.read(path));
      const next: ElementRegistrySnapshot = {
        ...cur,
        profiles: cur.profiles.map((prof) =>
          prof.id === profileId
            ? { ...prof, surface: { ...prof.surface, width: Math.max(360, Math.min(1600, width)) } }
            : prof
        ),
      };
      vault.write(path, serializeSyntaxSnapshot(next));
    },
    [ensurePrimarySyntaxFile, vault]
  );

  const handleCreateStylePack = useCallback(() => {
    const title = newStyleName.trim();
    if (!title) return;
    const baseDir =
      individualStylePaths.length > 0 ? dirname(individualStylePaths[0]) : "styles";
    const safeFileName = title.replace(/[\\/:*?"<>|]+/g, "-").trim();
    const filePath = baseDir ? `${baseDir}/${safeFileName}.vstyle` : `${safeFileName}.vstyle`;
    const uniquePath = vault.exists(filePath)
      ? `${baseDir ? `${baseDir}/` : ""}${safeFileName}-${Date.now().toString(36)}.vstyle`
      : filePath;
    vault.createFile(uniquePath, createDefaultStylePackJson(title));
    setNewStyleName("");
    setCreatingStyle(false);
    setActiveSectionId(`style:${uniquePath}`);
    setVaultTick((t) => t + 1);
  }, [newStyleName, individualStylePaths, vault]);

  const registry = useMemo(() => {
    const sections: SettingsSectionDefinition[] = [
      // ---- 1. 옵션 (Obsidian Options) ----
      {
        id: "options:general",
        group: "options",
        label: "일반",
        subtitle: "문서 프로파일 및 기본 워크스페이스 설정",
        icon: <Sliders className="h-4 w-4" />,
        keywords: ["일반", "general", "프로파일", "profile", "blog", "a4", "web", "지면", "폭"],
        render: () => (
          <div className="h-full overflow-y-auto px-8 py-6">
            <div className="mx-auto max-w-[780px] space-y-5">
              <div>
                <h2 className="text-[18px] font-semibold text-[var(--obs-text-normal,#ececec)]">
                  일반
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                  VibeDoc 문서 프로파일(Blog · A4 · Web)과 워크스페이스 기본 환경을 설정합니다.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--obs-border-subtle,#2b2b2b)] bg-[var(--obs-bg-secondary,#242424)] px-5 py-3">
                <SettingSectionHeading
                  title="워크스페이스"
                  description="에디터 셸과 볼트 동작의 기본 설정입니다."
                />
                <SettingRow
                  title="인터페이스 테마"
                  description="IDE 작업 공간과 설정 화면의 기본 색상 테마를 전환합니다."
                >
                  <SegmentedControl
                    value={theme}
                    options={[
                      { value: "dark", label: "다크 (Obsidian)" },
                      { value: "light", label: "라이트" },
                    ]}
                    onChange={onChangeTheme}
                  />
                </SettingRow>
                <SettingRow
                  title="현재 마운트된 볼트"
                  description="모든 .vdoc, .outline, .vsyntax, .vstyle 파일이 저장되는 기준 루트입니다."
                >
                  <span className="rounded bg-[var(--obs-bg-primary,#1a1a1a)] px-2.5 py-1 font-code text-[11.5px] text-[var(--obs-text-normal,#dadada)]">
                    {vault.name}
                  </span>
                </SettingRow>
              </div>

              <div className="rounded-xl border border-[var(--obs-border-subtle,#2b2b2b)] bg-[var(--obs-bg-secondary,#242424)] px-5 py-3">
                <SettingSectionHeading
                  title="문서 프로파일 (.vsyntax)"
                  description="문서 유형별 최상위 단위(SECTION/PAGE)와 기본 지면 폭을 정의합니다."
                />
                {syntaxSnapshot.profiles.map((prof) => (
                  <SettingRow
                    key={prof.id}
                    title={prof.label}
                    description={`${prof.description} · 최상위 단위: ${prof.unitKind.toUpperCase()} (${prof.surface.kind})`}
                  >
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={360}
                        max={1600}
                        step={10}
                        value={prof.surface.width}
                        onChange={(e) =>
                          handleUpdateProfileWidth(prof.id, Number(e.target.value) || prof.surface.width)
                        }
                        className="w-[82px] rounded-[5px] border border-[var(--obs-border,#3a3a3a)] bg-[var(--obs-bg-primary,#1a1a1a)] px-2 py-1 text-right font-code text-[12px] text-[var(--obs-text-normal,#e2e2e2)] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                      />
                      <span className="font-code text-[11px] text-[var(--obs-text-faint,#777)]">
                        px
                      </span>
                    </div>
                  </SettingRow>
                ))}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "options:appearance",
        group: "options",
        label: "표준 스타일 (CSS)",
        subtitle: "5대 Grid Kit 공용 표준 스타일 사양 (.vibedoc/standard.vstyle)",
        icon: <Palette className="h-4 w-4" />,
        keywords: [
          "표준 스타일",
          "외형",
          "appearance",
          "css",
          "standard",
          "base",
          "style",
          "vstyle",
          "그리드",
          "타이포그래피",
        ],
        badge: "표준",
        render: () =>
          standardStylePath ? (
            <StylePackSettingsView vault={vault} path={standardStylePath} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <Palette className="h-8 w-8 text-[var(--obs-text-faint,#666)]" />
              <div className="text-[14px] font-medium text-[var(--obs-text-normal,#e2e2e2)]">
                공용 CSS 표준 스타일 사양(.vibedoc/standard.vstyle)이 아직 초기화되지 않았습니다.
              </div>
              <button
                type="button"
                onClick={() => ensureStandardStyleFile()}
                className="rounded-md bg-[var(--obs-accent,#8a5cf5)] px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90"
              >
                표준 스타일 사양 생성하기
              </button>
            </div>
          ),
      },
      {
        id: "options:syntax",
        group: "options",
        label: "표현 기호",
        subtitle: "아웃라인 · 문서 요소 표준 표현 기호 (.vibedoc/element-registry.vsyntax)",
        icon: <Keyboard className="h-4 w-4" />,
        keywords: [
          "표현 기호",
          "단축키",
          "hotkeys",
          "syntax",
          "vsyntax",
          "기호",
          "아웃라인",
          "충돌",
          "|",
          "[-]",
          "[<]",
          "[^]",
        ],
        badge: conflictSummary.totalConflicts > 0 ? `충돌 ${conflictSummary.totalConflicts}` : undefined,
        render: () =>
          primarySyntaxPath ? (
            <SyntaxSettingsView
              vault={vault}
              path={primarySyntaxPath}
              onOpenInTab={
                onOpenFileInTab && !isSystemSettingsPath(primarySyntaxPath)
                  ? () => {
                      onOpenFileInTab(primarySyntaxPath);
                      onClose();
                    }
                  : undefined
              }
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <Keyboard className="h-8 w-8 text-[var(--obs-text-faint,#666)]" />
              <div className="text-[14px] font-medium text-[var(--obs-text-normal,#e2e2e2)]">
                볼트에 아직 표준 .vsyntax 규격 파일이 없습니다.
              </div>
              <button
                type="button"
                onClick={() => ensurePrimarySyntaxFile()}
                className="rounded-md bg-[var(--obs-accent,#8a5cf5)] px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90"
              >
                표준 기호 규격(.vibedoc/element-registry.vsyntax) 생성하기
              </button>
            </div>
          ),
      },
      {
        id: "options:files",
        group: "options",
        label: "파일 및 링크",
        subtitle: "전역 표준 사양(.vibedoc) vs 개별 문서 확장자 아키텍처",
        icon: <Link2 className="h-4 w-4" />,
        keywords: ["파일", "링크", "확장자", "vdoc", "vsyntax", "vstyle", "outline", "ref", "포인터", "vibedoc"],
        render: () => (
          <div className="h-full overflow-y-auto px-8 py-6">
            <div className="mx-auto max-w-[780px] space-y-5">
              <div>
                <h2 className="text-[18px] font-semibold text-[var(--obs-text-normal,#ececec)]">
                  파일 및 링크 (Code as Doc)
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                  전역 표준 사양(기호 규격 · CSS 기본 사양)은 옵시디언의 <code className="font-code">.obsidian/</code>처럼{" "}
                  <code className="font-code">.vibedoc/</code>에 숨겨져 이 설정창에서만 관리되며,
                  파일 탐색기에는 각 프로젝트·문서에 실제로 적용되는 개별 파일만 깔끔하게 표시됩니다.
                </p>
              </div>
              <div className="rounded-xl border border-[var(--obs-border-subtle,#2b2b2b)] bg-[var(--obs-bg-secondary,#242424)] px-5 py-3">
                <SettingRow
                  title=".vibedoc/element-registry.vsyntax — 전역 표준 기호 규격"
                  description="표, 섹션 등 모든 Element 표준 기호와 문서 프로파일(Blog/A4/Web) 정의 (탐색기 숨김 · 설정창 전용)"
                >
                  <span className="rounded bg-indigo-500/15 px-2 py-0.5 font-code text-[11px] font-semibold text-indigo-300">
                    표준 SYNTAX
                  </span>
                </SettingRow>
                <SettingRow
                  title=".vibedoc/standard.vstyle — 전역 CSS 표준 스타일 사양"
                  description="특정 장르에 종속되지 않은 5대 Grid Kit 표준 속성·토큰·기본값 사양 (탐색기 숨김 · 설정창 전용)"
                >
                  <span className="rounded bg-cyan-500/15 px-2 py-0.5 font-code text-[11px] font-semibold text-cyan-300">
                    표준 STYLE
                  </span>
                </SettingRow>
                <SettingRow
                  title="프로젝트별 .vstyle — 개별 적용 스타일"
                  description="특정 문서(예: 블로그, RFP, 서식, 기사)에 개별 적용되는 스타일 파일 (해당 프로젝트 폴더에 배치)"
                >
                  <span className="rounded bg-cyan-500/15 px-2 py-0.5 font-code text-[11px] font-semibold text-cyan-300">
                    개별 STYLE · {individualStylePaths.length}개
                  </span>
                </SettingRow>
                <SettingRow
                  title=".vdoc / .outline / .ref — 작업 문서 · 아웃라인 · 표본"
                  description="본문 구조와 schemaRef/styleRef 포인터를 연결해 렌더링하는 1급 작업 파일"
                >
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-code text-[11px] font-semibold text-emerald-300">
                    VDOC · OUTLINE · REF
                  </span>
                </SettingRow>
              </div>
            </div>
          </div>
        ),
      },

      // ---- 2. 요소 규격 (.vsyntax) — 동적 Element 목록 ----
      ...syntaxSnapshot.elements.map((el) => {
        const elConflicts = detectSyntaxRuleConflicts(syntaxSnapshot, el.id).totalConflicts;
        return {
          id: `element:${el.id}`,
          group: "elements" as const,
          label: el.label,
          subtitle: `<<view:${el.viewTag}>> · ${el.rules.length}개 기호`,
          icon: el.id === "table" ? <Table2 className="h-4 w-4" /> : <Layers className="h-4 w-4" />,
          keywords: [
            el.id,
            el.label,
            el.viewTag,
            el.description,
            ...el.rules.map((r) => r.symbol),
            ...el.rules.map((r) => r.description),
          ],
          badge: elConflicts > 0 ? `충돌 ${elConflicts}` : String(el.rules.length),
          render: () =>
            primarySyntaxPath ? (
              <SyntaxSettingsView
                vault={vault}
                path={primarySyntaxPath}
                scopeElementId={el.id}
                onOpenInTab={
                  onOpenFileInTab && !isSystemSettingsPath(primarySyntaxPath)
                    ? () => {
                        onOpenFileInTab(primarySyntaxPath);
                        onClose();
                      }
                    : undefined
                }
              />
            ) : null,
        };
      }),

      // ---- 3. 스타일 팩 (.vstyle) — 동적 파일 목록 ----
      ...styleCatalog.map((item) => ({
        id: `style:${item.path}`,
        group: "styles" as const,
        label: item.name,
        subtitle: item.fileName,
        icon: (
          <span
            className="flex h-4 w-4 items-center justify-center rounded-[4px] border border-white/15"
            style={{ backgroundColor: item.canvasBg }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.primaryAccent }}
            />
          </span>
        ),
        keywords: [item.name, item.fileName, item.description, "vstyle", "스타일", "style"],
        render: () => (
          <StylePackSettingsView
            vault={vault}
            path={item.path}
            onOpenInTab={
              onOpenFileInTab
                ? () => {
                    onOpenFileInTab(item.path);
                    onClose();
                  }
                : undefined
            }
          />
        ),
      })),

      // ---- 4. AI & 하네스 (향후 대규모 설정 확장을 위한 플러그인형 그룹) ----
      {
        id: "ai:models",
        group: "ai-harness",
        label: "모델 · 공급자",
        subtitle: "LLM 라우팅 및 API 자격 증명 슬롯",
        icon: <Cpu className="h-4 w-4" />,
        keywords: ["ai", "모델", "llm", "gemini", "gemma", "공급자", "api", "키"],
        badge: "확장 슬롯",
        render: () => (
          <div className="h-full overflow-y-auto px-8 py-6">
            <div className="mx-auto max-w-[780px] space-y-5">
              <div>
                <h2 className="text-[18px] font-semibold text-[var(--obs-text-normal,#ececec)]">
                  AI 모델 · 공급자
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                  향후 AI-Composer, 문서 스캐폴딩, 스타일 자동 추출에 연결될 LLM 공급자와 라우팅
                  설정이 이 레지스트리 섹션에 플러그인 형태로 확장됩니다.
                </p>
              </div>
              <div className="rounded-xl border border-[var(--obs-border-subtle,#2b2b2b)] bg-[var(--obs-bg-secondary,#242424)] px-5 py-3">
                <SettingRow
                  title="기본 추론 모델 프로필"
                  description="문서 구조 설계 및 스타일 추출에 사용할 주력 모델 슬롯입니다."
                >
                  <span className="rounded bg-[rgba(138,92,245,0.16)] px-2.5 py-1 font-code text-[11.5px] text-[#c4b5fd]">
                    Gemini-3.1-pro / Gemma4 31b (예정)
                  </span>
                </SettingRow>
                <SettingRow
                  title="경량 빠른 편집 모델"
                  description="인라인 자동 완성 및 빠른 기호 제안에 사용할 저지연 모델 슬롯입니다."
                >
                  <span className="rounded bg-[var(--obs-bg-primary,#1a1a1a)] px-2.5 py-1 font-code text-[11.5px] text-[var(--obs-text-muted,#aaa)]">
                    Gemini-3.5-flash-lite (예정)
                  </span>
                </SettingRow>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "ai:harness",
        group: "ai-harness",
        label: "에이전트 하네스",
        subtitle: "2D 디렉팅 · 승인 게이트 · 텔레메트리",
        icon: <Bot className="h-4 w-4" />,
        keywords: ["하네스", "harness", "agent", "에이전트", "디렉팅", "승인", "텔레메트리"],
        render: () => (
          <div className="h-full overflow-y-auto px-8 py-6">
            <div className="mx-auto max-w-[780px] space-y-5">
              <div>
                <h2 className="text-[18px] font-semibold text-[var(--obs-text-normal,#ececec)]">
                  에이전트 하네스
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                  2D 캔버스 디렉팅, 다단계 스캐폴딩 승인(HITL), 그리고 관측 텔레메트리 연결
                  정책이 등록될 확장 영역입니다.
                </p>
              </div>
              <div className="rounded-xl border border-[var(--obs-border-subtle,#2b2b2b)] bg-[var(--obs-bg-secondary,#242424)] px-5 py-3">
                <SettingRow
                  title="SettingsSectionRegistry 확장 아키텍처"
                  description="새 하네스나 AI 플러그인은 register() 한 줄로 이 좌측 메뉴와 통합 검색에 자동 등록됩니다."
                >
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 font-code text-[11px] text-emerald-300">
                    <Sparkles className="h-3 w-3" />
                    Ready
                  </span>
                </SettingRow>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "ai:crawler",
        group: "ai-harness",
        label: "레퍼런스 수집 (.ref)",
        subtitle: "웹 URL 파서 · 스타일 자동 추출기",
        icon: <Globe className="h-4 w-4" />,
        keywords: ["레퍼런스", "ref", "수집", "크롤러", "url", "스타일 추출"],
        render: () => (
          <div className="h-full overflow-y-auto px-8 py-6">
            <div className="mx-auto max-w-[780px] space-y-5">
              <div>
                <h2 className="text-[18px] font-semibold text-[var(--obs-text-normal,#ececec)]">
                  레퍼런스 수집 (.ref)
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--obs-text-muted,#9a9a9a)]">
                  외부 웹 문서나 PDF 표본을 .ref로 가져올 때 자동 스타일 추출(.vstyle)과 아웃라인
                  분해(.outline) 규칙을 구성하는 영역입니다.
                </p>
              </div>
              <div className="rounded-xl border border-[var(--obs-border-subtle,#2b2b2b)] bg-[var(--obs-bg-secondary,#242424)] px-5 py-3">
                <SettingRow
                  title="기본 레퍼런스 저장 폴더"
                  description="Import Reference로 가져온 .ref 표본이 저장되는 기본 볼트 경로입니다."
                >
                  <span className="inline-flex items-center gap-1 rounded bg-[var(--obs-bg-primary,#1a1a1a)] px-2.5 py-1 font-code text-[11.5px] text-[var(--obs-text-normal,#dadada)]">
                    <FolderCog className="h-3 w-3 text-amber-400" />
                    00. References
                  </span>
                </SettingRow>
                <SettingRow
                  title="스타일 자동 추출기 (@vibe/style-core)"
                  description=".ref 원천 메타데이터에서 5대 Grid Kit 기반 .vstyle 팩을 자동 생성합니다."
                >
                  <span className="inline-flex items-center gap-1 rounded bg-cyan-500/15 px-2 py-0.5 font-code text-[11px] text-cyan-300">
                    <FileCode2 className="h-3 w-3" />
                    활성화됨
                  </span>
                </SettingRow>
              </div>
            </div>
          </div>
        ),
      },

      ...extraSections,
    ];

    return createSettingsSectionRegistry(sections);
  }, [
    theme,
    onChangeTheme,
    vault,
    syntaxSnapshot,
    conflictSummary.totalConflicts,
    styleCatalog,
    primarySyntaxPath,
    standardStylePath,
    individualStylePaths.length,
    onOpenFileInTab,
    onClose,
    ensurePrimarySyntaxFile,
    ensureStandardStyleFile,
    handleUpdateProfileWidth,
    extraSections,
  ]);

  const filteredSections = useMemo(
    () => registry.search(searchQuery),
    [registry, searchQuery]
  );

  // Ensure activeSectionId always points to a valid section
  const activeSection = useMemo(() => {
    const exact = registry.get(activeSectionId);
    if (exact && (!searchQuery.trim() || filteredSections.some((s) => s.id === exact.id))) {
      return exact;
    }
    return filteredSections[0] ?? registry.listAll()[0] ?? null;
  }, [registry, activeSectionId, searchQuery, filteredSections]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="VibeDoc Settings"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--obs-bg-primary,#1e1e1e)] text-[var(--obs-text-normal,#dadada)]"
    >
      {/* Top Obsidian-style Title Bar */}
      <header className="flex h-9 shrink-0 select-none items-center justify-between border-b border-[var(--obs-border-subtle,#2b2b2b)] bg-[var(--obs-bg-secondary-alt,#1a1a1a)] px-4">
        <div className="flex items-center gap-2 text-[12px] text-[var(--obs-text-muted,#a6a6a6)]">
          <span className="font-semibold text-[var(--obs-text-normal,#e2e2e2)]">설정</span>
          <span className="text-[var(--obs-text-faint,#666)]">—</span>
          <span>{vault.name}</span>
          <span className="text-[var(--obs-text-faint,#666)]">—</span>
          <span className="font-code text-[11px] text-[var(--obs-text-faint,#777)]">
            VibeDoc Studio
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded border border-[var(--obs-border-subtle,#323232)] px-1.5 py-0.5 font-code text-[10px] text-[var(--obs-text-faint,#777)]">
            ESC
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="설정 닫기"
            title="설정 닫기 (Esc)"
            className="flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--obs-text-muted,#a6a6a6)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.08))] hover:text-[var(--obs-text-normal,#ffffff)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Split Shell: 236px Left Settings Rail + Right Content Stage */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav
          aria-label="Settings Navigation"
          className="flex w-[240px] shrink-0 flex-col border-r border-[var(--obs-border-subtle,#2b2b2b)] bg-[var(--obs-bg-secondary,#202020)]"
        >
          {/* Obsidian Pinned Search Bar */}
          <div className="shrink-0 p-3 pb-2">
            <div className="flex items-center gap-2 rounded-[6px] border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1a1a1a)] px-2.5 py-1.5 focus-within:border-[var(--obs-accent,#8a5cf5)]">
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--obs-text-faint,#777)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="설정 검색..."
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--obs-text-normal,#e2e2e2)] placeholder:text-[var(--obs-text-faint,#777)] outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-[var(--obs-text-faint,#777)] hover:text-[var(--obs-text-normal,#dadada)]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Grouped Navigation Rail */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            {SETTINGS_GROUPS.map((group) => {
              const items = filteredSections.filter((s) => s.group === group.id);
              if (items.length === 0 && !(group.id === "styles" && !searchQuery.trim())) {
                return null;
              }
              return (
                <div key={group.id} className="mt-4 first:mt-1.5">
                  <div className="mb-1 flex items-center justify-between px-2.5 text-[11px] font-semibold text-[var(--obs-text-faint,#7c7c7c)]">
                    <span>{group.label}</span>
                    {group.id === "styles" && (
                      <button
                        type="button"
                        onClick={() => setCreatingStyle((v) => !v)}
                        title="새 스타일 팩(.vstyle) 만들기"
                        className="rounded p-0.5 text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.08))] hover:text-cyan-300"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {group.id === "styles" && creatingStyle && (
                    <form
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        handleCreateStylePack();
                      }}
                      className="mx-1 mb-1.5 rounded-md border border-[var(--obs-border,#383838)] bg-[var(--obs-bg-primary,#1a1a1a)] p-2"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={newStyleName}
                        onChange={(e) => setNewStyleName(e.target.value)}
                        placeholder="스타일 이름 (예: 사내 보고서)"
                        className="w-full bg-transparent text-[11.5px] text-[var(--obs-text-normal,#e2e2e2)] placeholder:text-[var(--obs-text-faint,#666)] outline-none"
                      />
                      <div className="mt-1.5 flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setCreatingStyle(false);
                            setNewStyleName("");
                          }}
                          className="rounded px-1.5 py-0.5 text-[10.5px] text-[var(--obs-text-muted,#999)] hover:bg-white/5"
                        >
                          취소
                        </button>
                        <button
                          type="submit"
                          className="rounded bg-[var(--obs-accent,#8a5cf5)] px-2 py-0.5 text-[10.5px] font-medium text-white hover:opacity-90"
                        >
                          생성
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-0.5">
                    {items.map((item) => {
                      const isActive = activeSection?.id === item.id;
                      const isConflictBadge = item.badge?.startsWith("충돌");
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveSectionId(item.id)}
                          className={`flex w-full items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                            isActive
                              ? "bg-[var(--obs-bg-hover,rgba(255,255,255,0.095))] font-medium text-[var(--obs-text-normal,#ffffff)]"
                              : "text-[var(--obs-text-muted,#b8b8b8)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.05))] hover:text-[var(--obs-text-normal,#ececec)]"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={`shrink-0 ${
                                isActive
                                  ? "text-[var(--obs-text-normal,#ffffff)]"
                                  : "text-[var(--obs-text-muted,#999)]"
                              }`}
                            >
                              {item.icon}
                            </span>
                            <span className="truncate">{item.label}</span>
                          </span>
                          {item.badge && (
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 font-code text-[10px] ${
                                isConflictBadge
                                  ? "bg-[#7f1d1d]/70 font-semibold text-[#fca5a5]"
                                  : "bg-[var(--obs-bg-primary,#1a1a1a)] text-[var(--obs-text-faint,#888)]"
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {filteredSections.length === 0 && (
              <div className="px-3 py-8 text-center text-[12px] text-[var(--obs-text-faint,#777)]">
                &ldquo;{searchQuery}&rdquo;에 일치하는 설정이 없습니다.
              </div>
            )}
          </div>
        </nav>

        {/* Right Content Area */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)]">
          {activeSection ? (
            <div key={activeSection.id} className="min-h-0 flex-1 overflow-hidden">
              {activeSection.render()}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-[var(--obs-text-faint,#777)]">
              좌측에서 설정 항목을 선택하세요.
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
