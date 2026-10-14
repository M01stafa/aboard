import { z } from "zod";

// Any future Next.js server code that accesses secrets must import the "server-only" package.

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ required_error: "NEXT_PUBLIC_SUPABASE_URL is required" })
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ required_error: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required" })
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY cannot be empty"),
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z
    .string({ required_error: "NEXT_PUBLIC_GOOGLE_CLIENT_ID is required" })
    .min(1, "NEXT_PUBLIC_GOOGLE_CLIENT_ID cannot be empty"),
  NEXT_PUBLIC_GOOGLE_API_KEY: z
    .string({ required_error: "NEXT_PUBLIC_GOOGLE_API_KEY is required" })
    .min(1, "NEXT_PUBLIC_GOOGLE_API_KEY cannot be empty"),
  NEXT_PUBLIC_GOOGLE_APP_ID: z
    .string({ required_error: "NEXT_PUBLIC_GOOGLE_APP_ID is required" })
    .min(1, "NEXT_PUBLIC_GOOGLE_APP_ID cannot be empty"),
  NEXT_PUBLIC_PDF_API_URL: z
    .string({ required_error: "NEXT_PUBLIC_PDF_API_URL is required" })
    .url("NEXT_PUBLIC_PDF_API_URL must be a valid URL"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function getRawProcessEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    NEXT_PUBLIC_GOOGLE_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    NEXT_PUBLIC_GOOGLE_APP_ID: process.env.NEXT_PUBLIC_GOOGLE_APP_ID,
    NEXT_PUBLIC_PDF_API_URL: process.env.NEXT_PUBLIC_PDF_API_URL,
  };
}

export function validateEnv(raw: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(raw);
  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "variable"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `[Aboard] Invalid or missing environment configuration:\n${formattedErrors}\nCheck your apps/web/.env.local or deployment environment settings.`
    );
  }
  return result.data;
}

export const env: PublicEnv =
  process.env.NODE_ENV === "test" && !process.env.NEXT_PUBLIC_SUPABASE_URL
    ? (new Proxy({} as PublicEnv, {
        get(_target, prop: string) {
          return validateEnv(getRawProcessEnv())[prop as keyof PublicEnv];
        },
      }))
    : validateEnv(getRawProcessEnv());
