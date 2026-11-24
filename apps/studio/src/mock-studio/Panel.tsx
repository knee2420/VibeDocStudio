import React from "react";

/** 판 하나 (바탕 위에 뜬 칸) */
export const Panel: React.FC<{ title?: React.ReactNode; right?: React.ReactNode; className?: string; children: React.ReactNode; testId?: string }> = ({ title, right, className = "", children, testId }) => (
  <section className={`bg-[#fbfaf8] rounded-[16px] border border-[#e6e2db] shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col min-h-0 ${className}`} data-testid={testId}>
    {title && (
      <div className="h-12 shrink-0 px-4 flex items-center justify-between gap-2 border-b border-[#ece8e1]">
        <span className="text-[13px] font-bold truncate">{title}</span>
        {right}
      </div>
    )}
    {children}
  </section>
);
