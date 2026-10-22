"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, compact = false }: { href: string; children: React.ReactNode; compact?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-full font-medium transition-colors duration-150 ${compact ? "whitespace-nowrap px-0.5 py-2 text-center text-[clamp(11.5px,3.4vw,13px)]" : "px-3.5 py-2 text-[15px]"} ${
        active ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
