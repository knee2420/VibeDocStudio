import React from "react";

import { PlaygroundPage } from "@/pages/playground-page";
import { StudioPage } from "@/pages/studio-page";

function isPlaygroundLocation(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/playground") return true;
  return new URLSearchParams(window.location.search).get("lab") === "playground";
}

export const App: React.FC = () => {
  return isPlaygroundLocation() ? <PlaygroundPage /> : <StudioPage />;
};

export default App;

