import React, { useState } from "react";
import { Settings } from "lucide-react";

import type { AgentSettingsTransport } from "../contracts/types";
import { createHttpTransport } from "../contracts/transport";
import { AgentSettingsModal } from "./AgentSettingsModal";

export interface AgentSettingsButtonProps {
  transport?: AgentSettingsTransport;
  className?: string;
  onOpen?: () => void;
  onClose?: () => void;
}

export const AgentSettingsButton: React.FC<AgentSettingsButtonProps> = ({
  transport,
  className,
  onOpen,
  onClose,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const activeTransport = React.useMemo(
    () => transport || createHttpTransport(),
    [transport]
  );

  const handleOpen = () => {
    setIsOpen(true);
    onOpen?.();
  };

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="에이전트 & LLM 런타임 설정"
        className={
          className ||
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer transition"
        }
      >
        <Settings className="w-3.5 h-3.5 text-slate-500" />
        <span>AI 설정</span>
      </button>

      <AgentSettingsModal
        isOpen={isOpen}
        onClose={handleClose}
        transport={activeTransport}
      />
    </>
  );
};

