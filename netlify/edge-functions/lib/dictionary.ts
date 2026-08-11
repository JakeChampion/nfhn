// dictionary.ts - Compression Dictionary Transport (RFC 9842)
//
// The 2026-08 spec review closed this as "blocked on platform support" on two
// grounds, both of which now have answers:
//
//   1. "Deno's edge runtime exposes no such API." True natively, but the runtime
//      runs WebAssembly, and a WASM zstd build exposes compression against a
//      caller-supplied raw dictionary. The `dcz` container around it is trivial:
//      8 magic bytes, the dictionary's SHA-256, then an ordinary zstd frame.
//   2. "The Vary requirement poisons the cache." `Netlify-Vary:
//      header=Available-Dictionary` keys Netlify's cache specifically, and the
//      cardinality is one hash per deployed dictionary - two cache entries, not
//      thousands.
//
// The third question - does Netlify's CDN pass an unrecognised
// `Content-Encoding` through untouched? - is answered too: it does, confirmed in
// production on another site. That was the last thing holding this back, so it
// is on by default with `NFHN_DICTIONARY_TRANSPORT=0` as a kill switch.
//
// This module owns the wire format and the negotiation. The compressor lives in
// zstd.ts and the dictionary itself in shell-dictionary.ts, both imported lazily
// so an isolate that never serves a dictionary-capable client never instantiates
// the WASM module.
//
// See docs/netlify-proposals/01-compression-dictionary-transport.md

import { isSpeculative } from "./background.ts";

/**
 * Master switch, on by default.
 *
 * The open question was whether Netlify's CDN passes an unrecognised
 * `Content-Encoding` through untouched. It does - confirmed in production on
 * another site - so this is enabled, with `NFHN_DICTIONARY_TRANSPORT=0` left as
 * a kill switch that needs no deploy of new code to use.
 */
export const DICTIONARY_TRANSPORT_ENABLED =
  (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env
    .get("NFHN_DICTIONARY_TRANSPORT") !== "0";

/**
 * The 8-byte magic number that opens a Dictionary-Compressed Zstandard stream.
 * RFC 9842 section 4.2.
 */
// Not frozen: Object.freeze cannot be applied to a typed array with elements.
export const DCZ_MAGIC = new Uint8Array([0x5e, 0x2a, 0x4d, 0x18, 0x20, 0x00, 0x00, 0x00]);

/** Length of the fixed `dcz` header: magic number plus a SHA-256 digest. */
export const DCZ_HEADER_LENGTH = 40;

/** SHA-256 of some bytes, as raw bytes. */
export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return new Uint8Array(digest);
}

/** Lowercase hex, for logging and cache keys. */
export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Wrap an already-zstd-compressed frame in the `dcz` container.
 *
 * The caller supplies the compressed frame because the compressor itself is a
 * WASM module that should be instantiated once per isolate, not once per call.
 */
export function frameDcz(dictionaryHash: Uint8Array, zstdFrame: Uint8Array): Uint8Array {
  if (dictionaryHash.length !== 32) {
    throw new Error(`dcz dictionary hash must be 32 bytes, got ${dictionaryHash.length}`);
  }

  const out = new Uint8Array(DCZ_HEADER_LENGTH + zstdFrame.length);
  out.set(DCZ_MAGIC, 0);
  out.set(dictionaryHash, DCZ_MAGIC.length);
  out.set(zstdFrame, DCZ_HEADER_LENGTH);
  return out;
}

/**
 * Read the dictionary hash out of a `dcz` stream, or null if it is not one.
 *
 * Used by tests and by any future decode path; also the cheapest way to assert
 * that what we produced is well-formed.
 */
export function parseDczHeader(stream: Uint8Array): Uint8Array | null {
  if (stream.length < DCZ_HEADER_LENGTH) return null;
  for (let i = 0; i < DCZ_MAGIC.length; i++) {
    if (stream[i] !== DCZ_MAGIC[i]) return null;
  }
  return stream.slice(DCZ_MAGIC.length, DCZ_HEADER_LENGTH);
}

/**
 * Parse the `Available-Dictionary` request header.
 *
 * The value is a Structured Field Byte Sequence: base64 of the SHA-256, wrapped
 * in colons. Returns the raw digest bytes, or null when absent or malformed.
 */
export function parseAvailableDictionary(headerValue: string | null): Uint8Array | null {
  if (!headerValue) return null;

  const trimmed = headerValue.trim();
  if (trimmed.length < 3 || !trimmed.startsWith(":") || !trimmed.endsWith(":")) return null;

  const base64 = trimmed.slice(1, -1);
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return null;
  }

  // A SHA-256 is 32 bytes; anything else is not a dictionary hash we can use.
  if (binary.length !== 32) return null;

  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Format a digest as the Structured Field Byte Sequence the header uses. */
export function formatAvailableDictionary(digest: Uint8Array): string {
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return `:${btoa(binary)}:`;
}

