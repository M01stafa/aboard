import { serve } from "@hono/node-server";
import { createGatewayApp } from "./app.js";

const port = Number(process.env.PORT || "8787");
const app = createGatewayApp();

console.log(
  JSON.stringify({
    level: "info",
    message: `Aboard PDF Gateway starting on port ${port}`,
    stirlingUrl: process.env.STIRLING_URL || "http://stirling:8080",
    supabaseUrl: process.env.SUPABASE_URL || "https://example.supabase.co",
    allowedOrigins: process.env.ALLOWED_ORIGINS || process.env.APP_ORIGIN || "http://localhost:3000",
  })
);

serve({
  fetch: app.fetch,
  port,
});
