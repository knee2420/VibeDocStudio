/**
 * @vibe/ref-canvas — Normalized `.ref` v1 IR types.
 *
 * Unifies PDF, Web (tiled shots / DOM layout / static HTML), Image, Markdown, VDoc,
 * and multi-screen UI flows onto a single 2D Canvas (`frames[]`, 0..1000 coordinates)
 * + Structured Block IR (`blocks[]`) + Reference Agent Harness (`pins[]`, `layers`, `consensus[]`).
 */

export type RefOriginType =
  | "pdf"
  | "web"
  | "image"
  | "markdown"
  | "vdoc"
  | "html"
  | "office"
  | "composite"
  | "unknown";

export type RefSurfaceKind = "pdf-page" | "image" | "web-tile" | "semantic-canvas";

export type RefBlockKind =
  | "heading"
  | "text"
  | "list"
  | "table"
  | "callout"
  | "media"
  | "media-group"
  | "link-card"
  | "divider"
  | "ui-region";

export type RefDocumentStatus =
  | "empty"
  | "ingesting"
  | "raw"
  | "framed"
  | "structured"
  | "analyzed"
  | "failed";

export interface RefIngestProgress {
  readonly stage: string;
  readonly message: string;
  readonly percent: number;
  readonly startedAt: number;
  readonly targetUrl?: string;
}

export type RefPinKind = "region" | "text" | "memo";

export type RefConsensusAdoption = "follow" | "consult" | "exclude";

/** Normalized 0..1000 bounding box: [ymin, xmin, ymax, xmax] within its owning frame. */
export type RefBBox = readonly [number, number, number, number];

export interface RefSourcePointer {
  readonly originType: RefOriginType;
  /** Pointer to the original asset: `vault://path`, `https://...`, `/api/reference/...`, etc. */
  readonly uri: string;
  readonly sourceName?: string;
  readonly sourceUrl?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  /** Backing backend reference ID when imported from `/api/reference`. */
  readonly serverRefId?: string;
  readonly capturedAt?: number;
}

export interface RefFrame {
  readonly frameId: string;
  /** 1-based frame index (corresponds to `#f<index>` and legacy `#p<index>`). */
  readonly index: number;
  readonly surfaceKind: RefSurfaceKind;
  readonly width: number;
  readonly height: number;
  readonly label?: string;
  /** Binary URL for `pdf-page` (PDF document URL), `image`, or `web-tile` PNG. */
  readonly assetUrl?: string;
  /** 1-based PDF page number when `surfaceKind === "pdf-page"`. */
  readonly pageNumber?: number;
  /** Vertical scroll offset in px when `surfaceKind === "web-tile"`. */
  readonly scrollY?: number;
  readonly sections?: readonly number[];
  readonly title?: string;
}

export interface RefBlockMedia {
  readonly count?: number;
  readonly role?: string;
  readonly widthPx?: number | null;
  readonly widths?: readonly (number | string)[];
  readonly src?: readonly string[];
  readonly url?: string;
  readonly domain?: string;
  readonly thumbnail?: boolean;
  readonly variant?: string;
  readonly columns?: number;
}

export interface RefBlock {
  readonly id: string;
  /** 1-based frame index matching `RefFrame.index`. */
  readonly frameIndex: number;
  readonly kind: RefBlockKind;
  readonly level?: number;
  readonly text: string;
  readonly html?: string;
  readonly bbox: RefBBox | null;
  /** Original pixel geometry preserved for audit / web re-projection. */
  readonly sourceY?: number;
  readonly sourceHeight?: number;
  readonly style?: Readonly<Record<string, unknown>>;
  readonly media?: RefBlockMedia;
}

export interface RefOutlineEntry {
  readonly blockId: string;
  readonly title: string;
  readonly level: number;
  readonly frameIndex: number;
}

export interface RefPin {
  readonly pinId: string;
  readonly kind: RefPinKind;
  readonly frameIndex: number;
  readonly bbox: RefBBox | null;
  readonly text: string;
  readonly label: string;
  readonly note: string;
  /** Layer tag such as `D1`..`D6`, `U1`..`U7`, `B1`..`B6`, or `""` if untagged. */
  readonly layer: string;
  readonly anchor: string;
  readonly createdAt: number;
}

