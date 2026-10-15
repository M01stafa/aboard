/**
 * Silent persistence request (docs/specs/storage-layer.md §11.3 & STORE-9).
 * Asks the browser not to evict IndexedDB storage, but skips Firefox where it triggers
 * an interactive permission prompt, keeping the product promise of zero permission prompts.
 */
export async function requestPersistenceSilently(
  customNavigator?: Pick<Navigator, "userAgent" | "storage">
): Promise<boolean> {
  const nav =
    customNavigator ?? (typeof navigator !== "undefined" ? navigator : undefined);

  if (!nav || !nav.storage?.persist) {
    return false;
  }

  try {
    if (nav.storage.persisted && (await nav.storage.persisted())) {
      return true;
    }

    // Skip Firefox entirely per STORE-9 (Firefox may show an interactive permission prompt)
    if (/firefox/i.test(nav.userAgent)) {
      return false;
    }

    return await nav.storage.persist();
  } catch {
    return false;
  }
}
