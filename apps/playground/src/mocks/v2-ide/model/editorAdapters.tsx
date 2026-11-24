import React from "react";
import {
  Blocks,
  BookOpen,
  FileCode2,
  FileImage,
  FileText,
  Keyboard,
  LayoutTemplate,
  ListTree,
  Palette,
} from "lucide-react";
import { ObsidianMarkdownEditor } from "@vibe/markdown-editor/ui";
import type { VaultMetadataCache, VaultPort } from "@vibe/vault-core";
import {
  createEditorRegistry,
  type DocumentEditorAdapter,
  type EditorHostContext,
  type EditorRegistry,
} from "@vibe/workspace-layout/core";

import type { V2AiWorkspace } from "@vibe/ai-vault";
import type { VDocStore } from "@vibe/vault-formats";
import type { VDocUiBridgeStore } from "@vibe/canvas-state";
import {
  MarkdownStructurePanel,
  OutlineStructurePanel,
  VDocFigmaStructurePanel,
} from "../ui/DocumentStructurePanels";
import { LazyVaultFileGate } from "../ui/LazyVaultFileGate";
import { VDocTabEditor } from "../ui/VDocTabEditor";
import {
  clearResourceHighlight,
  openResourceTagInPair,
  subscribeResourceHighlight,
  type ResourceHighlightRequest,
} from "./resourceHighlightBus";

// 처음 화면(.vdoc · .md)에 없는 편집기는 그 파일을 열 때 싣는다 (코드 분할 — 부팅 때 아웃라이너 · 레퍼런스 · 에셋 코드를 받지 않는다)
const OutlineTabEditor = React.lazy(() => import("../ui/OutlineTabEditor").then((m) => ({ default: m.OutlineTabEditor })));
const RefTabEditor = React.lazy(() => import("../ui/RefTabEditor").then((m) => ({ default: m.RefTabEditor })));
const LazyRefStructurePanel = React.lazy(() => import("../ui/RefTabEditor").then((m) => ({ default: m.RefStructurePanel })));
const StyleTabEditor = React.lazy(() => import("../ui/StyleTabEditor").then((m) => ({ default: m.StyleTabEditor })));
const LazyStyleStructurePanel = React.lazy(() => import("../ui/StyleTabEditor").then((m) => ({ default: m.StyleStructurePanel })));
const SyntaxTabEditor = React.lazy(() => import("../ui/SyntaxTabEditor").then((m) => ({ default: m.SyntaxTabEditor })));
const LazySyntaxStructurePanel = React.lazy(() => import("../ui/SyntaxTabEditor").then((m) => ({ default: m.SyntaxStructurePanel })));
const AssetTabEditor = React.lazy(() => import("../ui/AssetTabEditor").then((m) => ({ default: m.AssetTabEditor })));
const LazyAssetStructurePanel = React.lazy(() => import("../ui/AssetTabEditor").then((m) => ({ default: m.AssetStructurePanel })));
const ImageTabViewer = React.lazy(() => import("../ui/MediaTabViewers").then((m) => ({ default: m.ImageTabViewer })));
const PdfTabViewer = React.lazy(() => import("../ui/MediaTabViewers").then((m) => ({ default: m.PdfTabViewer })));
const CodeTabEditor = React.lazy(() => import("../ui/CodeTabEditor").then((m) => ({ default: m.CodeTabEditor })));

/** 지연 로딩 구조 패널 — 패널 자리에서 잠깐 비워 둔다. */
function suspended<P extends object>(Lazy: React.ComponentType<P>): React.FC<P> {
  const Wrapped: React.FC<P> = (props) => (
    <React.Suspense fallback={null}>
      <Lazy {...props} />
    </React.Suspense>
  );
  return Wrapped;
}
const RefStructurePanel = suspended(LazyRefStructurePanel);
const StyleStructurePanel = suspended(LazyStyleStructurePanel);
const SyntaxStructurePanel = suspended(LazySyntaxStructurePanel);
const AssetStructurePanel = suspended(LazyAssetStructurePanel);

