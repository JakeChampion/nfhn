// blobs.ts - A stand-in for @netlify/blobs that is never available.
//
// Importing @netlify/blobs makes the edge bundler vendor it and add an import map
// entry, which marks the deploy as having a custom import map. This branch keeps
// the deploy to default module resolution, so Blobs is swapped for this module.
// Every caller already treats a throwing getStore as "Blobs is unavailable" and
// carries on without the optimisation.

/** The part of the Blobs store API the edge functions use. */
export interface Store {
  get(key: string, options: { type: "json" }): Promise<unknown>;
  get(key: string, options: { type: "arrayBuffer" }): Promise<ArrayBuffer | null>;
  set(key: string, value: ArrayBuffer): Promise<unknown>;
  setJSON(key: string, value: unknown): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

export function getStore(name: string): Store {
  throw new Error(`Blobs is not available on this branch (store "${name}")`);
}
