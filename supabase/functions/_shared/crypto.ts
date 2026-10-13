import { env } from "./env.ts";

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (u: Uint8Array) =>
  b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let cachedKey: CryptoKey | null = null;
async function getKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = await crypto.subtle.importKey(
      "raw",
      unb64(env.tokenEncKey),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"]
    );
  }
  return cachedKey;
}

export async function encrypt(plain: string) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plain)
    )
  );
  return { ct: b64(ct), iv: b64(iv) };
}

export async function decrypt(ct: string, iv: string) {
  const key = await getKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv) },
    key,
    unb64(ct)
  );
  return new TextDecoder().decode(pt);
}

export function randomToken(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return b64url(new Uint8Array(digest));
}
