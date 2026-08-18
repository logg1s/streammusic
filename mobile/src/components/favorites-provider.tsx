import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiJson, useSession } from "@/lib/api";

interface FavoriteResponse {
  ids: string[];
}

interface FavoritesValue {
  ids: ReadonlySet<string>;
  pending: ReadonlySet<string>;
  toggle: (id: string) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesValue | null>(null);
const EMPTY_IDS = new Set<string>();

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { token } = useSession();
  const [ids, setIds] = useState(() => new Set<string>());
  const idsRef = useRef(new Set<string>());
  const [loadedToken, setLoadedToken] = useState<string | null>(null);
  const [pending, setPending] = useState(() => new Set<string>());

  useEffect(() => {
    let alive = true;
    if (!token) {
      idsRef.current = new Set();
      return;
    }
    idsRef.current = new Set();
    apiJson<FavoriteResponse>("/api/favorites")
      .then((result) => {
        if (alive) {
          idsRef.current = new Set(result.ids);
          setLoadedToken(token);
          setIds(idsRef.current);
        }
      })
      .catch(() => {
        // Màn danh sách sẽ hiện lỗi riêng; nút tim vẫn có thể thử lại khi bấm.
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const toggle = useCallback(async (id: string) => {
    const adding = !idsRef.current.has(id);
    const optimistic = new Set(idsRef.current);
    if (adding) optimistic.add(id);
    else optimistic.delete(id);
    idsRef.current = optimistic;
    setIds(optimistic);
    setPending((current) => new Set(current).add(id));
    try {
      await apiJson("/api/favorites", {
        method: adding ? "POST" : "DELETE",
        body: JSON.stringify({ id }),
      });
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

  const value = useMemo(
    () => ({
      ids: token && loadedToken === token ? ids : EMPTY_IDS,
      pending,
      toggle,
    }),
    [ids, loadedToken, pending, token, toggle],
  );
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