export interface IdeEditorEnv {
  readonly vault: VaultPort;
  readonly metadataCache: VaultMetadataCache;
  readonly vdocUiBridge: VDocUiBridgeStore;
  /** AI Composer 워크스페이스 (아웃라인 인라인 Unified Diff 검토 · 승인 연동용). */
  readonly ai?: V2AiWorkspace;
  /** 경로별 `.vdoc` 캐시 — 읽기는 `docs.get`, 쓰기는 `docs.write` (다시 파싱하지 않고 다른 화면에 전한다). */
  readonly docs: VDocStore;
  /** 같은 Chrome 스타일 그룹 탭에 추가하고 페어 뷰 슬롯을 치환해 연다. */
  readonly openInPairTabGroup?: (
    targetPath: string,
    options?: { readonly sourceTabId?: string; readonly sourcePath?: string }
  ) => void;
  readonly openImportReferenceModal?: (replaceRefPath?: string) => void;
  readonly startAsyncUrlRefImport?: (opts: {
    readonly url: string;
    readonly title?: string;
    readonly targetFolder: string;
    readonly replacePath?: string | null;
    readonly fileName?: string;
  }) => void;
  /** Names a `.ref` after content was imported into it (typed name, else the source title). */
  readonly settleRefFileName?: (
    path: string,
    options: { readonly fileName?: string; readonly wasEmpty: boolean }
  ) => string;
}

const areHostPropsStable = (
  prev: { readonly host: EditorHostContext<IdeEditorEnv> },
  next: { readonly host: EditorHostContext<IdeEditorEnv> }
): boolean =>
  prev.host.path === next.host.path &&
  prev.host.tabId === next.host.tabId &&
  prev.host.groupId === next.host.groupId &&
  prev.host.viewType === next.host.viewType &&
  prev.host.env === next.host.env;

const VDocAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => (
    <LazyVaultFileGate vault={host.env.vault} path={host.path}>
      <VDocTabEditor host={host} />
    </LazyVaultFileGate>
  ),
  areHostPropsStable
);

const ObsidianMarkdownAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => {
    const [highlight, setHighlight] = React.useState<ResourceHighlightRequest | null>(null);
    React.useEffect(
      () => subscribeResourceHighlight(host.path, (req) => setHighlight(req)),
      [host.path]
    );

    return (
      <LazyVaultFileGate vault={host.env.vault} path={host.path}>
        <ObsidianMarkdownEditor
          vault={host.env.vault}
          path={host.path}
          metadataCache={host.env.metadataCache}
          onOpenLink={(target, mode) => {
            if (host.env.openInPairTabGroup && mode === "current") {
              host.env.openInPairTabGroup(target, {
                sourceTabId: host.tabId,
                sourcePath: host.path,
              });
            } else {
              host.openLink(target, mode);
            }
          }}
          onOpenResource={(rawTag) => {
            openResourceTagInPair(rawTag, {
              vault: host.env.vault,
              sourcePath: host.path,
              openInPair: (targetPath) => {
                if (host.env.openInPairTabGroup) {
                  host.env.openInPairTabGroup(targetPath, {
                    sourceTabId: host.tabId,
                    sourcePath: host.path,
                  });
                } else {
                  host.openLink(targetPath, "split-right");
                }
              },
            });
          }}
          highlightRequest={highlight}
          onClearHighlight={() => clearResourceHighlight(host.path)}
          onRenameSelf={(newName) => host.renameSelf(newName)}
          onSelectionChange={(sel) => {
            if (!host.reportSelection) return;
            if (!sel) {
              host.reportSelection(null);
              return;
            }
            host.reportSelection({
              resourceId: host.path,
              kind: "text",
              summary: `${host.path} (L${sel.lineRange[0]}-L${sel.lineRange[1]})`,
              text: sel.text,
              lineRange: sel.lineRange,
            });
          }}
        />
      </LazyVaultFileGate>
    );
  },
  areHostPropsStable
);

const OutlinerAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => (
    <LazyVaultFileGate vault={host.env.vault} path={host.path}>
      <OutlineTabEditor
        vault={host.env.vault}
        path={host.path}
        vdocUiBridge={host.env.vdocUiBridge}
        ai={host.env.ai}
        reportSelection={host.reportSelection}
        onAiDirect={(prompt, nodeIds) =>
          host.dispatchAiDirective?.({
            prompt: prompt ?? "",
            resourceId: host.path,
            ...(nodeIds?.length
              ? { selection: { resourceId: host.path, kind: "outline-nodes", summary: `불릿 ${nodeIds.length}개`, nodeIds: [...nodeIds] } }
              : {}),
          })
        }
        openFile={(target) => {
          if (host.env.openInPairTabGroup) {
            host.env.openInPairTabGroup(target, {
              sourceTabId: host.tabId,
              sourcePath: host.path,
            });
          } else {
            host.openLink(target, "split-right");
          }
        }}
        openLink={(target, mode) => host.openLink(target, mode ?? "split-right")}
        openInPairGroup={(target) => {
          if (host.env.openInPairTabGroup) {
            host.env.openInPairTabGroup(target, {
              sourceTabId: host.tabId,
              sourcePath: host.path,
            });
          } else {
            host.openLink(target, "split-right");
          }
        }}
      />
    </LazyVaultFileGate>
  ),
  areHostPropsStable
);

const RefCanvasAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => (
    <LazyVaultFileGate vault={host.env.vault} path={host.path}>
      <RefTabEditor host={host} />
    </LazyVaultFileGate>
  ),
  areHostPropsStable
);

const SyntaxAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => (
    <LazyVaultFileGate vault={host.env.vault} path={host.path}>
      <SyntaxTabEditor host={host} />
    </LazyVaultFileGate>
  ),
  areHostPropsStable
);

const StyleAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => (
    <LazyVaultFileGate vault={host.env.vault} path={host.path}>
      <StyleTabEditor host={host} />
    </LazyVaultFileGate>
  ),
  areHostPropsStable
);

const AssetAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => (
    <LazyVaultFileGate vault={host.env.vault} path={host.path}>
      <AssetTabEditor host={host} />
    </LazyVaultFileGate>
  ),
  areHostPropsStable
);

const ImageAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => (
    <React.Suspense fallback={null}>
      <ImageTabViewer vault={host.env.vault} path={host.path} />
    </React.Suspense>
  ),
  areHostPropsStable
);

const PdfAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => (
    <React.Suspense fallback={null}>
      <PdfTabViewer vault={host.env.vault} path={host.path} />
    </React.Suspense>
  ),
  areHostPropsStable
);

const RawCodeAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => (
    <LazyVaultFileGate vault={host.env.vault} path={host.path}>
      <CodeTabEditor vault={host.env.vault} path={host.path} />
    </LazyVaultFileGate>
  ),
  areHostPropsStable
);

