import { rateLimit } from "../_shared/ratelimit.ts";
import { handler, json, HttpError } from "../_shared/http.ts";
import { requireUser } from "../_shared/supabase.ts";
import {
  refreshAccessToken,
  assertDriveScope,
  saveLink,
} from "../_shared/google.ts";

Deno.serve(
  handler(async (req) => {
    const user = await requireUser(req);
    await rateLimit(`${user.id}:drive-link-token`, 5, 600);
    const { refresh_token } = await req.json().catch(() => ({}));
    if (typeof refresh_token !== "string" || refresh_token.length < 20) {
      throw new HttpError(400, "bad_request");
    }
    const tok = await refreshAccessToken(refresh_token);
    assertDriveScope(tok.scope);
    await saveLink(user.id, refresh_token, tok.scope, user.email ?? null);
    return json(req, 200, { connected: true });
  })
);
