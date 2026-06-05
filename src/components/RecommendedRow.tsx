import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRatings } from "@/lib/user-data";
import { useAuth } from "@/lib/auth-context";
import { getRecommendationsFor, type MediaItem } from "@/lib/tmdb.functions";
import { MediaRow } from "./MediaRow";

export function RecommendedRow() {
  const { user } = useAuth();
  const { items } = useRatings();
  const fetchRecs = useServerFn(getRecommendationsFor);
  const [recs, setRecs] = useState<MediaItem[]>([]);
  const [seedTitle, setSeedTitle] = useState<string>("");

  useEffect(() => {
    if (!user || items.length === 0) { setRecs([]); return; }
    const seed = [...items].sort((a, b) => b.rating - a.rating)[0];
    if (!seed) return;
    setSeedTitle(seed.title);
    fetchRecs({ data: { media: seed.media_type, id: seed.id } })
      .then((r) => setRecs(r as MediaItem[]))
      .catch(() => setRecs([]));
  }, [user, items, fetchRecs]);

  if (!user || recs.length === 0) return null;
  return <MediaRow title="Empfohlen für dich" subtitle={`Weil du "${seedTitle}" mochtest`} items={recs} />;
}