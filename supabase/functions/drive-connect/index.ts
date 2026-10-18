import { rateLimit } from "../_shared/ratelimit.ts";
import { handler, json, HttpError } from "../_shared/http.ts";
import { requireUser, admin } from "../_shared/supabase.ts";
import { env, DRIVE_SCOPE, REDIRECT_URI } from "../_shared/env.ts";
import { randomToken, pkceChallenge } from "../_shared/crypto.ts";
import { connectBodySchema } from "../_shared/validation.ts";

export async function handleDriveConnect(req: Request): Promise<Response> {
  const user = await requireUser(req);
  await rateLimit(`${user.id}:drive-connect`, 10, 600);

  const rawBody = await req.json().catch(() => ({}));
  const parseRes = connectBodySchema.safeParse(rawBody);
  if (!parseRes.success) throw new HttpError(400, "bad_request");

  const returnTo = parseRes.data.returnTo;
  const safeReturn =
    typeof returnTo === "string" &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//") &&
    !returnTo.includes("\\")
      ? returnTo
      : "/";

  await admin
    .from("oauth_states")
    .delete()
    .lt("expires_at", new Date().toISOString());

  const state = randomToken();
  const verifier = randomToken(48);

  const { error } = await admin.from("oauth_states").insert({
    state,
    user_id: user.id,
    code_verifier: verifier,
    return_to: safeReturn,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new HttpError(500, "store_failed");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: `openid email ${DRIVE_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: user.email ?? "",
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();

  return json(req, 200, { url: url.toString() });
}

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(handler(handleDriveConnect));
}
