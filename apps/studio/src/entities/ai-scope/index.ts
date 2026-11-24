export {
  DEFAULT_SCOPE,
  isRestricted,
  offScope,
  oneOffScope,
  pageTitle,
  resolveScope,
  scopeAllowsBlock,
  scopeAllowsPage,
  scopeAllowsSlot,
  scopeHidesBlock,
  scopeHidesPage,
  scopeHidesSlot,
  targetFromBlock,
  targetFromSlots,
} from "@vibe/ai-scope";
export type { DocScopeSetting, ResolvedScope, ScopeMode, ScopeTarget } from "@vibe/ai-scope";
export { useAiScopeStore } from "./model/useAiScopeStore";
export type { AiScopeState } from "./model/useAiScopeStore";
export { currentScope, liveTarget, SCOPE_CONTEXT_KIND, scopeContextRef, toolScope, toolSourcesOff } from "./model/current";
