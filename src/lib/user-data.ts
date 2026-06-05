import { useEffect, useState, useCallback } from "react";
import { useAuth } from "./auth-context";

export type Media = "movie" | "tv";

export interface SavedItem {
  id: number;
  media_type: Media;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number;
  addedAt: number;
}

export interface RatingEntry extends SavedItem {
  rating: number; // 1-10
  ratedAt: number;
}

function watchlistKey(userId: string) { return `bv:watchlist:${userId}`; }
function ratingsKey(userId: string) { return `bv:ratings:${userId}`; }

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}
function write<T>(key: string, val: T[]) { localStorage.setItem(key, JSON.stringify(val)); }

const EVT = "bv:userdata";
function emit() { window.dispatchEvent(new Event(EVT)); }

export function useWatchlist() {
  const { user } = useAuth();
  const [items, setItems] = useState<SavedItem[]>([]);

  const refresh = useCallback(() => {
    if (!user) { setItems([]); return; }
    setItems(read<SavedItem>(watchlistKey(user.id)));
  }, [user]);

  useEffect(() => {
    refresh();
    window.addEventListener(EVT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  const inList = (id: number, media_type: Media) =>
    items.some((x) => x.id === id && x.media_type === media_type);

  const add = (item: Omit<SavedItem, "addedAt">) => {
    if (!user) return false;
    const key = watchlistKey(user.id);
    const cur = read<SavedItem>(key);
    if (cur.some((x) => x.id === item.id && x.media_type === item.media_type)) return true;
    write(key, [{ ...item, addedAt: Date.now() }, ...cur]);
    emit();
    return true;
  };

  const remove = (id: number, media_type: Media) => {
    if (!user) return;
    const key = watchlistKey(user.id);
    write(key, read<SavedItem>(key).filter((x) => !(x.id === id && x.media_type === media_type)));
    emit();
  };

  const toggle = (item: Omit<SavedItem, "addedAt">) => {
    if (inList(item.id, item.media_type)) remove(item.id, item.media_type);
    else add(item);
  };

  return { items, inList, add, remove, toggle };
}

export function useRatings() {
  const { user } = useAuth();
  const [items, setItems] = useState<RatingEntry[]>([]);

  const refresh = useCallback(() => {
    if (!user) { setItems([]); return; }
    setItems(read<RatingEntry>(ratingsKey(user.id)));
  }, [user]);

  useEffect(() => {
    refresh();
    window.addEventListener(EVT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  const getRating = (id: number, media_type: Media) =>
    items.find((x) => x.id === id && x.media_type === media_type)?.rating ?? 0;

  const setRating = (item: Omit<RatingEntry, "ratedAt" | "addedAt">) => {
    if (!user) return false;
    const key = ratingsKey(user.id);
    const cur = read<RatingEntry>(key);
    const existing = cur.find((x) => x.id === item.id && x.media_type === item.media_type);
    const next: RatingEntry = {
      ...(existing ?? { ...item, addedAt: Date.now() } as RatingEntry),
      ...item,
      rating: item.rating,
      ratedAt: Date.now(),
    };
    const others = cur.filter((x) => !(x.id === item.id && x.media_type === item.media_type));
    write(key, [next, ...others]);
    emit();
    return true;
  };

  const removeRating = (id: number, media_type: Media) => {
    if (!user) return;
    const key = ratingsKey(user.id);
    write(key, read<RatingEntry>(key).filter((x) => !(x.id === id && x.media_type === media_type)));
    emit();
  };

  return { items, getRating, setRating, removeRating };
}