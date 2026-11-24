import React from "react";
import { createRoot } from "react-dom/client";

import paragraphStyles from "@vibe/harness-packs/editor/paragraph-styles.json";
import { ensureParagraphStyles, type ParagraphStyleRegistry } from "@vibe/slot-editor";

import { App } from "./app";
import { installAutomationBridge } from "./app/automationBridge";
import "./styles.css";
import "./styles/tidy.css";

installAutomationBridge();
// 이름 있는 문단 스타일(<p data-style>) — 편집 칸 · 읽기 칸 · 인쇄가 같은 규칙을 쓴다 (레지스트리는 editor 팩 데이터)
ensureParagraphStyles(paragraphStyles as ParagraphStyleRegistry);

// 목업 스튜디오: `?mock=1` 이면 백엔드 없이 클로드 카드 사이클 목업만 띄운다 (src/mock-studio).
const MockStudio = React.lazy(() => import("./mock-studio/MockStudio").then((m) => ({ default: m.MockStudio })));
const isMock = new URLSearchParams(window.location.search).has("mock");

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      {isMock ? (
        <React.Suspense fallback={null}>
          <MockStudio />
        </React.Suspense>
      ) : (
        <App />
      )}
    </React.StrictMode>
  );
}
