// zstd.ts - Dictionary-capable Zstandard compression at the edge.
//
// The edge runtime has no native zstd, and `CompressionStream` does not take a
// dictionary - which is what the 2026-08 spec review recorded as making RFC 9842
// unimplementable here. It runs WebAssembly, though, and `@bokuweb/zstd-wasm`
// exposes `ZSTD_compress_usingDict` through it.
//
// The module is instantiated lazily and once per isolate: instantiation is the
// expensive part, compression itself is not, so an isolate that never serves a
// dictionary-capable client never pays for it.
//
// See docs/netlify-proposals/01-compression-dictionary-transport.md

import { compressUsingDict, createCCtx, init } from "@bokuweb/zstd-wasm";

/**
 * Compression level. 10 is well past the knee of the curve for HTML against a
 * good dictionary, and the delta is small enough by then that going higher buys
 * bytes that are not worth the CPU on a per-request path.
 */
const COMPRESSION_LEVEL = 10;

let ready: Promise<void> | null = null;
let cctx: number | null = null;

/** Instantiate the WASM module once per isolate. */
function ensureReady(): Promise<void> {
  if (!ready) {
    ready = init().then(() => {
      cctx = createCCtx();
    });
  }
  return ready;
}

/**
 * Compress `body` against `dictionary`, returning a raw zstd frame.
 *
 * The frame is *not* wrapped in the `dcz` container - see `frameDcz` in
 * dictionary.ts, which owns the wire format.
 */
export async function compressWithDictionary(
  body: Uint8Array,
  dictionary: Uint8Array,
): Promise<Uint8Array> {
  await ensureReady();
  if (cctx === null) throw new Error("zstd compression context unavailable");
  return compressUsingDict(cctx, body, dictionary, COMPRESSION_LEVEL);
}

/** True once the WASM module has been instantiated in this isolate. */
export const isReady = (): boolean => cctx !== null;
