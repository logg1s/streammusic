"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Disc3, ListMusic, Radio, Search, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Mới", icon: Radio },
  { href: "/albums", label: "Album", icon: Disc3 },
  { href: "/tracks", label: "Bài hát", icon: ListMusic },
  { href: "/search", label: "Tìm", icon: Search },
  { href: "/settings", label: "Cài đặt", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Tên app + nút đổi theme, dính trên đầu vùng cuộn. Chỉ hiện trên mobile. */
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span className="grid size-5 place-items-center rounded-full border border-accent">
          <span className="size-1.5 rounded-full bg-accent" />
        </span>
        <span className="text-base font-semibold tracking-tight">Vọng</span>
      </Link>
      <ThemeToggle />
    </header>
  );
}

/**
 * Thanh tab dưới đáy — thay cho dải chip cuộn ngang cũ.
 * Nằm dưới cùng, dưới cả thanh phát, và chừa chỗ cho vạch home của iPhone.
 */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Điều hướng chính"
      className="border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[11px] transition-colors",
                  active
                    ? "text-accent-text"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
