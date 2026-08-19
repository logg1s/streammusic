"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { House, LibraryBig, Search, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Trang chủ", icon: House },
  { href: "/search", label: "Tìm kiếm", icon: Search },
  { href: "/tracks", label: "Thư viện", icon: LibraryBig },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Tên app + nút đổi theme, dính trên đầu vùng cuộn. Chỉ hiện trên mobile. */
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden">
      <Link href="/" className="flex h-8 items-center" aria-label="Vọng — Trang chủ">
        <Image
          src="/brand/vong-wordmark.png"
          alt="Vọng"
          width={1120}
          height={300}
          preload
          className="h-auto w-[90px]"
        />
      </Link>
      <div className="flex items-center gap-1">
        <Link
          href="/settings"
          aria-label="Cài đặt"
          className="grid size-8 place-items-center text-muted-foreground"
        >
          <Settings className="size-4" />
        </Link>
        <ThemeToggle />
      </div>
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
      className="border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
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
