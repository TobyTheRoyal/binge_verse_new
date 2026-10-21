import { useEffect, useMemo, useState } from "react";
import { useRatings } from "@/lib/user-data";
import { useAuth } from "@/lib/auth-context";
import { getRecommendationsFor, type MediaItem } from "@/lib/tmdb.functions";
import { MediaRow } from "./MediaRow";

export function RecommendedRow() {
  const { user } = useAuth();
  const { items } = useRatings();
  const [recs, setRecs] = useState<MediaItem[]>([]);

  const seed = useMemo(() => {
    if (!items.length) return null;
    return [...items].sort((a, b) => b.rating - a.rating)[0] ?? null;
  }, [items]);

  useEffect(() => {
    if (!user || !seed) {
      setRecs([]);
      return;
    }

    let isActive = true;

    getRecommendationsFor({ data: { media: seed.media_type, id: seed.id } })
      .then((result) => {
        if (isActive) setRecs(result as MediaItem[]);
      })
      .catch(() => {
        if (isActive) setRecs([]);
      });

    return () => {
      isActive = false;
    };
  }, [user, seed]);

  if (!user || !seed || recs.length === 0) return null;
  return (
    <MediaRow
      title="Empfohlen für dich"
      subtitle={`Weil du "${seed.title}" mochtest`}
      items={recs}
    />
  );
}
