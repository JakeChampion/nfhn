// security.ts - Security headers utilities

import { CSP_DIRECTIVES } from "./config.ts";

export const buildContentSecurityPolicy = (): string => {
  return CSP_DIRECTIVES.join("; ");
};

export const applySecurityHeaders = (headers: Headers): Headers => {
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", buildContentSecurityPolicy());
  }
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  return headers;
};

export const getRequestId = (request: Request): string | undefined =>
  request.headers.get("x-nf-request-id") ?? undefined;
