type Primitive = string | number | boolean | null | undefined;

const RAW_HTML_SYMBOL = Symbol("RawHTML");

export interface RawHTML {
  readonly [RAW_HTML_SYMBOL]: true;
  readonly __raw: string;
}

export const raw = (html: string): RawHTML => ({
  [RAW_HTML_SYMBOL]: true,
  __raw: html,
});

export const unsafeHTML = (htmlString: string): RawHTML => raw(htmlString);
export const dangerouslySetInnerHTML = unsafeHTML;

export interface HTML extends AsyncIterable<string> {}

export type HTMLValue =
  | Primitive
  | RawHTML
  | HTML
  | Promise<HTMLValue>
  | Iterable<HTMLValue>
  | AsyncIterable<HTMLValue>
  | (() => HTMLValue | Promise<HTMLValue>);

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

export const htmlToString = async (fragment: HTML): Promise<string> => {
  let out = "";
  for await (const chunk of fragment) out += chunk;
  return out;
};

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
