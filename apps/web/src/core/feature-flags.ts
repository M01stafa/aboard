/**
 * Feature flags for Aboard.
 * Google Drive integration and Google OAuth are temporarily hidden for public beta on *.vercel.app
 * because Google OAuth restricts unverified apps in Testing mode to developer-approved test users.
 * Once a custom domain is configured and Google verification is completed,
 * set NEXT_PUBLIC_ENABLE_GOOGLE_DRIVE=true or flip googleDrive to true.
 */

export const featureFlags = {
  /**
   * Whether Google OAuth and Google Drive UI elements are enabled.
   * Default: false (hidden for public beta).
   */
  googleDrive:
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_ENABLE_GOOGLE_DRIVE === "true",
};

export function isGoogleDriveEnabled(): boolean {
  return featureFlags.googleDrive;
}

