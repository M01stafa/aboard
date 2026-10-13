import { env } from "./env.ts";

export class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export function cors(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") ?? "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (env.appOrigins.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
  }
  return h;
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors(req) });
    }
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) {
        return json(req, e.status, { code: e.code });
      }
      console.error(e);
      return json(req, 500, { code: "internal_error" });
    }
  };
}
