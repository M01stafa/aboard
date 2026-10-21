import { Hono } from "hono";
import { getToolDefinition, ALLOWED_TOOL_NAMES } from "./tools.js";
import { validateMagicBytes } from "./magic-bytes.js";
import { verifySupabaseToken } from "./auth.js";
import { defaultLimitsManager, UserLimitsManager } from "./limits.js";

export interface GatewayConfig {
  supabaseUrl?: string;
  supabaseJwtSecret?: string;
  stirlingUrl?: string;
  allowedOrigins?: string[];
  limitsManager?: UserLimitsManager;
}

export function createGatewayApp(config?: GatewayConfig) {
  const app = new Hono();

  const supabaseUrl =
    config?.supabaseUrl ||
    process.env.SUPABASE_URL ||
    "https://example.supabase.co";
  const supabaseJwtSecret =
    config?.supabaseJwtSecret || process.env.SUPABASE_JWT_SECRET;
  const stirlingUrl =
    (config?.stirlingUrl || process.env.STIRLING_URL || "http://stirling:8080").replace(/\/+$/, "");
  const limitsManager = config?.limitsManager || defaultLimitsManager;

  const allowedOriginsList =
    config?.allowedOrigins ||
    (process.env.ALLOWED_ORIGINS || process.env.APP_ORIGIN || "http://localhost:3000")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

  // Security headers & nosniff
  app.use("*", async (c, next) => {
    c.header("X-Content-Type-Options", "nosniff");
    await next();
  });

  // Strict CORS middleware
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    const isAllowed = origin && allowedOriginsList.some((allowed) => allowed === origin || allowed === "*");

    if (isAllowed && origin) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Authorization, Content-Type, Content-Length, Accept");
      c.header("Access-Control-Expose-Headers", "Content-Disposition, Content-Type, Content-Length");
    }

    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    await next();
  });

  // Safe structured logger without logging tokens, file names, or contents
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    // Log only method, path, status, and duration
    console.log(
      JSON.stringify({
        level: "info",
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: duration,
      })
    );
  });

  // Health check endpoints
  const handleHealth = (c: { json: (data: Record<string, unknown>, status?: number) => Response }) =>
    c.json({
      status: "ok",
      service: "aboard-pdf-gateway",
      allowedTools: ALLOWED_TOOL_NAMES,
      timestamp: new Date().toISOString(),
    });

  app.get("/health", handleHealth as never);
  app.get("/pdf/health", handleHealth as never);

  // Handler for tool operations
  const handleTool = async (c: import("hono").Context) => {
    const tool = c.req.param("tool") || "";
    const toolDef = getToolDefinition(tool);

    if (!toolDef) {
      return c.json(
        {
          error: "unknown_tool",
          message: `Tool '${tool}' is not in allow-list. Allowed tools: ${ALLOWED_TOOL_NAMES.join(", ")}`,
        },
        400
      );
    }

    // 1. Authenticate with Supabase JWT
    const authHeader = c.req.header("authorization");
    const authResult = await verifySupabaseToken(authHeader, supabaseUrl, supabaseJwtSecret);
    if (!authResult.valid || !authResult.userId) {
      return c.json(
        {
          error: "unauthorized",
          message: authResult.error || "Authentication required",
        },
        401
      );
    }
    const userId = authResult.userId;

    // 2. Check Content-Length size guard
    const contentLength = Number(c.req.header("content-length") || "0");
    if (contentLength > limitsManager.options.maxUploadBytes) {
      return c.json(
        {
          error: "file_too_large",
          message: `Request exceeds maximum allowed size of ${Math.round(limitsManager.options.maxUploadBytes / 1024 / 1024)} MB`,
        },
        413
      );
    }

    // 3. Check per-user rate limit
    if (!limitsManager.checkRateLimit(userId)) {
      return c.json(
        {
          error: "rate_limit_exceeded",
          message: "Rate limit exceeded. Please wait a moment before trying again.",
        },
        429
      );
    }

    // 4. Acquire per-user concurrency slot
    if (!limitsManager.acquireConcurrency(userId)) {
      return c.json(
        {
          error: "concurrency_limit_exceeded",
          message: "A PDF operation is already in progress for your account. Please wait for it to complete.",
        },
        429
      );
    }

    try {
      const contentType = c.req.header("content-type") || "";
      let outgoingFormData: FormData;

      if (contentType.includes("multipart/form-data")) {
        let incomingFormData: FormData;
        try {
          incomingFormData = await c.req.formData();
        } catch {
          return c.json({ error: "invalid_multipart", message: "Failed to parse multipart form data" }, 400);
        }

        // Find file item (fileInput or file or first File)
        let fileItem: File | null = null;
        let fileKey = "fileInput";

        if (incomingFormData.get("fileInput") instanceof File) {
          fileItem = incomingFormData.get("fileInput") as File;
          fileKey = "fileInput";
        } else if (incomingFormData.get("file") instanceof File) {
          fileItem = incomingFormData.get("file") as File;
          fileKey = "file";
        } else {
          for (const [key, val] of incomingFormData.entries()) {
            if (val instanceof File) {
              fileItem = val;
              fileKey = key;
              break;
            }
          }
        }

        if (!fileItem) {
          return c.json({ error: "missing_file", message: "No file provided in form data" }, 400);
        }

        if (fileItem.size > limitsManager.options.maxUploadBytes) {
          return c.json(
            {
              error: "file_too_large",
              message: `File size exceeds limit of ${Math.round(limitsManager.options.maxUploadBytes / 1024 / 1024)} MB`,
            },
            413
          );
        }

        // Magic bytes validation
        const magicSlice = new Uint8Array(await fileItem.slice(0, 8).arrayBuffer());
        const magicResult = validateMagicBytes(tool, magicSlice);
        if (!magicResult.valid) {
          return c.json(
            {
              error: "invalid_file_type",
              message: magicResult.error || "File failed magic byte verification",
            },
            400
          );
        }

        // Construct outgoing FormData for Stirling-PDF
        outgoingFormData = new FormData();
        for (const [key, val] of incomingFormData.entries()) {
          if (key === fileKey) {
            // Stirling-PDF expects 'fileInput'
            outgoingFormData.append("fileInput", val);
          } else {
            outgoingFormData.append(key, val);
          }
        }
      } else {
        // Raw binary body (e.g. application/pdf)
        const arrayBuffer = await c.req.arrayBuffer();
        if (arrayBuffer.byteLength > limitsManager.options.maxUploadBytes) {
          return c.json(
            {
              error: "file_too_large",
              message: `File size exceeds limit of ${Math.round(limitsManager.options.maxUploadBytes / 1024 / 1024)} MB`,
            },
            413
          );
        }

        const magicSlice = new Uint8Array(arrayBuffer.slice(0, 8));
        const magicResult = validateMagicBytes(tool, magicSlice);
        if (!magicResult.valid) {
          return c.json(
            {
              error: "invalid_file_type",
              message: magicResult.error || "File failed magic byte verification",
            },
            400
          );
        }

        outgoingFormData = new FormData();
        const blob = new Blob([arrayBuffer], { type: contentType || "application/pdf" });
        outgoingFormData.append("fileInput", blob, "document.pdf");
      }

      // Forward to Stirling-PDF on the internal Docker network
      const targetUrl = `${stirlingUrl}${toolDef.endpoint}`;
      let stirlingRes: Response;
      try {
        stirlingRes = await fetch(targetUrl, {
          method: "POST",
          body: outgoingFormData,
        });
      } catch (fetchErr: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Failed to connect to downstream Stirling-PDF service",
            error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
          })
        );
        return c.json(
          {
            error: "upstream_unavailable",
            message: "PDF processing engine is temporarily unreachable. Please try again shortly.",
          },
          502
        );
      }

      if (!stirlingRes.ok) {
        return c.json(
          {
            error: "processing_failed",
            message: "The PDF processing operation failed on the server",
          },
          stirlingRes.status as 400 | 500
        );
      }

      // Stream the processed PDF binary response directly back to the client
      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", stirlingRes.headers.get("content-type") || "application/pdf");
      const disposition = stirlingRes.headers.get("content-disposition");
      if (disposition) {
        responseHeaders.set("Content-Disposition", disposition);
      } else {
        responseHeaders.set("Content-Disposition", `attachment; filename="${tool}-result.pdf"`);
      }
      responseHeaders.set("X-Content-Type-Options", "nosniff");

      return new Response(stirlingRes.body, {
        status: 200,
        headers: responseHeaders,
      });
    } finally {
      limitsManager.releaseConcurrency(userId);
    }
  };

  // Route both /pdf/:tool and /:tool (in case Caddy strips or preserves path prefix)
  app.post("/pdf/:tool", handleTool);
  app.post("/:tool", handleTool);

  return app;
}
