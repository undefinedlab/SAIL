/**
 * Parse JSON from a fetch Response. If the server returned HTML (common when the URL
 * hits the Next app or a 404 page), throw a clear error instead of JSON.parse noise.
 */
export async function parseApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const start = text.trimStart();
  if (start.startsWith("<!") || start.toLowerCase().startsWith("<html")) {
    throw new Error(
      `API returned HTML instead of JSON (HTTP ${res.status}). Point NEXT_PUBLIC_SEAL_API_URL at the SEAL backend, or run Next with SEAL_API_PROXY_TARGET so /api routes proxy to it.`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    const hint = text.length > 160 ? `${text.slice(0, 160)}…` : text;
    throw new Error(
      `Invalid JSON from API (HTTP ${res.status}): ${e instanceof Error ? e.message : String(e)}. Body: ${hint}`
    );
  }
}
