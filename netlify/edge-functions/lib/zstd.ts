// zstd.ts - Dictionary-capable Zstandard compression at the edge.
//
// The edge runtime has no native zstd, and `CompressionStream` does not take a
// dictionary - which is what the 2026-08 spec review recorded as making RFC 9842
// unimplementable here. It runs WebAssembly, though, and zstd exposes
// `ZSTD_compress_usingDict` through it.
//
// The import is the vendored bundle rather than the npm package, and that is
// not incidental. `import ... from "@bokuweb/zstd-wasm"` in an edge function
// resolves through the **node** export condition, which selects a build whose
// init is `readFile(resolve(__dirname, './zstd.wasm'))`. Deno Deploy has no
// filesystem, so that could never work - and it failed in three different
// disguises before that was clear. scripts/vendor-zstd.mjs has the full story;
// the short version is that the browser build does the right thing, the
// package's `exports` map makes it unreachable, and bundling it by file path is
// the way in.
//
// The wasm arrives inline as base64, so instantiation is CPU and no network.
//
// See docs/netlify-proposals/01-compression-dictionary-transport.md

import {
  compressUsingDict,
  createCCtx,
  Module,
  waitInitialized,
  wasmBinaryBase64,
} from "./vendor/zstd-wasm.js";

/**
 * Compression level. 10 is well past the knee of the curve for HTML against a
 * good dictionary, and the delta is small enough by then that going higher buys
 * bytes that are not worth the CPU on a per-request path.
 */
const COMPRESSION_LEVEL = 10;

let ready: Promise<void> | null = null;
let cctx: number | null = null;

/**
 * Instantiate the WASM module once per isolate.
 *
 * Roughly 250KB of wasm to compile, so this is the expensive part and it is
 * deliberately lazy: an isolate that never serves a dictionary-capable client
 * never pays for it.
 */
function ensureReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const binary = Uint8Array.from(atob(wasmBinaryBase64), (c) => c.charCodeAt(0));
      Module.init(binary);
      await waitInitialized();
      cctx = createCCtx();
    })().catch((error) => {
      // Reset so a later request can retry. The caller latches compression off
      // after one failure anyway, but caching a rejected promise here would
      // make even that retry impossible.
      ready = null;
      throw error;
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
