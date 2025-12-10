#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * CSS Minifier Script
 *
 * Minifies static/styles.css by:
 * - Removing comments
 * - Removing unnecessary whitespace
 * - Collapsing multiple spaces/newlines
 *
 * Run: deno run --allow-read --allow-write scripts/minify-css.ts
 */

const INPUT_FILE = "static/styles.css";
const OUTPUT_FILE = "static/styles.min.css";

function minifyCSS(css: string): string {
  return (
    css
      // Remove comments (both single-line and multi-line)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Remove newlines and extra whitespace
      .replace(/\s+/g, " ")
      // Remove space before and after specific characters
      .replace(/\s*([{};:,>~+])\s*/g, "$1")
      // Remove trailing semicolons before closing braces
      .replace(/;}/g, "}")
      // Remove space after opening brace and before closing
      .replace(/{\s+/g, "{")
      .replace(/\s+}/g, "}")
      // Clean up any remaining leading/trailing whitespace
      .trim()
  );
}

async function main(): Promise<void> {
  try {
    const input = await Deno.readTextFile(INPUT_FILE);
    const minified = minifyCSS(input);

    // Calculate size reduction
    const originalSize = new TextEncoder().encode(input).length;
    const minifiedSize = new TextEncoder().encode(minified).length;
    const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);

    await Deno.writeTextFile(OUTPUT_FILE, minified);

    console.log(`✓ Minified CSS written to ${OUTPUT_FILE}`);
    console.log(
      `  Original: ${(originalSize / 1024).toFixed(2)} KB`,
    );
    console.log(
      `  Minified: ${(minifiedSize / 1024).toFixed(2)} KB`,
    );
    console.log(`  Reduction: ${reduction}%`);
  } catch (error) {
    console.error("Error minifying CSS:", error);
    Deno.exit(1);
  }
}

main();
