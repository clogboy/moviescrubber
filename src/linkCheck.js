import { shouldCheckLink as shouldCheckLinkFilters } from "./filters.js";

const TIMEOUT_MS = 5000;

// Re-export filter check for convenience
export const shouldCheckLink = shouldCheckLinkFilters;

// Check if a link is available
export async function isLinkAvailable(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "HEAD", // Use HEAD for faster checks
      redirect: "follow",
      signal: controller.signal
    });

    return res.status === 200;
  } catch (e) {
    // Try with GET if HEAD fails (some servers don't support HEAD)
    try {
      clearTimeout(timeout);
      const timeout2 = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal
      });

      clearTimeout(timeout2);
      return res.status === 200;
    } catch (e2) {
      return false;
    }
  } finally {
    clearTimeout(timeout);
  }
}