export interface RefLayerMetric {
  readonly id: string;
  readonly name: string;
  readonly question: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly qualitative: boolean;
}

export interface RefConsensusAlternative {
  readonly reading: string;
  readonly evidence?: readonly string[];
}

export interface RefConsensusCard {
  readonly cardId: string;
  readonly layer: string;
  readonly scope: string;
  readonly adoption: RefConsensusAdoption;
  readonly reading: string;
  readonly evidence: readonly string[];
  readonly alternatives: readonly RefConsensusAlternative[];
  readonly status: "proposed" | "confirmed";
  readonly by?: string;
  readonly at?: number;
}

export interface RefArticleFallback {
  readonly title: string;
  readonly siteName?: string;
  readonly byline?: string;
  readonly url?: string;
  readonly html: string;
  readonly text: string;
}

/**
 * First-class `.ref` file JSON document (version 1).
 */
export interface RefDocument {
  readonly version: 1;
  readonly refId: string;
  readonly title: string;
  readonly status: RefDocumentStatus;
  readonly error?: string;
  readonly ingestProgress?: RefIngestProgress;
  readonly source: RefSourcePointer;
  readonly layerSet: string;
  /** Layer toggles: absent keys default to enabled (`true`). */
  readonly enabledLayers: Readonly<Record<string, boolean>>;
  readonly frames: readonly RefFrame[];
  readonly blocks: readonly RefBlock[];
  readonly outline: readonly RefOutlineEntry[];
  readonly layers: readonly RefLayerMetric[];
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly pins: readonly RefPin[];
  readonly consensus: readonly RefConsensusCard[];
  readonly article?: RefArticleFallback;
  /**
   * Who chose this `.ref` file's name. `"auto"`: the app picked it, so it follows the source's
   * original title once content arrives. `"user"`: a person named it, so it is never renamed.
   */
  readonly nameSource?: "auto" | "user";
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ParsedRefAnchor {
  readonly refId: string;
  readonly frameIndex: number | null;
  readonly section: number | null;
  readonly blockId: string;
  readonly pinId: string;
}

/** Legacy `/api/reference` item bundle input accepted by `normalizeLegacyReferenceBundle`. */
export interface LegacyReferenceBundleInput {
  readonly ref: {
    readonly refId: string;
    readonly kind?: string;
    readonly title?: string;
    readonly sourceName?: string;
    readonly sourceUrl?: string;
    readonly mimeType?: string;
    readonly sizeBytes?: number;
    readonly pageCount?: number;
    readonly layerSet?: string;
    readonly status?: string;
    readonly error?: string;
    readonly createdAt?: number;
    readonly updatedAt?: number;
  };
  readonly extraction?: {
    readonly pages?: readonly { readonly page?: number; readonly width?: number; readonly height?: number }[];
    readonly blocks?: readonly Record<string, unknown>[];
    readonly outline?: readonly Record<string, unknown>[];
    readonly article?: Record<string, unknown>;
  } | null;
  readonly layers?: {
    readonly set?: string;
    readonly metrics?: Record<string, unknown>;
    readonly layers?: readonly Record<string, unknown>[];
  } | null;
  readonly pins?: readonly Record<string, unknown>[] | null;
  readonly shots?: {
    readonly viewportWidth?: number;
    readonly totalHeight?: number;
    readonly capturedAt?: number;
    readonly shots?: readonly {
      readonly index?: number;
      readonly file?: string;
      readonly scrollY?: number;
      readonly width?: number;
      readonly height?: number;
      readonly sections?: readonly number[];
      readonly title?: string;
    }[];
  } | null;
  readonly consensus?: readonly Record<string, unknown>[] | null;
  readonly layerOverrides?: Readonly<Record<string, boolean>> | null;
  /** Base URL for binary source & shot assets (e.g. `/api/reference/items/<refId>` or `/local-ref-library/items/<refId>`). */
  readonly assetBaseUrl?: string;
}
