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
} from "./model/scope";
export type { DocScopeSetting, ResolvedScope, ScopeMode, ScopeTarget } from "./model/scope";
export { useAiScopeStore } from "./model/useAiScopeStore";
export type { AiScopeState } from "./model/useAiScopeStore";
export { currentScope, liveTarget, SCOPE_CONTEXT_KIND, scopeContextRef, toolScope, toolSourcesOff } from "./model/current";
