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
 * Getting at this package from Netlify's edge has taken three goes, so the
 * history is worth keeping:
 *
 *   1. `import { compressUsingDict } from "@bokuweb/zstd-wasm"` threw
 *      `SyntaxError: ... does not provide an export named 'compressUsingDict'`.
 *      The entry point is CommonJS and everything except `init` reaches it
 *      through `__exportStar(require(...), exports)`, which Node's CJS lexer
 *      cannot see through - so the module's apparent named-export list is one
 *      entry long while every function is present at runtime.
 *   2. A namespace import got past the link check but arrived with
 *      `namespace keys: default`, and `default` had no `compressUsingDict`
 *      either.
 *
 * So this stops guessing at one shape. Every plausible place is tried, and if
 * none of them has the function the error reports what was actually found at
 * each level - which is the thing that has been missing each time round.
 *
 * `createRequire` is the interesting one: it loads the module through the real
 * CommonJS loader, which gives back the genuine `module.exports` object with
 * `__exportStar`'s properties already copied onto it. That sidesteps both the
 * ESM link check and any bundler that pruned the namespace down to the
 * properties it could see being accessed statically.
 */
function describe(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object" && typeof value !== "function") return typeof value;
  const keys = Object.keys(value as object);
  return `${typeof value}{${keys.length ? keys.join(",") : "no keys"}}`;
}

const hasApi = (value: unknown): value is ZstdApi =>
  !!value && typeof (value as ZstdApi).compressUsingDict === "function";

async function resolveApi(): Promise<ZstdApi> {
  const namespace = zstdModule as unknown as Record<string, unknown>;
  const attempts: [string, unknown][] = [];

  const record = (label: string, value: unknown) => {
    attempts.push([label, value]);
    return value;
  };

  // Static property reads, so a bundler that prunes namespaces by visible
  // access keeps these rather than shaking them out.
  record("namespace", namespace);
  record("namespace.default", namespace.default);
  record(
    "namespace.default.default",
    (namespace.default as Record<string, unknown> | undefined)?.default,
  );

  try {
    // Deno provides node:module, and this is the CommonJS loader proper. The
    // specifier is a variable so that type-checking does not require
    // @types/node to be installed for what is a runtime fallback.
    const nodeModule = "node:module";
    const { createRequire } = await import(nodeModule) as {
      createRequire: (base: string) => (id: string) => unknown;
    };
    const required = createRequire(import.meta.url)("@bokuweb/zstd-wasm");
    record("require()", required);
    record("require().default", (required as Record<string, unknown> | undefined)?.default);
  } catch (error) {
    attempts.push([`require() threw: ${String(error)}`, undefined]);
  }

  for (const [, candidate] of attempts) {
    if (hasApi(candidate)) return candidate;
  }

  throw new Error(
    "@bokuweb/zstd-wasm exposes no compressUsingDict in this runtime. Tried " +
      attempts.map(([label, value]) => `${label}=${describe(value)}`).join("; "),
  );
}

let ready: Promise<ZstdApi> | null = null;
let cctx: number | null = null;

/** Instantiate the WASM module once per isolate. */
function ensureReady(): Promise<ZstdApi> {
  if (!ready) {
    ready = (async () => {
      const api = await resolveApi();
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
