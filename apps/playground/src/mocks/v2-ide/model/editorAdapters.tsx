import React from "react";
import { FileCode2, FileImage, FileText, LayoutTemplate, ListTree } from "lucide-react";
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
import { VDocTabEditor } from "../ui/VDocTabEditor";

export interface IdeEditorEnv {
  readonly vault: VaultPort;
  readonly metadataCache: VaultMetadataCache;
  readonly vdocUiBridge: VDocUiBridgeStore;
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
      <OutlineTabEditor vault={host.env.vault} path={host.path} />
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
    },
    Component: OutlinerAdapterView,
    OutlineComponent: OutlineStructurePanel,
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
