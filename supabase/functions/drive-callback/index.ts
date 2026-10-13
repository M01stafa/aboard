import { rateLimit } from "../_shared/ratelimit.ts";
import { admin } from "../_shared/supabase.ts";
import { env } from "../_shared/env.ts";
import {
  exchangeCode,
  assertDriveScope,
  emailFromIdToken,
  saveLink,
} from "../_shared/google.ts";

const back = (path: string, params: Record<string, string>) =>
  Response.redirect(
    `${env.appUrl}${path}?${new URLSearchParams(params)}`,
    302
  );

Deno.serve(async (req) => {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  try {
    await rateLimit(`ip:${ip}:drive-callback`, 30, 60);
  } catch {
    return back("/", { drive: "error", reason: "rate_limited" });
  }

  const q = new URL(req.url).searchParams;
  const state = q.get("state") ?? "";
  const { data: row } = await admin
    .from("oauth_states")
    .delete()
    .eq("state", state)
    .select()
    .maybeSingle();

  if (!row || new Date(row.expires_at) < new Date()) {
    return back("/", { drive: "error", reason: "state" });
  }
  if (q.get("error")) {
    return back(row.return_to, { drive: "error", reason: q.get("error")! });
  }

  try {
    const tok = await exchangeCode(q.get("code") ?? "", row.code_verifier);
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
    const reason = e instanceof Error ? e.message : "unknown";
    return back(row.return_to, { drive: "error", reason });
  }
});
