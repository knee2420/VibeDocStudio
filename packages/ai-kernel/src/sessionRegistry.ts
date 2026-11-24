import type { SessionAnchor } from "./anchor";
import type { ComposerSessionController, ComposerState } from "./composerSession";
import type { ContextRef } from "./types";

/**
 * 세션 레지스트리 — 메인 대화 하나 + 기준점 세션 여럿을 한 곳에서 든다.
 *
 * 선택 옆 표시 · Composer 탭 · 대시보드 · 알림은 모두 이 레지스트리를 보여 주는 화면일 뿐이다 (상태는 여기 하나).
 *
 * 동시성 규칙:
 *   - 실행 슬롯 = 모델 턴이 도는 컨트롤러 수(`connecting · streaming · running_tools`). 승인 대기는 슬롯을 쓰지 않는다
 *     (사용자가 자리를 비워도 다른 작업이 막히지 않게).
 *   - 메인은 대기열을 거치지 않는다 (지금 동작 그대로). 메인도 슬롯을 차지하므로 기준점 세션의 여유가 준다.
 *   - 대기열은 먼저 온 순서(FIFO). 어떤 컨트롤러든 실행이 끝나면 마이크로태스크에서 대기열을 다시 본다.
 *   - 컨트롤러의 `send` 는 첫 `await` 전에 상태를 `connecting` 으로 바꾸므로, 시작 직후 슬롯 수가 바로 맞는다.
 */

export type SessionKind = "main" | "anchored";
export type SessionLifecycle = "active" | "completed" | "anchor-lost";
export type SessionStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "needs_review"
  | "error"
  | "interrupted"
  | "idle"
  | "completed";

/** 뒤에서 실행하지 않은 화면 조작 도구 — 세션을 열 때 마지막 것을 한 번 실행한다 */
export interface RevealHint {
  readonly tool: string;
  readonly args: Record<string, unknown>;
}

export interface SessionEntry {
  readonly key: string;
  readonly kind: SessionKind;
  readonly anchor: SessionAnchor | null;
  /** 첫 지시 원문 */
  readonly instruction: string;
  readonly title: string;
  readonly createdAt: string;
  readonly lifecycle: SessionLifecycle;
  readonly completedAt?: string;
  readonly unread: boolean;
  readonly revealHints: readonly RevealHint[];
}

/** 화면이 읽는 값 (파생 상태 포함) */
export interface SessionView extends SessionEntry {
  readonly status: SessionStatus;
  /** 검토하지 않은 변경안 수 */
  readonly reviewCount: number;
  /** 서버 세션 id (아직 없으면 null) */
  readonly serverSessionId: string | null;
}

export interface SessionStatusEvent {
  readonly type: "status";
  readonly key: string;
  readonly from: SessionStatus;
  readonly to: SessionStatus;
  /** 그 순간 앞(보고 있는) 세션이었는가 */
  readonly foreground: boolean;
}

/** Composer 탭 줄이 읽는 값 (바뀔 때만 새 객체) */
export interface SessionTabState {
  readonly tabs: readonly string[];
  readonly foreground: string;
  /** 직전 탭으로 돌아갈 수 있는가 */
  readonly canGoBack: boolean;
}

export interface SessionRegistryMeta {
  readonly entries: SessionEntry[];
  /** 저장 시점에 실행 중이던 세션 — 다시 열면 `interrupted` */
  readonly running: string[];
  readonly openTabs: string[];
  readonly foreground: string;
}

export interface SessionMetaStore {
  load(): SessionRegistryMeta | null;
  save(meta: SessionRegistryMeta): void;
}

