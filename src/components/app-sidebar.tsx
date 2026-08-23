"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Disc3,
  House,
  ListMusic,
  ListPlus,
  Heart,
  LogOut,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const DISCOVERY_LINKS = [
  { href: "/", label: "Trang chủ", icon: House },
  { href: "/search", label: "Tìm kiếm", icon: Search },
] as const;

const LIBRARY_LINKS = [
  { href: "/library", label: "Thư viện", icon: ListMusic },
  { href: "/albums", label: "Album", icon: Disc3 },
  { href: "/artists", label: "Nghệ sĩ", icon: Users },
  { href: "/tracks", label: "Bài hát", icon: ListMusic },
  { href: "/favorites", label: "Yêu thích", icon: Heart },
  { href: "/playlists", label: "Playlist", icon: ListPlus },
] as const;

export function AppSidebar({ userName }: { userName: string | null }) {
  const pathname = usePathname();

  const itemClass = (active: boolean) =>
    cn(
      "relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-[background,color,transform]",
      active
        ? "bg-surface-hover font-semibold text-foreground before:absolute before:-left-3 before:h-7 before:w-0.5 before:rounded-full before:bg-accent"
        : "text-muted-foreground hover:translate-x-0.5 hover:bg-surface-hover/60 hover:text-foreground",
    );

  return (
    <nav
      aria-label="Điều hướng chính"
      className="flex h-full flex-col gap-1 border-r border-border bg-surface/45 px-3 py-5"
    >
      <Link href="/" className="mb-8 flex h-10 items-center px-3" aria-label="Vọng — Trang chủ">
        <Image
          src="/brand/vong-wordmark.png"
          alt="Vọng"
          width={1120}
          height={300}
          preload
          className="h-auto w-24"
        />
      </Link>

      <p className="eyebrow px-3 pb-2">Khám phá</p>

      {DISCOVERY_LINKS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={itemClass(active)}
          >
            <Icon
              className={cn("size-4 shrink-0", active && "text-accent-text")}
            />
            {label}
          </Link>
        );
      })}

      <p className="eyebrow px-3 pb-2 pt-6">Thư viện</p>

      {LIBRARY_LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={itemClass(active)}
          >
            <Icon
              className={cn("size-4 shrink-0", active && "text-accent-text")}
            />
            {label}
          </Link>
        );
      })}

      <div className="mt-auto space-y-3 pt-6">
        <Link
          href="/settings"
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          className={itemClass(pathname.startsWith("/settings"))}
        >
          <Settings
            className={cn(
              "size-4 shrink-0",
              pathname.startsWith("/settings") && "text-accent-text",
            )}
          />
          Cài đặt
        </Link>

        <div className="flex items-center justify-between gap-2 px-1">
          <ThemeToggle />
          <Link
            href="/api/auth/signout"
            aria-label="Đăng xuất"
            title="Đăng xuất"
            className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            <LogOut className="size-4" />
          </Link>
        </div>

        <p className="truncate border-t border-border px-3 pt-3 text-xs text-subtle">
          {userName ?? "Đã đăng nhập"}
        </p>
      </div>
    </nav>
  );
}
