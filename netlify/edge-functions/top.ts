// netlify/edge-functions/geo-greeting.ts

import { crypto } from "https://deno.land/std@0.220.1/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.220.1/encoding/hex.ts";
import { accepts } from "https://deno.land/std@0.220.1/http/negotiation.ts";
import lodash from "https://esm.sh/lodash-es@4.17.21";

export default async (request: Request) => {
  const url = new URL(request.url);

  // Generate a unique request ID using Deno std crypto
  const rawId = crypto.randomUUID();
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawId)
  );
  const requestId = encodeHex(new Uint8Array(hash)).slice(0, 12);

  // Use lodash to build the response payload
  const geo = {
    country: request.headers.get("x-country") ?? "unknown",
    city: request.headers.get("x-nf-client-connection-city") ?? "unknown",
    timezone: request.headers.get("x-nf-client-connection-tz") ?? "UTC",
  };

  const greeting = lodash.template(
    "Hello from <%= city %>, <%= country %>! (TZ: <%= timezone %>)"
  )(geo);

  const payload = lodash.omitBy(
    {
      requestId,
      greeting,
      path: url.pathname,
      country: geo.country,
      city: geo.city,
      timezone: geo.timezone,
      timestamp: new Date().toISOString(),
      debug: url.searchParams.get("debug") ? rawId : undefined,
    },
    lodash.isUndefined
  );

  // Content negotiation — return HTML or JSON
  const contentType = accepts(request, "application/json", "text/html");

  if (contentType === "text/html") {
    const html = `<!DOCTYPE html>
<html><body>
  <h1>${greeting}</h1>
  <pre>${JSON.stringify(payload, null, 2)}</pre>
</body></html>`;
    return new Response(html, {
      headers: {
        "content-type": "text/html",
        "x-request-id": requestId,
      },
    });
  }

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
    },
  });
};

export const config: Config = {
  method: ["GET"],
  path: "/top/:page",
};
