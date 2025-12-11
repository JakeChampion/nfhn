type Primitive = string | number | boolean | null | undefined;

const RAW_HTML_SYMBOL = Symbol("RawHTML");

/**
 * Represents pre-escaped HTML that should not be escaped again.
 * Created via the `raw()` or `unsafeHTML()` functions.
 */
export interface RawHTML {
  readonly [RAW_HTML_SYMBOL]: true;
  readonly __raw: string;
}

/**
 * Create a RawHTML object from a trusted HTML string.
 * The content will NOT be escaped when interpolated into templates.
 *
 * @param html - The trusted HTML string
 * @returns A RawHTML object that bypasses escaping
 *
 * @example
 * ```ts
 * const trusted = raw("<strong>Bold</strong>");
 * html`<div>${trusted}</div>`; // <div><strong>Bold</strong></div>
 * ```
 */
export const raw = (html: string): RawHTML => ({
  [RAW_HTML_SYMBOL]: true,
  __raw: html,
});

/**
 * Alias for `raw()`. Creates a RawHTML object from a trusted HTML string.
 * Use with caution - content is NOT escaped.
 *
 * @param htmlString - The trusted HTML string
 * @returns A RawHTML object that bypasses escaping
 */
export const unsafeHTML = (htmlString: string): RawHTML => raw(htmlString);

/**
 * Alias for `unsafeHTML()` for React-style naming.
 */
export const dangerouslySetInnerHTML = unsafeHTML;

/**
 * Represents a streamable HTML fragment.
 * Can be iterated asynchronously to get HTML string chunks.
 */
export interface HTML extends AsyncIterable<string> {}

/**
 * Valid values that can be interpolated into HTML templates.
 */
export type HTMLValue =
  | Primitive
  | RawHTML
  | HTML
  | Promise<HTMLValue>
  | Iterable<HTMLValue>
  | AsyncIterable<HTMLValue>
  | (() => HTMLValue | Promise<HTMLValue>);

/**
 * Escape a value for safe HTML output.
 * Converts special characters to HTML entities to prevent XSS.
 *
 * @param value - The value to escape
 * @returns The escaped string, safe for HTML output
 *
 * @example
 * ```ts
 * escape("<script>"); // "&lt;script&gt;"
 * escape("Tom & Jerry"); // "Tom &amp; Jerry"
 * escape(null); // ""
 * ```
 */
export const escape = (value: unknown): string => {
  if (value == null || value === false) return "";
  const str = String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const isRawHTML = (v: unknown): v is RawHTML =>
  typeof v === "object" &&
  v !== null &&
  RAW_HTML_SYMBOL in v &&
  (v as { [RAW_HTML_SYMBOL]: unknown })[RAW_HTML_SYMBOL] === true;

const isAsyncIterable = (v: unknown): v is AsyncIterable<unknown> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] ===
    "function";

const isIterable = (v: unknown): v is Iterable<unknown> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { [Symbol.iterator]?: unknown })[Symbol.iterator] ===
    "function";

const isHTML = (v: unknown): v is HTML => isAsyncIterable(v) && !isRawHTML(v);

// Reuse a single TextEncoder per edge instance
const sharedEncoder = new TextEncoder();

export async function* flattenValue(
  value: HTMLValue,
): AsyncIterable<string> {
  if (value == null || value === false) return;

  if (typeof value === "function") {
    const result = await value();
    yield* flattenValue(result);
    return;
  }

  if (value instanceof Promise) {
    const result = await value;
    yield* flattenValue(result as HTMLValue);
    return;
  }

  if (isRawHTML(value)) {
    yield value.__raw;
    return;
  }

  if (isHTML(value)) {
    for await (const chunk of value) {
      yield chunk;
    }
    return;
  }

  if (isAsyncIterable(value)) {
    for await (const v of value as AsyncIterable<HTMLValue>) {
      yield* flattenValue(v);
    }
    return;
  }

  if (isIterable(value) && typeof value !== "string") {
    for (const v of value as Iterable<HTMLValue>) {
      yield* flattenValue(v);
    }
    return;
  }

  yield escape(value);
}

/**
 * Remove common leading whitespace from a multi-line string.
 * This allows template literals to be indented naturally in source code
 * while producing output without that indentation.
 */
