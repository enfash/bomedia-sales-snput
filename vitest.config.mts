import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Tests use explicit fixtures/mocks; never load private deployment configuration.
  envDir: false,
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Each database test builds a fresh in-memory database by applying every migration, which takes longer as migrations are added
    // and can pass 5 seconds when the machine is busy. A real hang still fails, just later.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
