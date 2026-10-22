"use client";

import { useState } from "react";

export function CopyCommand({ command, label = "Copy" }: { command: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border hairline bg-surface py-1.5 pl-3 pr-1.5">
      <span className="font-mono text-[12px] text-ink-3 select-none" aria-hidden="true">$</span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-ink">{command}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            window.prompt("Copy this command", command);
          }
        }}
        className="pressable shrink-0 rounded-[5px] border hairline bg-surface-2 px-2 py-1 text-[11.5px] text-ink-2 hover:text-ink"
      >
        {copied ? "Copied" : label}
      </button>
    </div>
  );
}
