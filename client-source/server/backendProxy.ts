import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { Express, Request, Response } from "express";

const VEHIBOOK_ORIGIN = new URL(process.env.LARAVEL_ORIGIN || "http://127.0.0.1:8000");
const DEFAULT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const CLIENT_IDENTITY_HEADERS = new Set([
  "cf-connecting-ip",
  "forwarded",
  "true-client-ip",
  "x-real-ip",
  "x-forwarded-for",
]);

type RequestWithRawBody = Request & { rawBody?: Buffer };

function firstHeaderValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value || "").split(",", 1)[0].trim();
}

function queryString(req: Request): string {
  const queryOffset = req.originalUrl.indexOf("?");
  return queryOffset >= 0 ? req.originalUrl.slice(queryOffset) : "";
}

function getRawBody(req: Request): Buffer | null {
  const body = (req as RequestWithRawBody).rawBody;
  return body && body.byteLength > 0 ? body : null;
}

/**
 * Routes exposed by the BCare browser bundle. The list is intentionally fixed
 * so the application cannot be used as an open proxy.
 */
export function mapBCareProxyPath(pathname: string): string | null {
  if (pathname === "/api/laravel/api/v1" || pathname.startsWith("/api/laravel/api/v1/")) {
    return pathname.slice("/api/laravel".length);
  }

  if (
    pathname === "/api/vehicle-inquiry" ||
    pathname.startsWith("/api/vehicle-inquiry/") ||
    pathname === "/broadcasting/auth" ||
    pathname.startsWith("/broadcasting/auth/") ||
    pathname === "/pusher/auth" ||
    pathname.startsWith("/pusher/auth/")
  ) {
    return pathname;
  }

  return null;
}

export function isBCareProxyPath(pathname: string): boolean {
  return mapBCareProxyPath(pathname) !== null;
}

export function stripCookieDomain(setCookie: string): string {
  return setCookie.replace(/;\s*[Dd]omain=[^;]*/g, "");
}

/**
 * Rebuild the upstream headers from the request while locking Origin and
 * Referer to the trusted VehiBook endpoint. Cookies and browser tokens are
 * forwarded unchanged, while client-IP headers are reduced to one address.
 */
export function buildVehibookHeaders(
  incomingHeaders: IncomingHttpHeaders,
  body: Buffer | null,
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};

  for (const [name, value] of Object.entries(incomingHeaders)) {
    const lowerName = name.toLowerCase();
    if (
      value === undefined ||
      HOP_BY_HOP_HEADERS.has(lowerName) ||
      CLIENT_IDENTITY_HEADERS.has(lowerName) ||
      lowerName === "host" ||
      lowerName === "content-length"
    ) {
      continue;
    }
    headers[lowerName] = value;
  }

  const userAgent = firstHeaderValue(incomingHeaders["user-agent"]);
  const connectedIp = firstHeaderValue(incomingHeaders["cf-connecting-ip"]);
  const forwardedIp = firstHeaderValue(incomingHeaders["x-forwarded-for"]);

  headers.host = VEHIBOOK_ORIGIN.host;
  headers["user-agent"] = userAgent || DEFAULT_BROWSER_USER_AGENT;
  headers.origin = VEHIBOOK_ORIGIN.origin;
  headers.referer = `${VEHIBOOK_ORIGIN.origin}/`;

  if (net.isIP(connectedIp)) {
    headers["x-forwarded-for"] = connectedIp;
  } else if (forwardedIp) {
    headers["x-forwarded-for"] = forwardedIp;
  }

  if (body) {
    headers["content-length"] = String(body.byteLength);
  }

  return headers;
}

function responseHeadersFrom(upstreamHeaders: IncomingHttpHeaders): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};

  for (const [name, value] of Object.entries(upstreamHeaders)) {
    const lowerName = name.toLowerCase();
    if (value === undefined || HOP_BY_HOP_HEADERS.has(lowerName) || lowerName === "transfer-encoding") {
      continue;
    }
    if (lowerName === "set-cookie") {
      const cookies = Array.isArray(value) ? value : [value];
      headers["set-cookie"] = cookies.map(stripCookieDomain);
      continue;
    }
    headers[name] = value;
  }

  return headers;
}

function writeProxyUnavailable(res: Response) {
  if (!res.headersSent) {
    res.status(502).json({
      ok: false,
      error: { code: "VEHIBOOK_UNAVAILABLE", message: "The upstream service is unavailable." },
    });
    return;
  }
  res.end();
}

function forwardToVehibook(req: Request, res: Response, upstreamPath: string) {
  const body = getRawBody(req);
  const url = new URL(upstreamPath, VEHIBOOK_ORIGIN);
  url.search = queryString(req);

  const transport = url.protocol === "https:" ? https : http;
  const defaultPort = url.protocol === "https:" ? 443 : 80;
  const upstream = transport.request(
    {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? parseInt(url.port) : defaultPort,
      method: req.method,
      path: `${url.pathname}${url.search}`,
      headers: buildVehibookHeaders(req.headers, body),
    },
    upstreamResponse => {
      res.writeHead(upstreamResponse.statusCode || 502, responseHeadersFrom(upstreamResponse.headers));
      upstreamResponse.pipe(res);
    },
  );

  upstream.once("error", () => writeProxyUnavailable(res));

  if (body) {
    upstream.end(body);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD" && !req.readableEnded) {
    req.pipe(upstream);
    return;
  }

  upstream.end();
}

/** Register the fixed VehiBook proxy endpoints before static and SPA middleware. */
export function registerBackendProxy(app: Express) {
  app.all("*", (req, res, next) => {
    const upstreamPath = mapBCareProxyPath(req.path);
    if (!upstreamPath) {
      next();
      return;
    }

    forwardToVehibook(req, res, upstreamPath);
  });
}
