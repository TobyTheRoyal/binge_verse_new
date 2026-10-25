import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaSuggestions } from "./use-media-suggestions";
import { searchSuggestions, type MediaItem } from "@/lib/tmdb.functions";

vi.mock("@/lib/tmdb.functions", () => ({ searchSuggestions: vi.fn() }));
const item = { id: 1, title: "Inception" } as MediaItem;
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(searchSuggestions).mockReset();
});

describe("search suggestion requests", () => {
  it("never requests empty or single-character queries", () => {
    renderHook(() => useMediaSuggestions(" i "), { wrapper: wrapper() });
    expect(searchSuggestions).not.toHaveBeenCalled();
  });
  it("trims the query and returns cached metadata", async () => {
    vi.mocked(searchSuggestions).mockResolvedValue({ results: [item], total: 1 });
    const { result } = renderHook(() => useMediaSuggestions(" inception "), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toEqual([item]));
    expect(searchSuggestions).toHaveBeenCalledWith({
      data: { query: "inception", limit: 6 },
      signal: expect.any(AbortSignal),
    });
  });
  it("debounces typing and hides stale results immediately", async () => {
    vi.useFakeTimers();
    vi.mocked(searchSuggestions).mockResolvedValue({ results: [item], total: 1 });
    const { result, rerender } = renderHook((query: string) => useMediaSuggestions(query), {
      initialProps: "",
      wrapper: wrapper(),
    });
    rerender("in");
    rerender("inc");
    rerender("inception");
    expect(searchSuggestions).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(searchSuggestions).toHaveBeenCalledTimes(1);
    expect(vi.mocked(searchSuggestions).mock.calls[0][0].data.query).toBe("inception");
    rerender("matrix");
    expect(result.current).toEqual([]);
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(searchSuggestions).toHaveBeenCalledTimes(2);
  });
  it("handles request failures without showing stale suggestions", async () => {
    vi.mocked(searchSuggestions).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useMediaSuggestions("matrix"), { wrapper: wrapper() });
    await waitFor(() => expect(searchSuggestions).toHaveBeenCalledTimes(1));
    expect(result.current).toEqual([]);
  });
});
