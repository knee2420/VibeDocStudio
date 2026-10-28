import React from "react";
import { INITIAL_VDOC_DOCUMENTS } from "@vibe/vdoc-schema";
import { VibeDocStudioShell } from "@vibe/slot-canvas";

export const App: React.FC = () => {
  return (
    <VibeDocStudioShell
      documents={INITIAL_VDOC_DOCUMENTS}
      initialDocId={INITIAL_VDOC_DOCUMENTS[0]?.docId}
    />
  );
};

export default App;

