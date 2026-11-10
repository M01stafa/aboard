import { rateLimit } from "../_shared/ratelimit.ts";
import { handler, json, HttpError } from "../_shared/http.ts";
import { requireUser, admin } from "../_shared/supabase.ts";
import { decrypt } from "../_shared/crypto.ts";
import { revoke } from "../_shared/google.ts";

export async function handleAccountDelete(req: Request): Promise<Response> {
  const user = await requireUser(req);
  await rateLimit(`${user.id}:account-delete`, 5, 600);

  // 1. If Google Drive was connected, attempt to revoke token at Google
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
      // Swallowed: Google revocation failure should not prevent deleting account
    }
  }

  // 2. Delete user from auth.users (cascades to profiles, projects, google_drive_links, oauth_states)
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    throw new HttpError(500, "account_deletion_failed");
  }

  return json(req, 200, { deleted: true });
}

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(handler(handleAccountDelete));
}
