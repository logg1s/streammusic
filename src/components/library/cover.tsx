import Image from "next/image";
import { cn } from "@/lib/utils";

interface CoverProps {
  url: string | null | undefined;
  title: string;
  /** Kích thước hiển thị tính bằng px. Bỏ qua khi `fill` — lúc đó dùng làm gợi ý cho next/image. */
  size: number;
  /** Lấp đầy phần tử cha (cha phải có `position: relative`). Dùng cho lưới co giãn. */
  fill?: boolean;
  className?: string;
  priority?: boolean;
  draggable?: boolean;
}

/** Hai ký tự đầu của tên, dùng khi album không có ảnh bìa. */
function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function Cover({
  url,
  title,
  size,
  fill,
  className,
  priority,
  draggable,
}: CoverProps) {
  const shared = cn(
    "overflow-hidden rounded-md bg-surface ring-1 ring-border",
    fill ? "absolute inset-0 size-full" : "shrink-0",
    className,
  );
  // Chỉ đặt kích thước cố định khi không ở chế độ fill — nếu không, style nội tuyến
  // sẽ đè lên class co giãn của phần tử cha.
  const fixedSize = fill ? undefined : { width: size, height: size };

  if (!url) {
    return (
      <div
        className={cn(shared, "grid place-items-center")}
        style={fixedSize}
        aria-hidden
      >
        <span
          className="font-mono text-subtle"
          style={{ fontSize: Math.max(10, size * 0.26) }}
        >
          {initials(title)}
        </span>
      </div>
    );
  }

  if (fill) {
    return (
      <Image
        src={url}
        alt=""
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
        priority={priority}
        draggable={draggable}
        className={cn(shared, "object-cover")}
      />
    );
  }

  return (
    <Image
      src={url}
      alt=""
      width={size}
      height={size}
      priority={priority}
      draggable={draggable}
      className={cn(shared, "object-cover")}
      style={fixedSize}
    />
  );
}
