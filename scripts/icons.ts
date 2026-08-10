// icons.ts - Derive icon variants from the single source SVG.
//
// The manifest previously declared `"purpose": "any maskable"` on the bare
// icon, which the spec review correctly called out as a claim the artwork does
// not honour: it has no safe zone, so any platform applying a circular mask
// clips it, and it is transparent, so the mask reveals whatever is behind.
//
// Rather than commit a second 50 KB copy that can drift from the original, the
// maskable variant is derived at build time from icon.svg.
//
// See docs/netlify-proposals/05-generated-images.md

/** Fraction of the canvas the artwork may occupy. Platforms may clip 20%. */
export const SAFE_ZONE_SCALE = 0.8;

/** Opaque backdrop, matching `background_color` in manifest.json. */
export const MASKABLE_BACKGROUND = "#f5f5f5";

/**
 * Wrap the source icon's contents in a padded, opaque canvas.
 *
 * The source is used as-is inside a transform rather than re-drawn, so the two
 * cannot diverge: editing icon.svg is the only way to change either.
 */
export function buildMaskableIcon(source: string, size = 400): string {
  const open = source.indexOf(">", source.indexOf("<svg"));
  const close = source.lastIndexOf("</svg>");
  if (open === -1 || close === -1) {
    throw new Error("Source icon is not a well-formed SVG document");
  }

  const inner = source.slice(open + 1, close).trim();
  // Rounded: 400 * (1 - 0.8) / 2 is 39.99999999999999 in binary floating point,
  // which would put that in the generated markup.
  const offset = Math.round(((size * (1 - SAFE_ZONE_SCALE)) / 2) * 1000) / 1000;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" \
viewBox="0 0 ${size} ${size}" role="img" aria-label="NFHN">
  <!-- GENERATED from icon.svg by scripts/build.ts - do not edit. -->
  <rect width="${size}" height="${size}" fill="${MASKABLE_BACKGROUND}"/>
  <g transform="translate(${offset} ${offset}) scale(${SAFE_ZONE_SCALE})">
${inner}
  </g>
</svg>
`;
}
