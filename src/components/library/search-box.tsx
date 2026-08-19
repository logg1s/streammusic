"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Clock3, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const HISTORY_KEY = "vong-search-history";
const HISTORY_LIMIT = 3;

function readHistory(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").slice(0, HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function saveQuery(query: string, history: string[]): string[] {
  const next = [query, ...history.filter((item) => item !== query)].slice(
    0,
    HISTORY_LIMIT,
  );
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setHistory(readHistory()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const query = value.trim();
    request.current?.abort();
    if (query.length < 2 || query === initialQuery) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const timer = window.setTimeout(() => {
      void fetch(`/api/youtube/suggestions?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return;
          const body = (await response.json()) as { suggestions?: string[] };
          setSuggestions(body.suggestions ?? []);
        })
        .catch(() => {});
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [initialQuery, value]);

  const run = (raw: string) => {
    const query = raw.trim();
    if (!query) return;
    setHistory((current) => saveQuery(query, current));
    setSuggestions([]);
    setFocused(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(value);
  };

  const choices = suggestions.length > 0 ? suggestions : history;
  const showingHistory = suggestions.length === 0;

  return (
    <div className="relative mb-10 max-w-2xl">
      <form onSubmit={submit} role="search" className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-subtle" />
        <input
          id="q"
          name="q"
          type="search"
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            if (next.trim().length < 2) setSuggestions([]);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          autoComplete="off"
          autoFocus
          placeholder="Bạn muốn nghe gì?"
          className="h-14 w-full rounded-full border border-transparent bg-foreground pl-12 pr-12 text-sm font-medium text-background shadow-lg outline-none placeholder:text-background/60 focus:border-accent"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              setSuggestions([]);
            }}
            aria-label="Xóa từ khóa"
            className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-background/70 hover:bg-background/10 hover:text-background"
          >
            <X className="size-4" />
          </button>
        )}
      </form>

      {focused && choices.length > 0 && (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-xl border border-border bg-surface p-2 shadow-2xl">
          {showingHistory && (
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">
              Tìm gần đây
            </p>
          )}
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValue(choice);
                run(choice);
              }}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-surface-hover",
                !showingHistory && "font-medium",
              )}
            >
              {showingHistory ? (
                <Clock3 className="size-4 shrink-0 text-subtle" />
              ) : (
                <Search className="size-4 shrink-0 text-subtle" />
              )}
              <span className="truncate">{choice}</span>
            </button>
          ))}
        </div>
      )}
      {!focused && history.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-subtle">Tìm gần đây</span>
          {history.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => {
                setValue(choice);
                run(choice);
              }}
              className="inline-flex min-h-9 items-center gap-2 rounded-full bg-surface px-3 text-xs font-medium hover:bg-surface-hover"
            >
              <Clock3 className="size-3.5 text-subtle" />
              {choice}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
