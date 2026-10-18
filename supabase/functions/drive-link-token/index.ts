import { rateLimit } from "../_shared/ratelimit.ts";
import { handler, json, HttpError } from "../_shared/http.ts";
import { requireUser } from "../_shared/supabase.ts";
import {
  refreshAccessToken,
  assertDriveScope,
  saveLink,
} from "../_shared/google.ts";
import { linkTokenBodySchema } from "../_shared/validation.ts";

export async function handleDriveLinkToken(req: Request): Promise<Response> {
  const user = await requireUser(req);
  await rateLimit(`${user.id}:drive-link-token`, 5, 600);

  const rawBody = await req.json().catch(() => ({}));
  const parseRes = linkTokenBodySchema.safeParse(rawBody);
  if (!parseRes.success) {
    throw new HttpError(400, "bad_request");
  }

  const { refresh_token } = parseRes.data;
  const tok = await refreshAccessToken(refresh_token);
  assertDriveScope(tok.scope);
  await saveLink(user.id, refresh_token, tok.scope, user.email ?? null);
  return json(req, 200, { connected: true });
}

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(handler(handleDriveLinkToken));
}
