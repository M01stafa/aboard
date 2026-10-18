import { rateLimit } from "../_shared/ratelimit.ts";
import { handler, json, HttpError } from "../_shared/http.ts";
import { requireUser, admin } from "../_shared/supabase.ts";
import { decrypt } from "../_shared/crypto.ts";
import { refreshAccessToken, saveLink } from "../_shared/google.ts";

export async function handleDriveToken(req: Request): Promise<Response> {
  const user = await requireUser(req);
  await rateLimit(`${user.id}:drive-token`, 30, 60);

  const { data: link } = await admin
    .from("google_drive_links")
    .select("*")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (!link) throw new HttpError(404, "not_connected");

  const refresh = await decrypt(link.refresh_ct, link.refresh_iv);

  try {
    const tok = await refreshAccessToken(refresh);
    if (tok.refresh_token && tok.refresh_token !== refresh) {
      await saveLink(
        user.id,
        tok.refresh_token,
        tok.scope,
        link.google_email
      );
    }
    await admin
      .from("google_drive_links")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return json(req, 200, {
      access_token: tok.access_token,
      expires_at: Date.now() + tok.expires_in * 1000,
    });
  } catch (e) {
    if (e instanceof HttpError && e.status === 409) {
      await admin
        .from("google_drive_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", user.id);
      throw new HttpError(409, "reconnect_required");
    }
    throw e;
  }
}

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(handler(handleDriveToken));
}
