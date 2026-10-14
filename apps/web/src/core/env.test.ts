import { describe, expect, it } from "vitest";
import { env, validateEnv } from "./env";

describe("env configuration validation", () => {
  const validConfig = {
    NEXT_PUBLIC_SUPABASE_URL: "https://fmlpkcbpoziwkjuxuyaf.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy",
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: "791651476865-vvdeqhfn5tn9vie6gif05di83etol9jr.apps.googleusercontent.com",
    NEXT_PUBLIC_GOOGLE_API_KEY: "AIzaSyAZg12mJFXpdbRTj-RPlnw1o-vkRdE1T8U",
    NEXT_PUBLIC_GOOGLE_APP_ID: "791651476865",
    NEXT_PUBLIC_PDF_API_URL: "http://localhost:8080",
  };

  it("successfully parses valid configuration", () => {
    const validated = validateEnv(validConfig);
    expect(validated.NEXT_PUBLIC_SUPABASE_URL).toBe(validConfig.NEXT_PUBLIC_SUPABASE_URL);
    expect(validated.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(validConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    expect(validated.NEXT_PUBLIC_GOOGLE_CLIENT_ID).toBe(validConfig.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
    expect(validated.NEXT_PUBLIC_GOOGLE_API_KEY).toBe(validConfig.NEXT_PUBLIC_GOOGLE_API_KEY);
    expect(validated.NEXT_PUBLIC_GOOGLE_APP_ID).toBe("791651476865");
    expect(validated.NEXT_PUBLIC_PDF_API_URL).toBe("http://localhost:8080");
  });

  it("throws clear error when a required variable is missing", () => {
    const invalid = { ...validConfig, NEXT_PUBLIC_SUPABASE_URL: undefined };
    expect(() => validateEnv(invalid)).toThrowError(
      /NEXT_PUBLIC_SUPABASE_URL/
    );
  });

  it("throws clear error when an URL is malformed", () => {
    const invalid = { ...validConfig, NEXT_PUBLIC_PDF_API_URL: "not-a-valid-url" };
    expect(() => validateEnv(invalid)).toThrowError(
      /NEXT_PUBLIC_PDF_API_URL must be a valid URL/
    );
  });

  it("throws clear error when an empty string is provided", () => {
    const invalid = { ...validConfig, NEXT_PUBLIC_GOOGLE_API_KEY: "" };
    expect(() => validateEnv(invalid)).toThrowError(
      /NEXT_PUBLIC_GOOGLE_API_KEY cannot be empty/
    );
  });

  it("throws clear error when multiple variables are missing", () => {
    const invalid = {
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: undefined,
      NEXT_PUBLIC_GOOGLE_API_KEY: undefined,
      NEXT_PUBLIC_GOOGLE_APP_ID: undefined,
      NEXT_PUBLIC_PDF_API_URL: undefined,
    };
    expect(() => validateEnv(invalid)).toThrowError(
      /\[Aboard\] Invalid or missing environment configuration:/
    );
  });

  it("throws error when accessing missing env on proxy without environment variables", () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      expect(() => env.NEXT_PUBLIC_SUPABASE_URL).toThrowError(
        /\[Aboard\] Invalid or missing environment configuration:/
      );
    }
  });
});