/** Constant-time-ish comparison. These are public hashes, but avoid early exit anyway. */
export function digestsMatch(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export interface DictionaryOffer {
  /** URLPattern the dictionary applies to, relative to its own origin. */
  match: string;
  /** Fetch destinations it applies to. Empty means all. */
  matchDest?: string[];
  /** Server-side identifier, echoed back in `Dictionary-ID`. */
  id?: string;
}

/**
 * Build the `Use-As-Dictionary` response header.
 *
 * Only `type=raw` exists today, and it is the default, so it is left implicit.
 */
export function useAsDictionaryHeader(offer: DictionaryOffer): string {
  const parts = [`match="${offer.match}"`];
  if (offer.matchDest?.length) {
    parts.push(`match-dest=(${offer.matchDest.map((d) => `"${d}"`).join(" ")})`);
  }
  if (offer.id) parts.push(`id="${offer.id}"`);
  return parts.join(", ");
}

/**
 * Headers a dictionary-compressed response must carry.
 *
 * `Vary` covers caches downstream of Netlify; `Netlify-Vary` keys Netlify's own
 * cache. Both are required: omitting `Vary` poisons shared caches with bodies
 * they cannot decode, and omitting `Netlify-Vary` means Netlify serves one
 * client's delta to a client holding a different dictionary.
 */
export function applyDictionaryVary(headers: Headers): Headers {
  const existing = headers.get("Vary");
  const needed = ["Accept-Encoding", "Available-Dictionary"];
  const merged = new Set(
    (existing ? existing.split(",").map((v) => v.trim()) : []).concat(needed).filter(Boolean),
  );
  headers.set("Vary", [...merged].join(", "));
  headers.set("Netlify-Vary", "header=Available-Dictionary");
  return headers;
}

/**
 * Decide whether this request can be served a delta against `dictionaryHash`.
 *
 * Returns false unless the feature is switched on, the client advertised a
 * dictionary, and it is the one we hold. Any mismatch falls through to whatever
 * encoding Netlify would have negotiated anyway, which is what makes this safe
 * to enable incrementally.
 */
export function canServeDictionaryDelta(
  request: Request,
  dictionaryHash: Uint8Array | null,
): boolean {
  if (!DICTIONARY_TRANSPORT_ENABLED) return false;
  if (!dictionaryHash) return false;

  const accepted = request.headers.get("Accept-Encoding") ?? "";
  if (!accepted.split(",").some((token) => token.trim().split(";")[0] === "dcz")) return false;

  return digestsMatch(
    parseAvailableDictionary(request.headers.get("Available-Dictionary")),
    dictionaryHash,
  );
}

/**
 * Encode a response as `dcz` when the client holds our dictionary.
 *
 * **This must be applied outside the programmable cache, not inside it.**
 * `withProgrammableCache` keys on the URL alone, so a `dcz` body stored there
 * would later be served to a client that never had the dictionary - an
 * undecodable response. Keeping the encode on the way out means the cache always
 * holds plain HTML and the delta is computed per request, against whatever
 * dictionary that particular client actually advertised.
 *
 * Any failure returns the original response unchanged. A missed optimisation is
 * invisible; a corrupted body is not.
 */
export async function encodeWithDictionary(
  request: Request,
  response: Response,
): Promise<Response> {
  if (!DICTIONARY_TRANSPORT_ENABLED) return response;

  // Speculative fetches get the plain body. Dictionary compression is real CPU
  // and nobody is waiting on these bytes: a prerender that is never activated
  // spent that work for nothing, and one that is activated is served from cache
  // rather than recompressed. isSpeculative/isPrerender shipped with the
  // Sec-Purpose work and until now nothing consumed them.
  if (isSpeculative(request)) return response;

  // Only complete, uncompressed HTML bodies. 304s have no body, error pages are
  // not worth the CPU, and anything already encoded must not be double-wrapped.
  if (response.status !== 200 || !response.body) return response;
  if (response.headers.has("Content-Encoding")) return response;

  const advertised = parseAvailableDictionary(request.headers.get("Available-Dictionary"));
  if (!advertised) return response;

  try {
    const { tryGetShellDictionary } = await import("./shell-dictionary.ts");
    const dictionary = await tryGetShellDictionary();
    if (!dictionary || !canServeDictionaryDelta(request, dictionary.hash)) return response;

    const plain = new Uint8Array(await response.arrayBuffer());
    const { compressWithDictionary } = await import("./zstd.ts");
    const frame = await compressWithDictionary(plain, dictionary.bytes);
    const body = frameDcz(dictionary.hash, frame);

    const headers = new Headers(response.headers);
    headers.set("Content-Encoding", "dcz");
    headers.delete("Content-Length");
    applyDictionaryVary(headers);

    return new Response(body as BodyInit, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error("Dictionary encoding failed, serving uncompressed:", error);
    return response;
  }
}
