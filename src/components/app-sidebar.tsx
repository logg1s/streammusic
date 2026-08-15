"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Disc3,
  HardDriveDownload,
  ListMusic,
  ListPlus,
  LogOut,
  Radio,
  Search,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Mới thêm", icon: Radio },
  { href: "/albums", label: "Album", icon: Disc3 },
  { href: "/artists", label: "Nghệ sĩ", icon: Users },
  { href: "/tracks", label: "Bài hát", icon: ListMusic },
  { href: "/playlists", label: "Playlist", icon: ListPlus },
  { href: "/search", label: "Tìm kiếm", icon: Search },
] as const;

export function AppSidebar({ userName }: { userName: string | null }) {
  const pathname = usePathname();

  const itemClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
      active
        ? "bg-surface-hover font-medium text-foreground"
        : "text-muted-foreground hover:bg-surface hover:text-foreground",
    );

  return (
    <nav
      aria-label="Điều hướng chính"
      className="flex h-full flex-col gap-1 border-r border-border px-3 py-5"
    >
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-3">
        <span className="grid size-7 place-items-center rounded-full border border-accent">
          <span className="size-2 rounded-full bg-accent" />
        </span>
        <span className="text-lg font-semibold tracking-tight">Vọng</span>
      </Link>

      <p className="eyebrow px-3 pb-2">Thư viện</p>

      {LINKS.map(({ href, label, icon: Icon }) => {
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

      <div className="mt-auto space-y-3 pt-6">
        <Link
          href="/settings/connections"
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          className={itemClass(pathname.startsWith("/settings"))}
        >
          <HardDriveDownload
            className={cn(
              "size-4 shrink-0",
              pathname.startsWith("/settings") && "text-accent-text",
            )}
          />
          Kho lưu trữ
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