export interface SessionRegistryOptions {
  /** 메인 컨트롤러 (호출자가 대화 키를 이미 묶었다) */
  readonly main: ComposerSessionController;
  readonly mainKey: string;
  readonly mainTitle?: string;
  /** 기준점 세션용 컨트롤러 (저장소를 붙여서). 대화 키는 레지스트리가 묶는다 */
  createController(): ComposerSessionController;
  readonly metaStore?: SessionMetaStore | null;
  readonly maxConcurrentRuns?: number;
  readonly maxOpenTabs?: number;
  readonly maxCompleted?: number;
  /** 세션별 검토 안 한 변경안 수 (어댑터 소유 — 바뀌면 `refresh()`) */
  pendingReviewCount?(key: string): number;
  /** 컨트롤러가 생길 때 (서버 이벤트 구독 등). 반환 = 해제 */
  onControllerCreated?(key: string, controller: ComposerSessionController): (() => void) | void;
  /** 완료 직후 (변경안 버리기 등) */
  onComplete?(entry: SessionEntry, options: { discardStaged: boolean }): void;
  /** 이력에서 밀려난 세션의 대화 기록 지우기 */
  removeConversation?(key: string): void;
  newKey?(): string;
  now?(): Date;
  /** 테스트용: 마이크로태스크 대신 쓸 예약 함수 */
  schedule?(fn: () => void): void;
}

const RUNNING_STATES: ReadonlySet<ComposerState["status"]> = new Set(["connecting", "streaming", "running_tools"]);
/** 사용자에게 알려야 하는 상태 */
export const ATTENTION_STATUSES: ReadonlySet<SessionStatus> = new Set(["awaiting_approval", "needs_review", "error"]);

let keySeq = 0;
const defaultKey = () => `s-${Date.now().toString(36)}-${(keySeq++).toString(36)}`;

function lastNoticeIsError(state: ComposerState): boolean {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i];
    if (item.kind === "turn_meta") continue;
    if (item.kind === "notice") {
      if (item.level === "error") return true;
      continue; // 정보 · 경고 notice 는 건너뛰고 그 앞을 본다
    }
    return false;
  }
  return false;
}

function sameView(a: SessionView | undefined, b: SessionView): boolean {
  return (
    !!a &&
    a.status === b.status &&
    a.reviewCount === b.reviewCount &&
    a.unread === b.unread &&
    a.lifecycle === b.lifecycle &&
    a.anchor === b.anchor &&
    a.title === b.title &&
    a.revealHints === b.revealHints &&
    a.serverSessionId === b.serverSessionId &&
    a.completedAt === b.completedAt
  );
}

export class SessionRegistry {
  private readonly entries = new Map<string, SessionEntry>();
  private readonly controllers = new Map<string, ComposerSessionController>();
  private readonly detach = new Map<string, () => void>();
  private readonly views = new Map<string, SessionView>();
  private readonly pending: { key: string; text: string; contexts: ContextRef[] }[] = [];
  private readonly interrupted = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly eventListeners = new Set<(event: SessionStatusEvent) => void>();
  private snapshot: SessionView[] = [];
  private tabState: SessionTabState = { tabs: [], foreground: "", canGoBack: false };
  private tabs: string[];
  private history: string[];
  private fg: string;
  private pumpScheduled = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private frozen = false;
  private readonly maxRuns: number;
  private readonly maxTabs: number;
  private readonly maxCompleted: number;

  constructor(private readonly options: SessionRegistryOptions) {
    this.maxRuns = Math.max(1, options.maxConcurrentRuns ?? 3);
    this.maxTabs = Math.max(2, options.maxOpenTabs ?? 8);
    this.maxCompleted = Math.max(0, options.maxCompleted ?? 50);
    const mainKey = options.mainKey;
    this.entries.set(mainKey, {
      key: mainKey,
      kind: "main",
      anchor: null,
      instruction: "",
      title: options.mainTitle ?? "메인",
      createdAt: this.nowIso(),
      lifecycle: "active",
      unread: false,
      revealHints: [],
    });
    this.tabs = [mainKey];
    this.history = [mainKey];
    this.fg = mainKey;
    this.attach(mainKey, options.main);

    const meta = options.metaStore?.load() ?? null;
    if (meta) {
      const running = new Set(meta.running ?? []);
      for (const entry of meta.entries ?? []) {
        if (!entry || entry.kind !== "anchored" || typeof entry.key !== "string" || this.entries.has(entry.key)) continue;
        this.entries.set(entry.key, { ...entry, revealHints: entry.revealHints ?? [] });
        if (entry.lifecycle !== "completed" && running.has(entry.key)) this.interrupted.add(entry.key);
      }
      for (const key of meta.openTabs ?? []) {
        if (key !== mainKey && this.isOpenable(key) && !this.tabs.includes(key)) this.tabs.push(key);
      }
      if (meta.foreground && this.tabs.includes(meta.foreground)) {
        this.fg = meta.foreground;
        this.history = [mainKey, meta.foreground].filter((k, i, a) => a.indexOf(k) === i);
      }
    }
    // 끝나지 않은 세션은 바로 컨트롤러를 붙여 상태(오류 · 승인 대기)를 정확히 보인다
    for (const entry of this.entries.values()) {
      if (entry.kind === "anchored" && entry.lifecycle !== "completed") this.controller(entry.key);
    }
    this.syncTabState(false);
    this.rebuild();
  }

