import React, { Suspense, useEffect, useState } from "react";
import { Boxes } from "lucide-react";

import {
  DEFAULT_MOCK_ID,
  PLAYGROUND_MOCKS,
  findPlaygroundMock,
  resolvePlaygroundMock,
} from "./mocks/registry";

function readMockIdFromLocation(): string {
  if (typeof window === "undefined") return DEFAULT_MOCK_ID;
  const pathname = window.location.pathname.replace(/^\/+|\/+$/g, "");
  const byPath = resolvePlaygroundMock(pathname);
  if (byPath) return byPath.id;

  const queryMock = new URLSearchParams(window.location.search).get("mock");
  const byQuery = resolvePlaygroundMock(queryMock);
  if (byQuery) return byQuery.id;

  return DEFAULT_MOCK_ID;
}

export const App: React.FC = () => {
  const [activeMockId, setActiveMockId] = useState<string>(() => readMockIdFromLocation());

  useEffect(() => {
    const onPopState = () => setActiveMockId(readMockIdFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const activeMock = findPlaygroundMock(activeMockId);
  const ActiveComponent = activeMock.Component;

  const selectMock = (mockId: string) => {
    if (mockId === activeMock.id) return;
    window.history.pushState(null, "", `/${mockId}`);
    setActiveMockId(mockId);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0d1117] text-[#e6edf3]">
      <header className="flex h-8 shrink-0 items-center justify-between border-b border-[#21262d] bg-[#010409] px-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-code font-semibold text-[#c9d1d9]">
            <Boxes className="h-3.5 w-3.5 text-[#58a6ff]" />
            <span>playground</span>
          </span>
          <nav className="flex items-center gap-1" aria-label="Playground mocks">
            {PLAYGROUND_MOCKS.map((mock) => {
              const isActive = mock.id === activeMock.id;
              return (
                <button
                  key={mock.id}
                  type="button"
                  onClick={() => selectMock(mock.id)}
                  className={
                    isActive
                      ? "rounded bg-[#1f6feb]/25 px-2 py-0.5 font-code text-[11px] font-medium text-[#79c0ff] ring-1 ring-[#1f6feb]/60"
                      : "rounded px-2 py-0.5 font-code text-[11px] text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]"
                  }
                  title={mock.description}
                >
                  /{mock.label}
                </button>
              );
            })}
          </nav>
        </div>
        <span className="font-code text-[11px] text-[#6e7681]">
          isolated sandbox · apps/playground
        </span>
      </header>

      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center font-code text-xs text-[#8b949e]">
              Loading {activeMock.label}...
            </div>
          }
        >
          <ActiveComponent />
        </Suspense>
      </div>
    </div>
  );
};

export default App;
