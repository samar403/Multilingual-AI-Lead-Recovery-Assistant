import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    poolOptions: { forks: { execArgv: ["--disable-warning=ExperimentalWarning"] } },
    env: { NODE_ENV: "test", ANTHROPIC_API_KEY: "", DATABASE_PATH: ":memory:" },
  },
});
