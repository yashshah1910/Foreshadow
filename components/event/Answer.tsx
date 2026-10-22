"use client";

import { useState } from "react";

/**
 * Renders an answer written with a small markdown subset: paragraphs,
 * "- " bullets and **bold**. Anything else shows as plain text. Long answers
 * collapse behind "Show more".
 */
export function Answer({ text, collapseAt = 520 }: { text: string; collapseAt?: number }) {
  const clean = tidy(text);
  const [open, setOpen] = useState(clean.length <= collapseAt);
  const blocks = toBlocks(open ? clean : clip(clean, collapseAt));
  return (
    <div className="text-[15.5px] leading-relaxed text-ink">
      <div className="space-y-3">
        {blocks.map((b, i) =>
          b.type === "list" ? (
            <ul key={i} className="space-y-1.5">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden="true" />
                  <span>{inline(item)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p key={i}>{inline(b.text)}</p>
          ),
        )}
      </div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="link mt-3 text-[14.5px]">
          Show more
        </button>
      ) : null}
    </div>
  );
}

type Block = { type: "p"; text: string } | { type: "list"; items: string[] };

/** Drops tool-name citations and headings the prompt asks the model not to write. */
function tidy(text: string): string {
  return text
    .replace(/\s*\((?:from |via )?(?:foreshadow|uw)[_a-z-]*\)/gi, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^Evidence:\s*$/gim, "")
    .trim();
}

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(t);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === "list") last.items.push(bullet[1]);
      else blocks.push({ type: "list", items: [bullet[1]] });
    } else if (last?.type === "p" && !/[.!?:]$/.test(last.text)) {
      last.text += ` ${t}`;
    } else {
      blocks.push({ type: "p", text: t });
    }
  }
  return blocks;
}

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part.replace(/\*\*/g, "")
    ),
  );
}

/** Cuts at a line or sentence boundary near `n` characters. */
function clip(text: string, n: number): string {
  const cut = text.slice(0, n);
  const at = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  return `${cut.slice(0, at > n * 0.5 ? at + 1 : n).trimEnd()}…`;
}
