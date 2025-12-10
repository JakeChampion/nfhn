// render.ts - Re-exports from render/ modules for backward compatibility
// The actual implementation is now split into:
//   - render/components.ts - Reusable UI components
//   - render/pages.ts - Full page templates

export { article, home, userProfile } from "./render/pages.ts";
