import type { CompositeFormFrameBlockDef } from "@vibe/vdoc-schema";

import { InteractiveTable } from "../../InteractiveTable";
import { defineBlockView } from "../contract";

export const frameView = defineBlockView<CompositeFormFrameBlockDef>({
  kinds: ["composite-form-frame"],
  View: ({ block, ctx }) => (
    <div className="bg-white border-slate-950" style={{ borderWidth: block.outerBorderWidth || "2px", borderStyle: "solid" }}>
      {block.sections.map((sec, sIdx) => {
        const isLastSec = sIdx === block.sections.length - 1;
        return (
          <div
            key={sec.sectionId}
            style={{
              borderBottom: isLastSec ? undefined : sec.bottomBorderThick ? "2px solid #020617" : "1px solid #1e293b",
            }}
          >
            <InteractiveTable
              table={sec}
              borderRules={{
                outer: "none",
                rowBottom: "1px solid #1e293b",
                vertical: "1px solid #1e293b",
                ...sec.borderRules,
              }}
              headerStyle={{ bg: "rgba(241,245,249,0.9)", fontWeight: "600", ...sec.headerStyle }}
              roundedOuter={false}
              {...ctx.tableBindings(sec.sectionId)}
            />
          </div>
        );
      })}
    </div>
  ),
});
