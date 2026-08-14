import { cn } from "@/lib/utils";

/**
 * Ba vạch nhấp nháy, thay cho số thứ tự ở dòng bài đang phát.
 * Đứng yên khi tạm dừng — trạng thái nhìn thấy được, không chỉ là trang trí.
 */
export function Equalizer({
  playing,
  className,
}: {
  playing: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("flex h-3.5 items-end gap-[2px]", className)}
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[2px] rounded-full bg-accent",
            playing ? "eq-bar" : "opacity-60",
          )}
          style={{
            height: "100%",
            animationDelay: `${i * 160}ms`,
            transform: playing ? undefined : `scaleY(${[0.4, 0.8, 0.55][i]})`,
            transformOrigin: "bottom",
          }}
        />
      ))}
    </span>
  );
}
