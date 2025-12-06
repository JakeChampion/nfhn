// Shared types for Elysia context
// Note: This is a simplified interface for the Elysia set object
// used in handler functions. It covers the properties we actually use.
export interface SetContext {
  status?: number;
  headers: Record<string, string>;
  redirect?: string;
}
