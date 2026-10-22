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
      className={`rounded px-2.5 py-1.5 text-[14.5px] transition-colors duration-150 ${
        active ? "text-ink underline decoration-2 underline-offset-[6px]" : "text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