  // --- 읽기 ---------------------------------------------------------------------

  get mainKey(): string {
    return this.options.mainKey;
  }

  /** 안정된 배열 (useSyncExternalStore 용) — 메인 먼저, 그다음 만든 순서 */
  list = (): SessionView[] => this.snapshot;

  view(key: string): SessionView | null {
    return this.views.get(key) ?? null;
  }

  get(key: string): SessionEntry | null {
    return this.entries.get(key) ?? null;
  }

  status(key: string): SessionStatus {
    return this.views.get(key)?.status ?? "idle";
  }

  foreground(): string {
    return this.fg;
  }

  isForeground(key: string): boolean {
    return this.fg === key;
  }

  openTabs(): readonly string[] {
    return this.tabs;
  }

  /** 안정된 탭 상태 (useSyncExternalStore 용) */
  getTabState = (): SessionTabState => this.tabState;

  /** 탭 · 앞 세션이 바뀌었으면 새 탭 상태를 만들고 알린다 */
  private syncTabState(notify = true): void {
    const prev = this.tabState;
    const canGoBack = this.history.some((k) => k !== this.fg && this.tabs.includes(k));
    if (prev.foreground === this.fg && prev.canGoBack === canGoBack && prev.tabs.length === this.tabs.length && prev.tabs.every((k, i) => k === this.tabs[i])) return;
    this.tabState = { tabs: [...this.tabs], foreground: this.fg, canGoBack };
    if (notify && !this.disposed) this.listeners.forEach((l) => l());
  }

  /** 도구 호출의 서버 세션 id → 세션 (메인 포함) */
  byServerSessionId(sessionId: string | null | undefined): SessionEntry | null {
    if (!sessionId) return null;
    for (const [key, controller] of this.controllers) {
      if (controller.getState().sessionId === sessionId) return this.entries.get(key) ?? null;
    }
    return null;
  }

  /** 같은 화면 · 같은 파일의 항목을 가리키는 진행 중(완료 아님) 세션들 */
  findByItems(surface: string, path: string, itemIds: readonly string[]): SessionView[] {
    const ids = new Set(itemIds);
    return this.snapshot.filter(
      (v) =>
        v.kind === "anchored" &&
        v.lifecycle !== "completed" &&
        v.anchor?.surface === surface &&
        v.anchor.path === path &&
        v.anchor.itemIds.some((id) => ids.has(id))
    );
  }

  /** 실행 슬롯을 쓰는 컨트롤러 수 */
  runningCount(): number {
    let n = 0;
    for (const controller of this.controllers.values()) if (RUNNING_STATES.has(controller.getState().status)) n++;
    return n;
  }

