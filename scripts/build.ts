// Build script for NFHN
// - Injects DEPLOY_ID into service worker for cache versioning

const DEPLOY_ID = Deno.env.get("DEPLOY_ID") || `dev-${Date.now()}`;

// Inject DEPLOY_ID into service worker
const swPath = "static/sw.js";
const swContent = await Deno.readTextFile(swPath);
const updatedSw = swContent.replace(/__DEPLOY_ID__/g, DEPLOY_ID);
await Deno.writeTextFile(swPath, updatedSw);

console.log(`✓ Injected DEPLOY_ID (${DEPLOY_ID}) into sw.js`);
