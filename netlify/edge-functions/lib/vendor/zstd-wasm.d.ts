// Types for the generated zstd-wasm.js. Hand-written, because the bundle is
// emscripten output with no useful type information of its own.

/** The emscripten module object. `init` takes a path or the wasm bytes. */
export const Module: {
  init(filePathOrBuffer: string | Uint8Array): void;
  onRuntimeInitialized?: () => void;
};

/** Resolves once the wasm runtime has finished starting. */
export function waitInitialized(): Promise<void>;

/** Allocate a compression context. Reused for the life of the isolate. */
export function createCCtx(): number;

/** Release a compression context. */
export function freeCCtx(cctx: number): void;

/** Compress `body` against a raw `dictionary`, returning a zstd frame. */
export function compressUsingDict(
  cctx: number,
  body: Uint8Array,
  dictionary: Uint8Array,
  level: number,
): Uint8Array;

/** zstd.wasm, base64-encoded at vendor time so no second request is needed. */
export const wasmBinaryBase64: string;
