"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

/** A one-line command in a well, with a copy button beside it. */
export function CopyCommand({ command, label = "Copy command" }: { command: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="well flex items-center gap-2 py-1.5 pl-4 pr-1.5">
      <code tabIndex={0} className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px] text-ink">{command}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            track("mcp_command_copied");
            setTimeout(() => setCopied(false), 1600);
          } catch {
            window.prompt("Copy this command", command);
          }
        }}
        className="pressable btn btn-soft h-8 shrink-0 bg-surface px-3 text-[13px]"
        aria-label={label}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
