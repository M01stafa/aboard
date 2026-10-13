export const env = {
  supabaseUrl: Deno.env.get("SUPABASE_URL")!,
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  googleClientId: Deno.env.get("GOOGLE_CLIENT_ID")!,
  googleClientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
  tokenEncKey: Deno.env.get("TOKEN_ENC_KEY")!,
  appUrl: Deno.env.get("APP_URL") ?? "http://localhost:3000",
  appOrigins: (Deno.env.get("APP_ORIGINS") ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
};
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const REDIRECT_URI = `${env.supabaseUrl}/functions/v1/drive-callback`;
