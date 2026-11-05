import type { AiAction, ContextProvider, ContextRef, DropTranslator, EntityInfo, EntityResolver, WorkspaceTool } from "./types";

type Listener = () => void;

/**
 * 기능이 자기 것을 등록하고, 해제 함수를 돌려받는 단순 레지스트리.
 * 등록 순서를 유지하며, 같은 키를 다시 등록하면 덮어쓴다 (HMR 안전).
 */
export class Registry<T> {
  private readonly items = new Map<string, T>();
  private readonly listeners = new Set<Listener>();
  private snapshot: T[] = [];

  constructor(private readonly keyOf: (item: T) => string) {}

  register(item: T): () => void {
    const key = this.keyOf(item);
    this.items.set(key, item);
    this.emit();
    return () => {
      if (this.items.get(key) === item) {
        this.items.delete(key);
        this.emit();
      }
    };
  }

  registerAll(items: T[]): () => void {
    const offs = items.map((item) => this.register(item));
    return () => offs.forEach((off) => off());
  }

  get(key: string): T | undefined {
    return this.items.get(key);
  }

  /** 안정된 배열 참조 (useSyncExternalStore 용). */
  list(): T[] {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.snapshot = [...this.items.values()];
    this.listeners.forEach((l) => l());
  }
}

export class ToolRegistry extends Registry<WorkspaceTool<any>> {
  constructor() {
    super((tool) => tool.name);
  }

  manifest() {
    return this.list().map(({ name, description, risk, inputSchema }) => ({ name, description, risk, inputSchema }));
  }
}

export class ContextRegistry extends Registry<ContextProvider> {
  constructor() {
    super((provider) => provider.id);
  }

  /** 자동 첨부 후보 (현재 선택 등). */
  autoContexts(): ContextRef[] {
    return this.list()
      .filter((p) => p.auto && !p.suggest && p.current)
      .flatMap((p) => safe(() => p.current!(), []));
  }

  /** 첨부 제안 (현재 선택 등) — 보내기에 들어가지 않고, 사용자가 눌러야 첨부된다. */
  suggestedContexts(): ContextRef[] {
    return this.list()
      .filter((p) => p.suggest && p.current)
      .flatMap((p) => safe(() => p.current!(), []));
  }

  /** `@` 멘션 검색. 제공자별 결과를 번갈아 섞어, 한 종류(슬롯)가 후보를 독점하지 않게 한다. */
  search(query: string, limit = 14): ContextRef[] {
    const q = query.trim().toLowerCase();
    const groups = this.list()
      .map((p) => (p.search ? safe(() => p.search!(q), []) : []))
      .filter((g) => g.length > 0);
    const out: ContextRef[] = [];
    for (let i = 0; out.length < limit && groups.some((g) => i < g.length); i++) {
      for (const g of groups) if (i < g.length && out.length < limit) out.push(g[i]);
    }
    return out;
  }

  /** 보내기 직전, 본문이 빈 참조를 제공자가 채운다. */
  resolve(refs: ContextRef[]): ContextRef[] {
    return refs.map((ref) => {
      if (ref.content) return ref;
      for (const provider of this.list()) {
        if (!provider.resolve) continue;
        const resolved = safe(() => provider.resolve!(ref), ref);
        if (resolved !== ref) return resolved;
      }
      return ref;
    });
  }
}

export class ActionRegistry extends Registry<AiAction> {
  constructor() {
    super((action) => action.id);
  }

  forSurface(surface: string): AiAction[] {
    return this.list().filter((a) => a.surfaces.includes(surface));
  }
}

export class EntityRegistry extends Registry<EntityResolver> {
  constructor() {
    super((resolver) => resolver.id);
  }

  /** id(와 종류)로 화면 요소를 찾는다. 등록 순서대로 처음 찾은 것. */
  lookup(id: string, kind?: string): EntityInfo | null {
    if (!id) return null;
    for (const resolver of this.list()) {
      const found = safe(() => resolver.resolve(id, kind), null);
      if (found) return found;
    }
    // 모델이 종류를 잘못 적어도(`vdoc:backdata/<영역 id>`) id 가 실제로 있으면 찾아 준다.
    return kind ? this.lookup(id) : null;
  }
}

export class DropTranslatorRegistry extends Registry<DropTranslator> {
  constructor() {
    super((t) => t.mime);
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
