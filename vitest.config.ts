import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/components",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/components/Navbar.tsx",
        "src/components/RatingStars.tsx",
        "src/lib/navigation*.{ts,tsx}",
        "src/lib/auth-provider.tsx",
        "src/lib/format-rating.ts",
        "src/hooks/use-media-suggestions.ts",
      ],
      thresholds: { perFile: true, lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
