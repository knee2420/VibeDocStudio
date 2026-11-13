import React from "react";
import { createRoot } from "react-dom/client";

import paragraphStyles from "@vibe/harness-packs/editor/paragraph-styles.json";
import { ensureParagraphStyles, type ParagraphStyleRegistry } from "@vibe/slot-editor";

import { App } from "./app";
import { installAutomationBridge } from "./app/automationBridge";
import "./styles.css";

installAutomationBridge();
// 이름 있는 문단 스타일(<p data-style>) — 편집 칸 · 읽기 칸 · 인쇄가 같은 규칙을 쓴다 (레지스트리는 editor 팩 데이터)
ensureParagraphStyles(paragraphStyles as ParagraphStyleRegistry);

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