  queuedKeys(): string[] {
    return this.pending.map((p) => p.key);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onStatus(listener: (event: SessionStatusEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  // --- 컨트롤러 ---------------------------------------------------------------------

  /** 세션의 컨트롤러 (없으면 만들어 대화 키를 묶는다). 완료된 세션도 기록을 보려고 열 수 있다 */
  controller(key: string): ComposerSessionController {
    const existing = this.controllers.get(key);
    if (existing) return existing;
    const entry = this.entries.get(key);
    if (!entry) throw new Error(`알 수 없는 세션: ${key}`);
    const controller = this.options.createController();
    controller.setSessionOptions({ retain: true, label: entry.title });
    controller.bindConversation(key);
    const main = this.options.main;
    controller.setMode(main.getState().mode);
    const engine = main.engineChoice();
    if (engine) controller.setEngine(engine.provider, engine.model);
    this.attach(key, controller);
    return controller;
  }

  private attach(key: string, controller: ComposerSessionController): void {
    this.controllers.set(key, controller);
    const off = controller.subscribe(() => this.onControllerChange(key));
    const offHook = this.options.onControllerCreated?.(key, controller);
    this.detach.set(key, () => {
      off();
      if (typeof offHook === "function") offHook();
    });
  }

  // --- 만들기 · 보내기 ------------------------------------------------------------

  /** 기준점 세션을 만들고 첫 지시를 보낸다 (실행 슬롯이 없으면 대기열). 화면 포커스는 바꾸지 않는다 */
  createAnchored(input: {
    anchor: SessionAnchor;
    instruction: string;
    /** 첨부 (또는 세션 키를 받아 메시지 본문 · 첨부를 만드는 함수 — 그 세션의 범위를 정할 때) */
    contexts: ContextRef[] | ((key: string) => { text: string; contexts: ContextRef[] });
    title?: string;
  }): SessionEntry {
    this.assertAlive();
    const key = (this.options.newKey ?? defaultKey)();
    const entry: SessionEntry = {
      key,
      kind: "anchored",
      anchor: input.anchor,
      instruction: input.instruction,
      title: input.title ?? (clip(input.instruction.replace(/\s+/g, " ").trim(), 40) || input.anchor.label),
      createdAt: this.nowIso(),
      lifecycle: "active",
      unread: false,
      revealHints: [],
    };
    this.entries.set(key, entry);
    this.controller(key);
    try {
      const built =
        typeof input.contexts === "function" ? input.contexts(key) : { text: input.instruction, contexts: input.contexts };
      this.dispatch(key, built.text, built.contexts);
    } catch (err) {
      // 첫 메시지를 만들지 못했다 — 반쯤 만든 세션을 남기지 않는다
      this.dropController(key);
      this.entries.delete(key);
      this.rebuild();
      throw err;
    }
    return entry;
  }

  /**
   * 세션에 메시지를 보낸다. 메인은 바로 보낸다 (지금 동작). 기준점 세션은 실행 슬롯이 없으면 대기열에 넣는다.
   * 이미 실행 중인 세션이면 컨트롤러 자체 대기열로 간다 (슬롯을 새로 쓰지 않는다).
   */
  dispatch(key: string, text: string, contexts: ContextRef[] = []): void {
    this.assertAlive();
    const entry = this.entries.get(key);
    if (!entry) throw new Error(`알 수 없는 세션: ${key}`);
    if (entry.lifecycle === "completed") throw new Error("완료된 세션에는 보낼 수 없습니다. 다시 열어 주세요.");
    this.interrupted.delete(key);
    const controller = this.controller(key);
    if (entry.kind === "main" || controller.getState().status !== "idle") {
      void controller.send(text, contexts);
      this.rebuild();
      return;
    }
    if (this.pending.some((p) => p.key === key) || this.runningCount() >= this.maxRuns) {
      this.pending.push({ key, text, contexts });
      this.rebuild();
      return;
    }
    this.start(key, text, contexts);
  }

  private start(key: string, text: string, contexts: ContextRef[]): void {
    const controller = this.controller(key);
    void controller.send(text, contexts).finally(() => this.schedulePump());
    this.rebuild();
    this.scheduleSave();
  }

  private schedulePump(): void {
    if (this.pumpScheduled || this.disposed) return;
    this.pumpScheduled = true;
    (this.options.schedule ?? queueMicrotask)(() => {
      this.pumpScheduled = false;
      this.pump();
    });
  }

  /** 실행 슬롯이 나는 만큼 대기열을 꺼내 보낸다 */
  private pump(): void {
    if (this.disposed) return;
    let started = false;
    while (this.pending.length && this.runningCount() < this.maxRuns) {
      const next = this.pending.shift()!;
      const entry = this.entries.get(next.key);
      if (!entry || entry.lifecycle === "completed") continue;
      started = true;
      this.start(next.key, next.text, next.contexts);
    }
    if (!started) this.rebuild();
  }

  /** 세션 실행을 멈춘다 (대기열에 있으면 뺀다) */
  stop(key: string): void {
    this.removePending(key);
    this.controllers.get(key)?.stop();
    this.rebuild();
  }

  private removePending(key: string): void {
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].key === key) this.pending.splice(i, 1);
  }

  // --- 탭 · 앞 세션 -----------------------------------------------------------------

  /** 세션을 앞(보고 있는 탭)으로 — 탭이 없으면 연다. 읽음 처리 */
  setForeground(key: string): void {
    this.assertAlive();
    const entry = this.entries.get(key);
    if (!entry || entry.lifecycle === "completed") return;
    if (entry.kind === "anchored") this.controller(key);
    if (!this.tabs.includes(key)) {
      this.tabs = [...this.tabs, key];
      this.evictTabs(key);
    }
    if (this.fg !== key) {
      this.fg = key;
      this.history = [...this.history.filter((k) => k !== key), key].slice(-30);
    }
    if (entry.unread) this.patch(key, { unread: false });
    this.rebuild();
    this.syncTabState();
    this.scheduleSave();
  }

  /** 직전에 보던 탭으로 */
  back(): void {
    for (let i = this.history.length - 2; i >= 0; i--) {
      const key = this.history[i];
      if (key !== this.fg && this.tabs.includes(key)) {
        this.fg = key;
        this.history = [...this.history.slice(0, i), ...this.history.slice(i + 1), key];
        const entry = this.entries.get(key);
        if (entry?.unread) this.patch(key, { unread: false });
        this.rebuild();
        this.syncTabState();
        this.scheduleSave();
        return;
      }
    }
  }

  /** 탭만 닫는다 — 세션은 계속 돈다 */
  closeTab(key: string): void {
    if (key === this.mainKey || !this.tabs.includes(key)) return;
    this.tabs = this.tabs.filter((k) => k !== key);
    this.history = this.history.filter((k) => k !== key);
    if (this.fg === key) this.fg = this.history.filter((k) => this.tabs.includes(k)).pop() ?? this.mainKey;
    this.rebuild();
    this.syncTabState();
    this.scheduleSave();
  }

  private evictTabs(keep: string): void {
    while (this.tabs.length > this.maxTabs) {
      // 오래 안 본 순서: 이력에서 가장 앞에 있는(또는 이력에 없는) 탭
      const rank = (k: string) => this.history.indexOf(k);
      const candidates = this.tabs.filter((k) => k !== this.mainKey && k !== keep && k !== this.fg);
      if (!candidates.length) return;
      candidates.sort((a, b) => rank(a) - rank(b));
      const victim = candidates[0];
      this.tabs = this.tabs.filter((k) => k !== victim);
    }
  }

  markRead(key: string): void {
    if (this.entries.get(key)?.unread) {
      this.patch(key, { unread: false });
      this.rebuild();
      this.scheduleSave();
    }
  }

  // --- 화면 조작 힌트 -----------------------------------------------------------------

  addRevealHint(key: string, hint: RevealHint): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.patch(key, { revealHints: [...entry.revealHints, hint].slice(-10) });
    this.rebuild();
    this.scheduleSave();
  }

