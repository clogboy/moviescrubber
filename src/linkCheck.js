const TIMEOUT_MS = 5000;

export async function isLinkAvailable(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal
    });

    return res.status === 200;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
