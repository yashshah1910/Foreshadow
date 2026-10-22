"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`pressable relative rounded-md px-3 py-1.5 text-[13.5px] ${
        active ? "text-ink font-medium" : "text-ink-2 hover:text-ink hover:bg-surface-2"
      }`}
    >
      {children}
      {active ? <span className="absolute inset-x-3 -bottom-[9px] h-[2px] rounded-full bg-ink" aria-hidden="true" /> : null}
    </Link>
  );
}
