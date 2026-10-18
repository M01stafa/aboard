import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadLocalEnv() {
  const envPath = path.resolve(__dirname, ".env.local");
  const envVars = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        envVars[key] = val;
      }
    }
  }
  return envVars;
}

const denoNpmPlugin = {
  name: "deno-npm-resolver",
  enforce: "pre",
  resolveId(source) {
    if (source.startsWith("npm:@supabase/supabase-js")) {
      return require.resolve("@supabase/supabase-js");
    }
    if (source.startsWith("npm:zod")) {
      return require.resolve("zod");
    }
    return null;
  },
};

export default defineConfig({
  plugins: [denoNpmPlugin],
  test: {
    include: ["src/**/*.test.{ts,tsx}", "../../supabase/functions/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    env: loadLocalEnv(),
    setupFiles: [path.resolve(__dirname, "./src/test/setup.ts")],
    server: {
      deps: {
        inline: [/@supabase\/supabase-js/, /zod/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
