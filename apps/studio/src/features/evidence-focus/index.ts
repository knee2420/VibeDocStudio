export { useEvidenceFocusStore } from "@/entities/evidence";
export type { EvidenceFocusState } from "@/entities/evidence";
export { findCitationLink, openEvidence, openEvidenceLink, registerCitationNavigation } from "./model/openEvidence";
export { FOCUS_EVIDENCE_PROVIDER, registerEvidenceFocusAi, useEvidenceFocusSync, slotsUsingResource, slotsUsingCard } from "./model/focusSync";
export { checkEvidenceStatus, useEvidenceStaleCheck } from "./model/staleCheck";
