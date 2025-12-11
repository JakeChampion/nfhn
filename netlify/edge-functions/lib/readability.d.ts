// Type declarations for readability.js
// Based on Mozilla's Readability library (Arc90 fork)

/**
 * Options for the Readability parser.
 */
export interface ReadabilityOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Maximum number of elements to parse */
  maxElemsToParse?: number;
  /** Number of top candidates to consider */
  nbTopCandidates?: number;
  /** Character threshold for content detection */
  charThreshold?: number;
  /** Additional classes to preserve during parsing */
  classesToPreserve?: string[];
  /** Keep original class attributes */
  keepClasses?: boolean;
  /** Custom serializer function for elements */
  // deno-lint-ignore no-explicit-any
  serializer?: (element: any) => string;
  /** Disable JSON-LD metadata extraction */
  disableJSONLD?: boolean;
  /** Regex for allowed video sources */
  allowedVideoRegex?: RegExp;
  /** Fallback URI for relative URL resolution */
  fallbackURI?: string;
}

/**
 * Result returned by Readability.parse()
 */
export interface ReadabilityArticle {
  /** Article title */
  title: string;
  /** Author byline */
  byline: string | null;
  /** Text direction (ltr/rtl) */
  dir: string | null;
  /** Language code */
  lang: string | null;
  /** Main content as HTML string */
  content: string;
  /** Main content as plain text */
  textContent: string;
  /** Content length in characters */
  length: number;
  /** Excerpt/description */
  excerpt: string;
  /** Site name from metadata */
  siteName: string | null;
  /** Published time from metadata */
  publishedTime: string | null;
}

/**
 * Minimal document interface for Readability.
 * Compatible with both DOM Document and deno-dom's HTMLDocument.
 */
// deno-lint-ignore no-explicit-any
type DocumentLike = any;

/**
 * Readability parser for extracting article content from web pages.
 * @see https://github.com/mozilla/readability
 */
declare class Readability {
  /**
   * Create a new Readability parser.
   * @param doc - The document to parse (DOM Document or deno-dom HTMLDocument)
   * @param options - Parser options
   */
  constructor(doc: DocumentLike, options?: ReadabilityOptions);

  /**
   * Parse the document and extract article content.
   * @returns The extracted article, or null if no article could be found
   */
  parse(): ReadabilityArticle | null;

  /**
   * Check if a document is likely to be parseable as an article.
   * @param doc - The document to check
   * @returns True if the document appears to contain article content
   */
  static isProbablyReaderable(doc: DocumentLike): boolean;
}

export default Readability;
export { Readability };
