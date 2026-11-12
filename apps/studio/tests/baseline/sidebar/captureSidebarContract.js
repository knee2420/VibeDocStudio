/**
 * 사이드바 동작 계약 캡처 (브라우저에서 실행).
 *
 * 열린 스튜디오 페이지의 DOM 을 읽어 "어떤 종류의 아웃라인 행에 어떤 동작 버튼이 붙어 있는가"와
 * 사이드바가 내놓는 진입점(test id · 버튼 툴팁)을 JSON 으로 뽑는다. 호버 때만 보이는 버튼도
 * DOM 에는 있으므로 함께 잡힌다. 열어야 보이는 메뉴(더보기 · 새 문서 메뉴)의 항목은 잡지 않는다.
 *
 * 사용: 페이지 콘솔(또는 자동화 도구)에서 이 파일 내용을 실행한 뒤 `window.__captureSidebarContract()`.
 * 성능: `window.__perfProbe.start()` → 캔버스에서 슬롯 클릭 → `window.__perfProbe.stop()`.
 */
(() => {
  const ROW_PREFIX = "outline-node-row-";

  /**
   * nodeId → 행 종류. 투영이 문서에서 자동으로 만든 노드(`auto-<kind>-…`)와 프로젝트 매니페스트에
   * 저장된 노드(`node-<kind>-…`)가 같은 수준이면 같은 종류로 센다.
   */
  const KIND_BY_TAG = { proj: "project", doc: "document", page: "page", blk: "block", sec: "section", row: "row", slot: "slot" };
  const rowKind = (nodeId) => {
    if (nodeId === "project-root") return "project";
    const m = /^(?:auto|node)-([a-z]+)-/.exec(nodeId);
    return (m && KIND_BY_TAG[m[1]]) || "plan-node";
  };

  /** 버튼 → 의미 있는 동작 id. test id 를 먼저 보고, 없으면 툴팁으로. */
  const ACTION_BY_TESTID = [
    [/^zoom-bullet-/, "zoom-in"],
    [/^add-page-menu-btn-/, "add-page"],
    [/^rename-(doc|page)-btn-/, "rename"],
    [/^duplicate-(doc|page)-btn-/, "duplicate"],
    [/^delete-(doc|page)-btn-/, "delete"],
    [/^delete-outline-node-/, "delete-node"],
    [/^lock-toggle-/, "lock"],
    [/^visibility-toggle-/, "visibility"],
    [/^fold-toggle-/, "fold"],
    [/^outline-new-doc-menu-btn$/, "new-doc-menu"],
    [/^outline-refresh-docs-btn$/, "refresh-docs"],
  ];
  const ACTION_BY_TITLE = [
    [/^위로 이동/, "move-up"],
    [/^아래로 이동/, "move-down"],
  ];

  const actionOf = (btn) => {
    const tid = btn.getAttribute("data-testid") || "";
    for (const [re, id] of ACTION_BY_TESTID) if (re.test(tid)) return id;
    const title = btn.getAttribute("title") || "";
    for (const [re, id] of ACTION_BY_TITLE) if (re.test(title)) return id;
    return tid ? `testid:${tid}` : title ? `title:${title}` : null;
  };

  /** 노드마다 달라지는 부분(끝에 붙은 실제 노드 id)을 지워 비교 가능한 이름으로. */
  const makeTestIdNormalizer = (nodeIds) => {
    const byLength = [...nodeIds].sort((a, b) => b.length - a.length);
    return (tid) => {
      for (const id of byLength) if (tid.endsWith(id)) return tid.slice(0, tid.length - id.length) + "{node}";
      return tid.replace(/\d+/g, "#");
    };
  };
  const normalizeTitle = (t) => t.replace(/\s+/g, " ").replace(/\d+/g, "#").trim();

  window.__captureSidebarContract = () => {
    const sidebar = document.querySelector('[data-testid="project-outliner-sidebar"]') || document.body;
    const rows = [...sidebar.querySelectorAll(`[data-testid^="${ROW_PREFIX}"]`)];

    const normalizeTestId = makeTestIdNormalizer(rows.map((r) => r.getAttribute("data-testid").slice(ROW_PREFIX.length)));
    const kinds = {};
    for (const row of rows) {
      const nodeId = row.getAttribute("data-testid").slice(ROW_PREFIX.length);
      const kind = rowKind(nodeId);
      const k = (kinds[kind] ??= { rows: 0, actions: {} });
      k.rows += 1;
      const seen = new Set();
      for (const btn of row.querySelectorAll("button")) {
        const a = actionOf(btn);
        if (a && !seen.has(a)) {
          seen.add(a);
          k.actions[a] = (k.actions[a] ?? 0) + 1;
        }
      }
    }

    const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
    for (const k of Object.values(kinds)) k.actions = sortObj(k.actions);

    const testIds = [...new Set([...sidebar.querySelectorAll("[data-testid]")].map((el) => normalizeTestId(el.getAttribute("data-testid"))))].sort();
    const buttonTitles = [
      ...new Set(
        [...sidebar.querySelectorAll("button[title], [role='button'][title]")]
          .filter((el) => !el.closest(`[data-testid^="${ROW_PREFIX}"]`))
          .map((el) => normalizeTitle(el.getAttribute("title")))
      ),
    ].sort();

    return {
      meta: {
        url: location.pathname + location.search,
        viewport: `${innerWidth}x${innerHeight}`,
        capturedAt: new Date().toISOString(),
        note: "열어야 보이는 메뉴 항목은 포함하지 않음",
      },
      rowKinds: sortObj(kinds),
      sidebarTestIds: testIds,
      sidebarButtonTitles: buttonTitles,
    };
  };

  /** 클릭 한 번마다 메인 스레드 긴 작업과 pointerdown 처리 시간을 모은다. */
  window.__perfProbe = {
    start() {
      this.entries = [];
      this.obs?.forEach((o) => o.disconnect());
      const push = (e) =>
        this.entries.push({
          type: e.entryType,
          name: e.name,
          start: Math.round(e.startTime),
          dur: Math.round(e.duration),
          proc: e.processingEnd ? Math.round(e.processingEnd - e.processingStart) : null,
        });
      const lt = new PerformanceObserver((l) => l.getEntries().forEach(push));
      lt.observe({ type: "longtask", buffered: false });
      const ev = new PerformanceObserver((l) => l.getEntries().filter((e) => e.name === "pointerdown").forEach(push));
      ev.observe({ type: "event", durationThreshold: 16, buffered: false });
      this.obs = [lt, ev];
      return "started";
    },
    stop() {
      this.obs?.forEach((o) => o.disconnect());
      const longtasks = this.entries.filter((e) => e.type === "longtask").map((e) => e.dur);
      const pointerdown = this.entries.filter((e) => e.name === "pointerdown").map((e) => e.proc);
      return { longtaskMs: longtasks, pointerdownProcessingMs: pointerdown, visibility: document.visibilityState };
    },
  };

  return "sidebar contract tools installed";
})();
