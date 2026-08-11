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

import * as zstdModule from "@bokuweb/zstd-wasm";

/**
 * Compression level. 10 is well past the knee of the curve for HTML against a
 * good dictionary, and the delta is small enough by then that going higher buys
 * bytes that are not worth the CPU on a per-request path.
 */
const COMPRESSION_LEVEL = 10;

interface ZstdApi {
  init(path?: string): Promise<void>;
  createCCtx(): number;
  compressUsingDict(
    cctx: number,
    body: Uint8Array,
    dictionary: Uint8Array,
    level: number,
  ): Uint8Array;
}

/**
 * Find the functions, wherever this runtime put them.
 *
 * This was `import { compressUsingDict, createCCtx, init } from ...`, and it
 * failed on Netlify's edge with:
 *
 *   SyntaxError: The requested module '@bokuweb/zstd-wasm' does not provide an
 *   export named 'compressUsingDict'
 *
 * The package's entry point is CommonJS, and everything except `init` reaches
 * it through `__exportStar(require(...), exports)`. Node's CJS lexer can see a
 * literal `exports.init = ...` and cannot see through `__exportStar`, so the
 * named-export list the module appears to have is exactly one entry long. The
 * functions are all there at runtime - they are just invisible to the
 * link-time check that a named import performs.
 *
 * A namespace import does no such check, so the properties can be read off the
 * module object once it has actually loaded. `default` is where the CJS interop
 * puts `module.exports`; the namespace itself is where a real ESM build would
 * put them. Try both rather than guessing which resolution a given runtime
 * picked.
 */
function resolveApi(): ZstdApi {
  const namespace = zstdModule as unknown as Record<string, unknown>;
  const candidates = [namespace, namespace.default as Record<string, unknown> | undefined];

  for (const candidate of candidates) {
    if (candidate && typeof candidate.compressUsingDict === "function") {
      return candidate as unknown as ZstdApi;
    }
  }
  throw new Error(
    "@bokuweb/zstd-wasm exposes no compressUsingDict in this runtime; " +
      `namespace keys: ${Object.keys(namespace).join(", ")}`,
  );
}

let ready: Promise<ZstdApi> | null = null;
let cctx: number | null = null;

/** Instantiate the WASM module once per isolate. */
function ensureReady(): Promise<ZstdApi> {
  if (!ready) {
    ready = (async () => {
      const api = resolveApi();
      await api.init();
      cctx = api.createCCtx();
      return api;
    })().catch((error) => {
      // Reset so a later request can retry - the caller latches this off
      // anyway, but a rejected promise cached here would be retried forever
      // with no chance of ever succeeding.
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
  const api = await ensureReady();
  if (cctx === null) throw new Error("zstd compression context unavailable");
  return api.compressUsingDict(cctx, body, dictionary, COMPRESSION_LEVEL);
}

/** True once the WASM module has been instantiated in this isolate. */
export const isReady = (): boolean => cctx !== null;