export function dedent(str: string): string {
  // Split into lines, preserving empty lines
  const lines = str.split("\n");

  // Skip if single line or empty
  if (lines.length <= 1) return str;

  // Remove first line if it's empty (common with template literals starting with newline)
  const firstLine = lines[0];
  const lastLine = lines[lines.length - 1];
  const startIndex = firstLine?.trim() === "" ? 1 : 0;
  // Remove last line if it's empty/whitespace only (common with closing backtick on new line)
  const endIndex = lastLine?.trim() === "" ? lines.length - 1 : lines.length;

  const contentLines = lines.slice(startIndex, endIndex);
  if (contentLines.length === 0) return "";

  // Find the minimum indentation (ignoring empty lines)
  let minIndent = Infinity;
  for (const line of contentLines) {
    // Skip empty lines or lines with only whitespace
    if (line.trim() === "") continue;
    const match = line.match(/^(\s*)/);
    if (match?.[1] != null) {
      minIndent = Math.min(minIndent, match[1].length);
    }
  }

  // If no indentation found, return trimmed version
  if (minIndent === Infinity || minIndent === 0) {
    return contentLines.join("\n");
  }

  // Remove the common indentation from each line
  return contentLines
    .map((line) => (line.trim() === "" ? "" : line.slice(minIndent)))
    .join("\n");
}

/**
 * Tagged template literal for creating streamable HTML.
 * Automatically escapes interpolated values to prevent XSS.
 *
 * @param strings - The static parts of the template
 * @param values - The interpolated values
 * @returns An async iterable that yields HTML string chunks
 *
 * @example
 * ```ts
 * const name = "<script>alert('xss')</script>";
 * const page = html`<h1>Hello ${name}</h1>`;
 * // Yields: <h1>Hello &lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;</h1>
 * ```
 *
 * @example
 * ```ts
 * // Nest templates
 * const header = html`<header>Nav</header>`;
 * const page = html`<!DOCTYPE html><html>${header}<main>Content</main></html>`;
 * ```
 *
 * @example
 * ```ts
 * // Stream arrays
 * const items = ["a", "b", "c"];
 * const list = html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`;
 * ```
 */
export function html(
  strings: TemplateStringsArray,
  ...values: HTMLValue[]
): HTML {
  return (async function* (): AsyncGenerator<string> {
    // Build the full string first, then dedent
    let fullString = "";
    const placeholders: { index: number; value: HTMLValue }[] = [];

    for (let i = 0; i < strings.length; i++) {
      fullString += strings[i];
      if (i < values.length) {
        // Use a placeholder marker (null byte + index + null byte)
        const placeholder = `\x00${i}\x00`;
        fullString += placeholder;
        placeholders.push({ index: i, value: values[i] });
      }
    }

    // Dedent the full string
    const dedented = dedent(fullString);

    // Now yield the dedented string, replacing placeholders with actual values
    let lastIndex = 0;
    for (const { index, value } of placeholders) {
      const placeholder = `\x00${index}\x00`;
      const placeholderIndex = dedented.indexOf(placeholder, lastIndex);
      if (placeholderIndex !== -1) {
        yield dedented.slice(lastIndex, placeholderIndex);
        yield* flattenValue(value);
        lastIndex = placeholderIndex + placeholder.length;
      }
    }
    yield dedented.slice(lastIndex);
  })();
}

/**
 * Convert an HTML fragment to a string by collecting all chunks.
 * Useful for testing or when you need the complete HTML synchronously.
 *
 * @param fragment - The HTML fragment to convert
 * @returns The complete HTML as a string
 *
 * @example
 * ```ts
 * const page = html`<h1>Hello</h1>`;
 * const str = await htmlToString(page); // "<h1>Hello</h1>"
 * ```
 */
export const htmlToString = async (fragment: HTML): Promise<string> => {
  let out = "";
  for await (const chunk of fragment) out += chunk;
  return out;
};

/**
 * Convert an HTML fragment to a ReadableStream for streaming responses.
 * Encodes chunks as UTF-8 bytes.
 *
 * @param fragment - The HTML fragment to stream
 * @param encoder - Optional TextEncoder to use (defaults to shared instance)
 * @returns A ReadableStream of Uint8Array chunks
 *
 * @example
 * ```ts
 * const page = html`<h1>Hello</h1>`;
 * const stream = htmlToStream(page);
 * return new Response(stream, { headers: { "content-type": "text/html" } });
 * ```
 */
export function htmlToStream(
  fragment: HTML,
  encoder: TextEncoder = sharedEncoder,
): ReadableStream<Uint8Array> {
  const iterator = fragment[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(value));
      } catch (e) {
        controller.error(e);
      }
    },

    async cancel() {
      if (typeof iterator.return === "function") {
        try {
          await iterator.return();
        } catch {
          // ignore
        }
      }
    },
  });
}

export class HTMLResponse extends Response {
  constructor(body: HTML | string, init?: ResponseInit) {
    const headers = new Headers(init?.headers || undefined);
    if (!headers.has("content-type")) {
      headers.set("content-type", "text/html; charset=utf-8");
    }

    const responseBody = typeof body === "string" ? body : htmlToStream(body);

    super(responseBody as BodyInit, { ...init, headers });
  }
}