  /** 쌓인 힌트를 꺼낸다 (꺼내면 비운다) */
  takeRevealHints(key: string): RevealHint[] {
    const entry = this.entries.get(key);
    if (!entry || entry.revealHints.length === 0) return [];
    const hints = [...entry.revealHints];
    this.patch(key, { revealHints: [] });
    this.rebuild();
    this.scheduleSave();
    return hints;
  }

  // --- 기준점 · 수명 -----------------------------------------------------------------

  updateAnchor(key: string, anchor: SessionAnchor): void {
    const entry = this.entries.get(key);
    if (!entry || entry.kind !== "anchored") return;
    this.patch(key, { anchor });
    this.rebuild();
    this.scheduleSave();
  }

  setLifecycle(key: string, lifecycle: Exclude<SessionLifecycle, "completed">): void {
    const entry = this.entries.get(key);
    if (!entry || entry.kind !== "anchored" || entry.lifecycle === "completed" || entry.lifecycle === lifecycle) return;
    this.patch(key, { lifecycle });
    this.rebuild();
    this.scheduleSave();
  }

  /**
   * 세션을 끝낸다 — 대기열에서 빼고, 실행을 멈추고, 서버 세션을 닫는다. 대화 기록은 이력으로 남긴다.
   * 탭 · 표시가 사라지고 대시보드 완료 묶음으로 간다.
   */
  async complete(key: string, options: { discardStaged?: boolean } = {}): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.kind === "main") throw new Error("메인 대화는 완료할 수 없습니다.");
    if (entry.lifecycle === "completed") return;
    this.removePending(key);
    this.interrupted.delete(key);
    this.patch(key, { lifecycle: "completed", completedAt: this.nowIso(), unread: false, revealHints: [] });
    this.closeTab(key);
    const controller = this.controllers.get(key);
    const release = controller?.release();
    this.options.onComplete?.(this.entries.get(key)!, { discardStaged: Boolean(options.discardStaged) });
    this.pruneCompleted();
    this.rebuild();
    this.scheduleSave();
    try {
      await release;
    } finally {
      // 완료된 세션의 컨트롤러는 내려 둔다 (다시 열면 저장된 기록으로 새로 만든다)
      if (this.entries.get(key)?.lifecycle === "completed") this.dropController(key);
      this.schedulePump();
    }
  }

  /** 완료한 세션을 다시 연다 (지난 대화 요약을 붙여 새 서버 세션으로 잇는다) */
  reopen(key: string): void {
    const entry = this.entries.get(key);
    if (!entry || entry.lifecycle !== "completed") return;
    this.patch(key, { lifecycle: "active", completedAt: undefined });
    this.setForeground(key);
  }

  private dropController(key: string): void {
    this.detach.get(key)?.();
    this.detach.delete(key);
    this.controllers.delete(key);
  }

  private pruneCompleted(): void {
    const completed = [...this.entries.values()]
      .filter((e) => e.kind === "anchored" && e.lifecycle === "completed")
      .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
    while (completed.length > this.maxCompleted) {
      const old = completed.shift()!;
      this.entries.delete(old.key);
      this.views.delete(old.key);
      const controller = this.controllers.get(old.key);
      this.dropController(old.key);
      if (controller) controller.forget();
      else this.options.removeConversation?.(old.key);
    }
  }

  // --- 상태 파생 ---------------------------------------------------------------------

  private derive(key: string, entry: SessionEntry): SessionStatus {
    if (entry.lifecycle === "completed") return "completed";
    const controller = this.controllers.get(key);
    const state = controller?.getState();
    if (state) {
      if (state.status === "awaiting_approval") return "awaiting_approval";
      if (RUNNING_STATES.has(state.status)) return "running";
    }
    if (this.pending.some((p) => p.key === key)) return "queued";
    if (state && lastNoticeIsError(state)) return "error";
    if ((this.options.pendingReviewCount?.(key) ?? 0) > 0) return "needs_review";
    if (this.interrupted.has(key)) return "interrupted";
    return "idle";
  }

  private onControllerChange(key: string): void {
    if (this.disposed) return;
    const controller = this.controllers.get(key);
    const status = controller?.getState().status;
    // 탭에서 직접 보낸 메시지로 다시 돌기 시작하면 "끊김" 표시는 끝난다
    if (status && status !== "idle") this.interrupted.delete(key);
    if (controller && !RUNNING_STATES.has(controller.getState().status)) this.schedulePump();
    this.rebuild();
  }

  /** 외부 값(변경안 수 등)이 바뀌었을 때 다시 계산 */
  refresh(): void {
    this.rebuild();
  }

  private patch(key: string, patch: Partial<SessionEntry>): void {
    const entry = this.entries.get(key);
    if (entry) this.entries.set(key, { ...entry, ...patch });
  }

  /**
   * 파생 상태를 다시 계산한다. 화면이 보는 값이 바뀐 세션이 있을 때만 구독자에게 알린다
   * (토큰마다 바뀌는 대화 본문은 여기 값이 아니다).
   */
  private rebuild(): void {
    if (this.disposed) return;
    let changed = false;
    const events: SessionStatusEvent[] = [];
    let runningChanged = false;
    for (const [key, entry0] of this.entries) {
      let entry = entry0;
      const prev = this.views.get(key);
      const status = this.derive(key, entry);
      if (prev && prev.status !== status) {
        if (prev.status === "running" || status === "running") runningChanged = true;
        const finishedRun = prev.status === "running" && status !== "queued";
        const wantsUser = ATTENTION_STATUSES.has(status) || finishedRun;
        if (wantsUser && key !== this.fg && entry.kind === "anchored" && status !== "completed" && !entry.unread) {
          entry = { ...entry, unread: true };
          this.entries.set(key, entry);
        }
        events.push({ type: "status", key, from: prev.status, to: status, foreground: key === this.fg });
      }
      const view: SessionView = {
        ...entry,
        status,
        reviewCount: this.options.pendingReviewCount?.(key) ?? 0,
        serverSessionId: this.controllers.get(key)?.getState().sessionId ?? null,
      };
      if (!sameView(prev, view)) {
        this.views.set(key, view);
        changed = true;
      }
    }
    for (const key of [...this.views.keys()]) {
      if (!this.entries.has(key)) {
        this.views.delete(key);
        changed = true;
      }
    }
    if (changed || this.snapshot.length !== this.views.size) {
      this.snapshot = [...this.entries.keys()].map((k) => this.views.get(k)!).filter(Boolean);
      this.listeners.forEach((l) => l());
    }
    if (runningChanged) this.scheduleSave();
    for (const event of events) {
      this.eventListeners.forEach((l) => {
        try {
          l(event);
        } catch {
          /* 알림 오류가 레지스트리를 막지 않게 */
        }
      });
    }
  }

  // --- 저장 ---------------------------------------------------------------------

  private isOpenable(key: string): boolean {
    const entry = this.entries.get(key);
    return Boolean(entry && entry.lifecycle !== "completed");
  }

  private metaSnapshot(runningOverride?: string[]): SessionRegistryMeta {
    const running =
      runningOverride ??
      [...this.controllers.entries()]
        .filter(([k, c]) => k !== this.mainKey && RUNNING_STATES.has(c.getState().status))
        .map(([k]) => k);
    return {
      entries: [...this.entries.values()].filter((e) => e.kind === "anchored"),
      running: [...new Set([...running, ...this.pending.map((p) => p.key)])],
      openTabs: [...this.tabs],
      foreground: this.fg,
    };
  }

  private scheduleSave(): void {
    if (!this.options.metaStore || this.disposed || this.frozen) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), 300);
  }

  flushSave(runningOverride?: string[]): void {
    clearTimeout(this.saveTimer);
    if (!this.options.metaStore) return;
    try {
      this.options.metaStore.save(this.metaSnapshot(runningOverride));
    } catch {
      /* 저장소가 가득 차도 계속 */
    }
  }

  /**
   * 페이지를 떠날 때 — 메인은 지금처럼 서버 세션을 닫고, 기준점 세션은 실행만 끊는다(서버 세션 유지).
   * 실행 중이던 세션을 먼저 기록해 두어 다시 열면 `interrupted` 로 보인다.
   */
  pageExit(): void {
    const running = [...this.controllers.entries()]
      .filter(([k, c]) => k !== this.mainKey && c.getState().status !== "idle")
      .map(([k]) => k);
    this.flushSave(running);
    // 끊기면서 상태가 idle 로 바뀌어도 방금 남긴 기록(실행 중이던 세션)을 덮어쓰지 않게
    this.frozen = true;
    for (const [key, controller] of this.controllers) {
      if (key === this.mainKey) controller.closeOnPageExit();
      else controller.detachOnPageExit();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    if (!this.frozen) this.flushSave();
    for (const controller of this.controllers.values()) controller.persistNow();
    this.disposed = true;
    for (const off of this.detach.values()) off();
    this.detach.clear();
    this.listeners.clear();
    this.eventListeners.clear();
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("세션 레지스트리가 이미 닫혔습니다.");
  }

  private nowIso(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }
}

function clip(text: string, n: number): string {
  return text.length <= n ? text : `${text.slice(0, n - 1)}…`;
}
