import { rateLimit } from "../_shared/ratelimit.ts";
import { handler, json } from "../_shared/http.ts";
import { requireUser, admin } from "../_shared/supabase.ts";
import { decrypt } from "../_shared/crypto.ts";
import { revoke } from "../_shared/google.ts";

export async function handleDriveDisconnect(req: Request): Promise<Response> {
  const user = await requireUser(req);
  await rateLimit(`${user.id}:drive-disconnect`, 5, 600);

  const { data: link } = await admin
    .from("google_drive_links")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (link) {
    try {
      const refresh = await decrypt(link.refresh_ct, link.refresh_iv);
      await revoke(refresh);
    } catch {
      // Swallowed: token revocation failure at Google should not block disconnecting locally
    }
    await admin.from("google_drive_links").delete().eq("user_id", user.id);
  }

  await admin
    .from("profiles")
    .update({ default_storage: "local" })
    .eq("user_id", user.id);

  return json(req, 200, { connected: false });
}

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(handler(handleDriveDisconnect));
}
