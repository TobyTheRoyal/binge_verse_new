import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchSuggestions } from "@/lib/tmdb.functions";

export function useMediaSuggestions(text: string) {
  const query = text.trim();
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  const result = useQuery({
    queryKey: ["search-suggestions", debounced],
    enabled: debounced.length >= 2 && query === debounced,
    queryFn: ({ signal }) => searchSuggestions({ data: { query: debounced, limit: 6 }, signal }),
    staleTime: 5 * 60 * 1000,
  });
  return query.length >= 2 && query === debounced ? (result.data?.results ?? []) : [];
}
