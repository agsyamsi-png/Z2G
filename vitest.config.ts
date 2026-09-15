import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    env: {
      DB_PATH: path.resolve(__dirname, "data/test_migration.db"),
      MOCK_PROVIDERS: "true",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
