import type { VDocDocument, VDocCatalogManifest } from "./types";
import catalogIndexJson from "../../../catalog/index.json";
import vibeArchitectureMinutesJson from "../../../catalog/vibe-architecture-minutes/document.json";
import yesform07BansanghoeJson from "../../../catalog/yesform-07-bansanghoe/document.json";
import pandadocVcProposalJson from "../../../catalog/pandadoc-vc-proposal/document.json";
import atticusInvoiceJson from "../../../catalog/atticus-invoice-000081709/document.json";

export const CATALOG_MANIFESTS =
  catalogIndexJson.entries as unknown as VDocCatalogManifest[];

export const MEETING_MINUTES_VDOC =
  vibeArchitectureMinutesJson as unknown as VDocDocument;

export const BANSANGHOE_MINUTES_VDOC =
  yesform07BansanghoeJson as unknown as VDocDocument;

export const PANDADOC_VC_PROPOSAL_VDOC =
  pandadocVcProposalJson as unknown as VDocDocument;

export const ATTICUS_INVOICE_VDOC =
  atticusInvoiceJson as unknown as VDocDocument;

export const INITIAL_VDOC_DOCUMENTS: VDocDocument[] = [
  MEETING_MINUTES_VDOC,
  BANSANGHOE_MINUTES_VDOC,
  PANDADOC_VC_PROPOSAL_VDOC,
  ATTICUS_INVOICE_VDOC,
];

