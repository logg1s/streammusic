import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Khối dựng sẵn cho trang Cài đặt.
 *
 * Gom vào một chỗ vì bản Android đã có sẵn bộ này (`mobile/app/settings.tsx` +
 * `SectionHeader`): hai vỏ mà mỗi bên tự vẽ lấy một kiểu hàng thì cùng một công tắc
 * nhìn ra hai thứ khác nhau. Công tắc ở đây phải giống hệt nhau ở mọi mục — đó là lý do
 * `SettingsSwitch` tồn tại thay vì mỗi nơi tự dựng một cái nút.
 */

export function SettingsSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="eyebrow mb-3">{label}</h2>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {children}
      </div>
    </section>
  );
}

/**
 * Một hàng: phần chữ co giãn bên trái, phần điều khiển cố định bên phải.
 *
 * Chữ tiếng Việt dài hơn tiếng Anh và câu mô tả ở đây thường xuống hai dòng, nên cột
 * chữ phải được phép wrap còn cột điều khiển thì `shrink-0` — để flex tự chia là mô tả
 * bị bóp thành một cột hẹp bên cạnh một công tắc lọt thỏm.
 */
export function SettingsRow({
  title,
  hint,
  control,
}: {
  title: string;
  hint?: string;
  control?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {control && <div className="shrink-0">{control}</div>}
    </div>
  );
}

/** Hàng dẫn sang một trang khác — bản web của dấu `›` bên Android. */
export function SettingsLinkRow({
  href,
  title,
  hint,
  readout,
}: {
  href: string;
  title: string;
  hint?: string;
  readout?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-surface-hover"
    >
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
        {readout && <p className="readout mt-1">{readout}</p>}
      </div>
      <ChevronRight className="size-4 shrink-0 text-subtle" />
    </Link>
  );
}

/**
 * Công tắc bật/tắt.
 *
 * `checked === null` nghĩa là chưa đọc xong giá trị đã lưu — hiện sẵn "bật" rồi lật
 * sang "tắt" ngay trước mắt người vừa tắt nó là kiểu nhấp nháy làm mất tin.
 */
export function SettingsSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean | null;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ?? false}
      aria-label={label}
      disabled={checked === null}
      onClick={() => checked !== null && onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border border-border transition-colors",
        checked ? "bg-accent" : "bg-surface-hover",
        checked === null && "opacity-50",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-foreground transition-[left]",
          checked ? "left-[1.5rem]" : "left-0.5",
        )}
      />
    </button>
  );
}
