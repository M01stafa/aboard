const getEnv = (key: string): string => {
  if (typeof Deno !== "undefined" && Deno.env) {
    return Deno.env.get(key) ?? "";
  }
  return (typeof process !== "undefined" && process.env ? process.env[key] : "") ?? "";
};

export const env = {
  supabaseUrl: getEnv("SUPABASE_URL"),
  serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  googleClientId: getEnv("GOOGLE_CLIENT_ID"),
  googleClientSecret: getEnv("GOOGLE_CLIENT_SECRET"),
  tokenEncKey: getEnv("TOKEN_ENC_KEY"),
  appUrl: getEnv("APP_URL") || "http://localhost:3000",
  get appOrigins(): string[] {
    return (getEnv("APP_ORIGINS") || "http://localhost:3000")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
};

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const REDIRECT_URI = `${env.supabaseUrl}/functions/v1/drive-callback`;
