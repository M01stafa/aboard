import { createClient } from "npm:@supabase/supabase-js@2";
import { env } from "./env.ts";
import { HttpError } from "./http.ts";

export const admin = createClient(
  env.supabaseUrl || "https://placeholder.supabase.co",
  env.serviceRoleKey || "placeholder-key",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

export async function requireUser(req: Request) {
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new HttpError(401, "missing_token");
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "invalid_token");
  return data.user;
}
