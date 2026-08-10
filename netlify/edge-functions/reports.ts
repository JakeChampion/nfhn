// reports.ts - Reporting API collector
//
// The full spec review listed the Reporting API under "worth doing, not done
// here" because it "needs a collector endpoint to send them to". This is that
// endpoint - about forty lines of edge function plus a Blobs store.
//
// It closes a real blind spot. The CSP is strict (script-src 'self' plus a
// pinned hash) and a test asserts the hash matches the markup we render, but
// that test cannot prove the policy works in the field: when an extension, a
// rewriting proxy or a browser that hashes differently trips it, nobody finds
// out. Once this exists, CSP violations, deprecation reports, intervention
// reports and bfcache diagnostics all start arriving with no further work.
//
// See docs/netlify-proposals/06-reporting-endpoint.md

import type { Config } from "@netlify/edge-functions";
import { getStore } from "@netlify/blobs";
import { log } from "./lib/logger.ts";

/** Anyone can POST here, so the batch size is capped rather than trusted. */
const MAX_REPORTS_PER_REQUEST = 20;

/** Report types we expect. Anything else is stored under "other". */
const KNOWN_TYPES = new Set([
  "csp-violation",
  "deprecation",
  "intervention",
  "crash",
  "bfcache-blocked",
]);

interface IncomingReport {
  type?: unknown;
  url?: unknown;
  body?: unknown;
  age?: unknown;
}

const isReportContentType = (value: string): boolean =>
  value.startsWith("application/reports+json") ||
  // Chrome still sends CSP reports from `report-uri` with this type. Accepting
  // it means one endpoint covers both the old and new mechanisms.
  value.startsWith("application/csp-report") ||
  value.startsWith("application/json");

/** Normalise a report into something safe to store. */
export const normaliseReport = (raw: IncomingReport): Record<string, unknown> | null => {
  if (!raw || typeof raw !== "object") return null;

  const type = typeof raw.type === "string" && KNOWN_TYPES.has(raw.type) ? raw.type : "other";
  const url = typeof raw.url === "string" ? raw.url.slice(0, 2048) : undefined;

  return {
    type,
    url,
    age: typeof raw.age === "number" ? raw.age : undefined,
    body: raw.body ?? null,
  };
};

export default async (request: Request): Promise<Response> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!isReportContentType(contentType)) {
    return new Response(null, { status: 415 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  // Reporting API sends an array; a bare csp-report posts a single object.
  const batch = Array.isArray(payload) ? payload : [payload];
  const reports = batch
    .slice(0, MAX_REPORTS_PER_REQUEST)
    .map((entry) => normaliseReport(entry as IncomingReport))
    .filter((entry): entry is Record<string, unknown> => entry !== null);

  if (!reports.length) return new Response(null, { status: 400 });

  try {
    const store = getStore("reports");
    const received = new Date().toISOString();
    await Promise.all(
      reports.map((report) =>
        store.setJSON(`${report.type}/${received}-${crypto.randomUUID()}`, {
          ...report,
          received,
        })
      ),
    );
  } catch (error) {
    // Losing a report must never turn into a visible error for the visitor, and
    // the browser has nothing useful to do with a failure here either.
    log.warn("Failed to store reports", { count: reports.length, error: String(error) });
  }

  return new Response(null, { status: 204 });
};

export const config: Config = {
  method: ["POST"],
  path: "/_report",
  rateLimit: {
    // Unauthenticated write endpoint. The cap above bounds one request; this
    // bounds how many requests one source can make.
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: "ip",
  },
};
