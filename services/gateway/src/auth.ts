import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface VerifyAuthResult {
  valid: boolean;
  userId?: string;
  error?: string;
}

export type CustomJwtVerifier = (token: string) => Promise<VerifyAuthResult>;

let cachedJwks: JWTVerifyGetKey | null = null;
let customVerifier: CustomJwtVerifier | null = null;

export function setCustomJwtVerifier(verifier: CustomJwtVerifier | null): void {
  customVerifier = verifier;
}

function getJwks(supabaseUrl: string): JWTVerifyGetKey {
  if (!cachedJwks) {
    const jwksUrl = new URL(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`);
    cachedJwks = createRemoteJWKSet(jwksUrl);
  }
  return cachedJwks;
}

/**
 * Verifies Supabase access token (JWT) using project's asymmetric JWKS or legacy secret.
 */
export async function verifySupabaseToken(
  authHeader: string | undefined,
  supabaseUrl: string,
  jwtSecret?: string
): Promise<VerifyAuthResult> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      valid: false,
      error: "Missing or malformed Authorization header (expected Bearer <token>)",
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      valid: false,
      error: "Empty token provided",
    };
  }

  // Use test / custom verifier if registered
  if (customVerifier) {
    return customVerifier(token);
  }

  try {
    if (jwtSecret) {
      // Symmetric legacy secret (HS256)
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(token, secret);
      const userId = typeof payload.sub === "string" ? payload.sub : undefined;
      if (!userId) {
        return { valid: false, error: "JWT payload missing sub (user ID)" };
      }
      return { valid: true, userId };
    }

    // Asymmetric JWKS (RS256 / ES256)
    const jwks = getJwks(supabaseUrl);
    const { payload } = await jwtVerify(token, jwks);
    const userId = typeof payload.sub === "string" ? payload.sub : undefined;
    if (!userId) {
      return { valid: false, error: "JWT payload missing sub (user ID)" };
    }
    return { valid: true, userId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      error: `Invalid token: ${msg}`,
    };
  }
}
