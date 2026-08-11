// live.ts - Tells a reader sitting on a thread when it has moved.
//
// HN threads are at their most active in the hours when you are most likely to
// be reading them, and a cached page has no way of saying so. This is a
// Server-Sent Events stream that does: connect while you read, and get told
// when the comment count changes.
//
// The interesting part is what it does *not* do. The obvious implementation has
// every open connection polling HN, which turns a popular thread into hundreds
// of requests a minute against someone else's API. Instead the scheduled
// function in netlify/functions/hn-invalidate.mts - which is already polling
// `updates.json` once a minute to drive cache-tag purges - writes what changed
// into a Blobs index. A stream reads that index, and only fetches the item when
// the index says that item actually moved. HN sees one poll a minute regardless
// of how many people are connected.
//
// Streams are deliberately bounded. `EventSource` reconnects on its own, so a
// stream that closes after a few minutes costs a reconnect and buys a
// guarantee: no connection outlives its usefulness, and nothing here depends on
// an edge function being allowed to hold a response open indefinitely.
//
// See docs/netlify-proposals/02-cache-tags-and-purge-api.md

import type { Config, Context } from "@netlify/edge-functions";
import { fetchItem } from "./lib/hn.ts";
import { parsePositiveInt } from "./lib/handlers.ts";
import { ACTIVITY_KEY, ACTIVITY_STORE, type ActivityIndex, readMirror } from "./lib/store.ts";
import { log } from "./lib/logger.ts";

/** How often a stream checks the activity index. */
export const POLL_MS = 15_000;

/**
 * How long one stream lives before closing and letting the client reconnect.
 *
 * Five minutes is long enough that reconnects are rare and short enough that a
 * reader who has walked away is not still holding a connection an hour later.
 */
export const STREAM_MS = 5 * 60_000;

/** How long the client should wait before reconnecting, in milliseconds. */
export const RETRY_MS = 10_000;

/** Format one SSE message. Exported because the framing is easy to get subtly wrong. */
export function sseEvent(event: string, data: unknown): string {
  // Every line of the payload needs its own `data:` prefix, and the message is
  // terminated by a blank line. JSON.stringify never emits a raw newline, but
  // encoding that assumption into the framing rather than the caller keeps this
  // safe for anything else that gets sent later.
  const body = JSON.stringify(data)
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n");
  return `event: ${event}\n${body}\n\n`;
}

/** Read the activity index, or an empty one when Blobs is unavailable. */
async function readActivity(): Promise<ActivityIndex> {
  // Written by hn-invalidate.mts in the same `{ value, storedAt }` envelope
  // everything else in the store uses, so that this read shares the
  // Blobs-unavailable handling with the rest of the site rather than having
  // its own.
  const record = await readMirror<ActivityIndex>(ACTIVITY_STORE, ACTIVITY_KEY);
  return record?.value ?? {};
}

export default (request: Request, context: Context): Response => {
  const id = parsePositiveInt(context.params.id);
  if (id === null) return new Response("bad id", { status: 400 });

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
          return true;
        } catch {
          // The client went away between the check and the write.
          return false;
        }
      };

      const finish = () => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      // Tell the client how long to wait before reconnecting, so the bounded
      // lifetime below reads as a pause rather than as a failure.
      controller.enqueue(encoder.encode(`retry: ${RETRY_MS}\n\n`));

      const item = await fetchItem(id);
      if (!item) {
        send("error", { message: "unavailable" });
        finish();
        return;
      }

      let known = item.comments_count ?? 0;
      send("comments", { id, count: known });

      const startedAt = Date.now();
      // The client's own count, so a reconnect does not re-announce a change it
      // has already seen and rendered.
      const since = Number(new URL(request.url).searchParams.get("since"));
      if (Number.isFinite(since) && since > 0) known = Math.max(known, since);

      const tick = async () => {
        if (request.signal?.aborted) return finish();
        if (Date.now() - startedAt >= STREAM_MS) {
          send("bye", { reason: "rotate" });
          return finish();
        }

        try {
          const activity = await readActivity();
          const changedAt = activity[String(id)];
          // Nothing in the index for this item means HN has not reported it
          // changed, which means there is nothing to fetch.
          if (!changedAt || changedAt < startedAt) return;

          const fresh = await fetchItem(id);
          const count = fresh?.comments_count ?? known;
          if (count > known) {
            known = count;
            send("comments", { id, count });
          }
        } catch (error) {
          // A stream that stops updating is a worse outcome than one that
          // misses a tick, so this does not close the connection.
          log.warn("Live update tick failed", { itemId: id, error: String(error) });
        }
      };

      timer = setInterval(tick, POLL_MS);
      // Free the isolate the moment the reader navigates away, rather than at
      // the next tick.
      request.signal?.addEventListener("abort", finish, { once: true });
    },
    cancel() {
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      // A cached event stream is a stream that never updates. All three of
      // these say the same thing to a different layer.
      "cache-control": "no-store",
      "Netlify-CDN-Cache-Control": "no-store",
      "x-accel-buffering": "no",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
};

export const config: Config = {
  method: ["GET"],
  path: "/api/live/:id",
  rateLimit: {
    // Low on purpose. Each of these is a held connection, and a client that
    // needs more than a handful a minute is reconnect-looping, not reading.
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: "ip",
  },
};