export const BUILTIN_IDE_EDITOR_ADAPTERS: readonly DocumentEditorAdapter<IdeEditorEnv>[] = [
  {
    id: "vibe-vdoc",
    label: "2D Canvas (.vdoc)",
    description: "판다독 4층 페이지 + 피그마 2D 좌표/레이어 하이브리드 캔버스 에디터",
    extensions: ["vdoc", "vdoc.json"],
    priority: 100,
    icon: LayoutTemplate,
    capabilities: {
      canEdit: true,
      supportsAiSelection: true,
      acceptsCanvasDrop: true,
    },
    Component: VDocAdapterView,
    OutlineComponent: VDocFigmaStructurePanel,
  },
  {
    id: "obsidian-markdown",
    label: "Markdown (Live Preview)",
    description: "CodeMirror 6 기반 Obsidian Tier-1 마크다운 에디터",
    extensions: ["md", "markdown"],
    priority: 100,
    icon: FileText,
    capabilities: {
      canEdit: true,
      supportsSourceToggle: true,
      supportsAiSelection: true,
    },
    Component: ObsidianMarkdownAdapterView,
    OutlineComponent: MarkdownStructurePanel,
  },
  {
    id: "vibe-outliner",
    label: "Outliner (.outline)",
    description: "정식 .outline 트리 / 보드 문서 편집 엔진",
    extensions: ["outline"],
    priority: 100,
    icon: ListTree,
    capabilities: {
      canEdit: true,
      // 가운데에 놓은 파일은 탭으로 열지 않고 아웃라인 불릿에 첨부한다 (가장자리는 여전히 탭 분할).
      acceptsCanvasDrop: true,
    },
    Component: OutlinerAdapterView,
    OutlineComponent: OutlineStructurePanel,
  },
  {
    id: "vibe-ref",
    label: "Reference Canvas (.ref)",
    description: "통합 정규화 2D Canvas + Block IR + 핀 · 층위 · AI 합의 레퍼런스 워크스페이스",
    extensions: ["ref"],
    priority: 100,
    icon: BookOpen,
    capabilities: {
      canEdit: true,
      supportsAiSelection: true,
    },
    Component: RefCanvasAdapterView,
    OutlineComponent: RefStructurePanel,
  },
  {
    id: "vibe-syntax",
    label: "Syntax Rules (.vsyntax)",
    description: "옵시디언 단축키 스타일의 아웃라인 · 문서 요소 표현 기호 비주얼 설정",
    extensions: ["vsyntax"],
    priority: 100,
    icon: Keyboard,
    capabilities: {
      canEdit: true,
      supportsSourceToggle: true,
    },
    Component: SyntaxAdapterView,
    OutlineComponent: SyntaxStructurePanel,
  },
  {
    id: "vibe-style",
    label: "Style Pack (.vstyle)",
    description: "5대 Grid Kit 토큰 · 실시간 프리뷰 기반 비주얼 스타일 팩 에디터",
    extensions: ["vstyle", "vstyle.json"],
    priority: 100,
    icon: Palette,
    capabilities: {
      canEdit: true,
      supportsSourceToggle: true,
    },
    Component: StyleAdapterView,
    OutlineComponent: StyleStructurePanel,
  },
  {
    id: "vibe-asset",
    label: "Structural Asset (.vasset)",
    description: "AI-Native 재사용 구조 에셋(.outline 골격 + 뉘앙스 규칙 + 2D 라이브 프리뷰) 에디터",
    extensions: ["vasset", "vasset.json"],
    priority: 100,
    icon: Blocks,
    capabilities: {
      canEdit: true,
      supportsSourceToggle: true,
    },
    Component: AssetAdapterView,
    OutlineComponent: AssetStructurePanel,
  },
  {
    id: "media-image",
    label: "Image Viewer",
    description: "바이너리 스트리밍 기반 이미지 뷰어 (.png/.jpg/.svg/.gif/.webp)",
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
    priority: 100,
    icon: FileImage,
    capabilities: {
      canEdit: false,
    },
    Component: ImageAdapterView,
  },
  {
    id: "media-pdf",
    label: "PDF Viewer",
    description: "브라우저 네이티브 PDF 프리뷰어 (.pdf)",
    extensions: ["pdf"],
    priority: 100,
    icon: FileText,
    capabilities: {
      canEdit: false,
    },
    Component: PdfAdapterView,
  },
  {
    id: "raw-code",
    label: "Raw Source / Code",
    description: "줄 번호 기반 원본 텍스트·JSON·코드 에디터",
    extensions: ["*"],
    priority: 10,
    icon: FileCode2,
    capabilities: {
      canEdit: true,
    },
    Component: RawCodeAdapterView,
  },
];

export function createIdeEditorRegistry(): EditorRegistry<IdeEditorEnv> {
  return createEditorRegistry<IdeEditorEnv>(BUILTIN_IDE_EDITOR_ADAPTERS);
}
