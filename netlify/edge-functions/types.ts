// Shared types for Elysia context
export interface SetContext {
  status?: number;
  headers: Record<string, string>;
  redirect?: string;
}
