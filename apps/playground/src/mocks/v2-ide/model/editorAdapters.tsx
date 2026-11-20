import React from "react";
import {
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

import type { VDocUiBridgeStore } from "./vdocUiBridge";
import { CodeTabEditor } from "../ui/CodeTabEditor";
import {
  MarkdownStructurePanel,
  OutlineStructurePanel,
  VDocFigmaStructurePanel,
} from "../ui/DocumentStructurePanels";
import { LazyVaultFileGate } from "../ui/LazyVaultFileGate";
import { ImageTabViewer, PdfTabViewer } from "../ui/MediaTabViewers";
import { OutlineTabEditor } from "../ui/OutlineTabEditor";
import { RefStructurePanel, RefTabEditor } from "../ui/RefTabEditor";
import { StyleStructurePanel, StyleTabEditor } from "../ui/StyleTabEditor";
import { SyntaxStructurePanel, SyntaxTabEditor } from "../ui/SyntaxTabEditor";
import { VDocTabEditor } from "../ui/VDocTabEditor";

export interface IdeEditorEnv {
  readonly vault: VaultPort;
  readonly metadataCache: VaultMetadataCache;
  readonly vdocUiBridge: VDocUiBridgeStore;
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
  ({ host }) => (
    <LazyVaultFileGate vault={host.env.vault} path={host.path}>
      <ObsidianMarkdownEditor
        vault={host.env.vault}
        path={host.path}
        metadataCache={host.env.metadataCache}
        onOpenLink={(target, mode) => host.openLink(target, mode)}
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
  ),
  areHostPropsStable
);

const OutlinerAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => (
    <LazyVaultFileGate vault={host.env.vault} path={host.path}>
      <OutlineTabEditor
        vault={host.env.vault}
        path={host.path}
        openFile={(target) => host.openLink(target, "split-right")}
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

const ImageAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => <ImageTabViewer vault={host.env.vault} path={host.path} />,
  areHostPropsStable
);

const PdfAdapterView = React.memo<{ host: EditorHostContext<IdeEditorEnv> }>(
  ({ host }) => <PdfTabViewer vault={host.env.vault} path={host.path} />,
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
