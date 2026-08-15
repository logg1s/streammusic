"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";

/** Đổi tên playlist ngay tại tiêu đề, không cần trang cài đặt riêng. */
export function PlaylistRename({
  playlistId,
  name,
}: {
  playlistId: string;
  name: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const res = await fetch(`/api/playlists/${playlistId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: value }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Không đổi được tên.");
      return;
    }
    setEditing(false);
    router.refresh();
  };

  if (!editing) {
    return (
      <button
        type="button"
        aria-label="Đổi tên playlist"
        title="Đổi tên playlist"
        onClick={() => setEditing(true)}
        className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <Pencil className="size-4" />
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label htmlFor="playlist-name" className="sr-only">
        Tên playlist
      </label>
      <input
        id="playlist-name"
        value={value}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        className="w-48 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Lưu tên"
        title="Lưu tên"
        className="grid size-9 place-items-center rounded-full text-accent-text hover:bg-surface-hover"
      >
        <Check className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Huỷ"
        title="Huỷ"
        onClick={() => {
          setValue(name);
          setEditing(false);
          setError(null);
        }}
        className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}
