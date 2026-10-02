const BACKEND_ROUTE_PREFIXES = ["/api", "/broadcasting", "/pusher"] as const;

/**
 * Only browser navigation paths should fall through to the React document.
 * API-like paths must remain API responses, even if the endpoint is unknown.
 */
export function shouldServeSpaFallback(pathname: string): boolean {
  return !BACKEND_ROUTE_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
