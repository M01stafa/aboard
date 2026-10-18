import { rateLimit } from "../_shared/ratelimit.ts";
import { admin } from "../_shared/supabase.ts";
import { env } from "../_shared/env.ts";
import { HttpError } from "../_shared/http.ts";
import {
  exchangeCode,
  assertDriveScope,
  emailFromIdToken,
  saveLink,
} from "../_shared/google.ts";
import { callbackQuerySchema } from "../_shared/validation.ts";

export const back = (path: string, params: Record<string, string>) =>
  Response.redirect(
    `${env.appUrl}${path}?${new URLSearchParams(params)}`,
    302
  );

export async function handleDriveCallback(req: Request): Promise<Response> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

  try {
    await rateLimit(`ip:${ip}:drive-callback`, 30, 60);
  } catch {
    return back("/", { drive: "error", reason: "rate_limited" });
  }

  const url = new URL(req.url);
  const parseRes = callbackQuerySchema.safeParse({
    state: url.searchParams.get("state") ?? undefined,
    code: url.searchParams.get("code") ?? undefined,
    error: url.searchParams.get("error") ?? undefined,
  });

  if (!parseRes.success) {
    return back("/", { drive: "error", reason: "state" });
  }

  const { state, code, error: googleError } = parseRes.data;

  const { data: row } = await admin
    .from("oauth_states")
    .delete()
    .eq("state", state)
    .select()
    .maybeSingle();

  if (!row || new Date(row.expires_at) < new Date()) {
    return back("/", { drive: "error", reason: "state" });
  }

  if (googleError) {
    return back(row.return_to, { drive: "error", reason: googleError });
  }

  try {
    if (!code) {
      return back(row.return_to, { drive: "error", reason: "missing_code" });
    }
    const tok = await exchangeCode(code, row.code_verifier);
    assertDriveScope(tok.scope);
    if (!tok.refresh_token) {
      return back(row.return_to, {
        drive: "error",
        reason: "no_refresh_token",
      });
    }
    await saveLink(
      row.user_id,
      tok.refresh_token,
      tok.scope,
      emailFromIdToken(tok.id_token)
    );
    return back(row.return_to, { drive: "connected" });
  } catch (e) {
    const reason =
      e instanceof HttpError
        ? e.code
        : e instanceof Error
        ? e.message
        : "unknown";
    return back(row.return_to, { drive: "error", reason });
  }
}

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(handleDriveCallback);
}
