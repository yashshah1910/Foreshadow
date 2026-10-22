"use client";

import { useState } from "react";

export function CopyCommand({ command, label = "Copy" }: { command: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="well flex items-center gap-2 py-2 pl-4 pr-2">
      <span className="font-mono text-[13px] text-ink-3 select-none" aria-hidden="true">$</span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px] text-ink">{command}</code>
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
        className="pressable shrink-0 rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-surface-3"
      >
        {copied ? "Copied" : label}
      </button>
    </div>
  );
}
