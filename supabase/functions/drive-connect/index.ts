import { rateLimit } from "../_shared/ratelimit.ts";
import { handler, json } from "../_shared/http.ts";
import { requireUser, admin } from "../_shared/supabase.ts";
import { env, DRIVE_SCOPE, REDIRECT_URI } from "../_shared/env.ts";
import { randomToken, pkceChallenge } from "../_shared/crypto.ts";

Deno.serve(
  handler(async (req) => {
    const user = await requireUser(req);
    await rateLimit(`${user.id}:drive-connect`, 10, 600);
    const { returnTo } = await req.json().catch(() => ({}));
    const safeReturn =
      typeof returnTo === "string" &&
      returnTo.length < 200 &&
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
    await admin.from("oauth_states").insert({
      state,
      user_id: user.id,
      code_verifier: verifier,
      return_to: safeReturn,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });

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
  })
);
