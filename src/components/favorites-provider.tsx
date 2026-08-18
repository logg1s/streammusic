"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

interface FavoritesValue {
  ids: ReadonlySet<string>;
  pending: ReadonlySet<string>;
  toggle: (id: string) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesValue | null>(null);

export function FavoritesProvider({
  initialIds,
  children,
}: {
  initialIds: string[];
  children: React.ReactNode;
}) {
  const [ids, setIds] = useState(() => new Set(initialIds));
  const idsRef = useRef(new Set(initialIds));
  const [pending, setPending] = useState(() => new Set<string>());

  const toggle = useCallback(async (id: string) => {
    const adding = !idsRef.current.has(id);
    const optimistic = new Set(idsRef.current);
    if (adding) optimistic.add(id);
    else optimistic.delete(id);
    idsRef.current = optimistic;
    setIds(optimistic);
    setPending((current) => new Set(current).add(id));

    try {
      const response = await fetch("/api/favorites", {
        method: adding ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Không cập nhật được Yêu thích");
    } catch (error) {
      const rollback = new Set(idsRef.current);
      if (adding) rollback.delete(id);
      else rollback.add(id);
      idsRef.current = rollback;
      setIds(rollback);
      throw error;
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const value = useMemo(() => ({ ids, pending, toggle }), [ids, pending, toggle]);
  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesValue {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error("useFavorites must be inside FavoritesProvider");
  return value;
}
