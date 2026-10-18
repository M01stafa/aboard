import { admin } from "./supabase.ts";
import { HttpError } from "./http.ts";

/** Fixed-window limit backed by Postgres (`check_rate_limit`). Fails CLOSED if the check fails. */
export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number
) {
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new HttpError(503, "rate_limit_unavailable");
  if (!data) throw new HttpError(429, "too_many_requests");
}
