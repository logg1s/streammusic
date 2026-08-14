export function PageHeader({
  eyebrow,
  title,
  readout,
  action,
}: {
  eyebrow: string;
  title: string;
  /** Dòng thông số bằng chữ mono — giọng bảng điều khiển của ứng dụng. */
  readout?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-7 border-b border-border pb-5">
      <p className="eyebrow">{eyebrow}</p>
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {action}
      </div>
      {readout && <p className="readout mt-2 text-balance">{readout}</p>}
    </header>
  );
}

/** Trạng thái rỗng là lời mời hành động, không phải lời xin lỗi. */
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-base font-medium">{title}</p>
      {children && (
        <div className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}
