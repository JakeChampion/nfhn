// errors/types.ts - Custom error types for better error handling

/**
 * Base error class for NFHN application errors.
 * Provides structured error information for logging and error pages.
 */
export class NFHNError extends Error {
  /** HTTP status code for this error */
  readonly statusCode: number;
  /** User-friendly error title for display */
  readonly title: string;
  /** User-friendly error description */
  readonly description: string;
  /** Whether this error is recoverable (can be retried) */
  readonly recoverable: boolean;
  /** Optional request ID for tracking */
  readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    title: string,
    description: string,
    recoverable = false,
    requestId?: string,
  ) {
    super(message);
    this.name = "NFHNError";
    this.statusCode = statusCode;
    this.title = title;
    this.description = description;
    this.recoverable = recoverable;
    this.requestId = requestId;
  }
}

/**
 * Error thrown when a requested resource is not found.
 */
export class NotFoundError extends NFHNError {
  constructor(
    resource: "item" | "user" | "page" | "feed",
    detail?: string,
    requestId?: string,
  ) {
    const messages: Record<typeof resource, { title: string; description: string }> = {
      item: {
        title: "Item not found",
        description: detail ?? "That story is unavailable.",
      },
      user: {
        title: "User not found",
        description: detail ?? "That user doesn't exist.",
      },
      page: {
        title: "Page not found",
        description: detail ?? "We couldn't find what you're looking for.",
      },
      feed: {
        title: "No stories found",
        description: detail ?? "We couldn't find that page of stories.",
      },
    };

    const { title, description } = messages[resource];
    super(`${resource} not found: ${detail ?? "unknown"}`, 404, title, description, false, requestId);
    this.name = "NotFoundError";
  }
}

/**
 * Error thrown when input validation fails.
 */
export class ValidationError extends NFHNError {
  /** The field that failed validation */
  readonly field: string;
  /** The invalid value that was provided */
  readonly value: unknown;

  constructor(
    field: string,
    value: unknown,
    detail?: string,
    requestId?: string,
  ) {
    const description = detail ?? `Invalid ${field} provided.`;
    super(
      `Validation failed for ${field}: ${String(value)}`,
      400,
      "Invalid request",
      description,
      false,
      requestId,
    );
    this.name = "ValidationError";
    this.field = field;
    this.value = value;
  }
}

/**
 * Error thrown when the HN API is unavailable.
 */
export class APIUnavailableError extends NFHNError {
  /** The API endpoint that failed */
  readonly endpoint: string;
  /** Original error from the API call */
  readonly originalError?: Error;

  constructor(
    endpoint: string,
    originalError?: Error,
    requestId?: string,
  ) {
    super(
      `HN API unavailable: ${endpoint}`,
      502,
      "Hacker News is unavailable",
      "Please try again in a moment.",
      true,
      requestId,
    );
    this.name = "APIUnavailableError";
    this.endpoint = endpoint;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when rate limiting is applied.
 */
export class RateLimitError extends NFHNError {
  /** Seconds until the rate limit resets */
  readonly retryAfter: number;

  constructor(retryAfter = 60, requestId?: string) {
    super(
      `Rate limit exceeded, retry after ${retryAfter}s`,
      429,
      "Too many requests",
      `Please wait ${retryAfter} seconds before trying again.`,
      true,
      requestId,
    );
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Error thrown when the circuit breaker is open.
 */
export class CircuitBreakerOpenError extends NFHNError {
  /** Milliseconds until the circuit breaker may reset */
  readonly resetAfterMs: number;

  constructor(resetAfterMs: number, requestId?: string) {
    super(
      `Circuit breaker open, will reset in ${resetAfterMs}ms`,
      503,
      "Service temporarily unavailable",
      "We're experiencing issues connecting to Hacker News. Please try again shortly.",
      true,
      requestId,
    );
    this.name = "CircuitBreakerOpenError";
    this.resetAfterMs = resetAfterMs;
  }
}

/**
 * Error thrown when a timeout occurs.
 */
export class TimeoutError extends NFHNError {
  /** Timeout duration in milliseconds */
  readonly timeoutMs: number;
  /** The operation that timed out */
  readonly operation: string;

  constructor(operation: string, timeoutMs: number, requestId?: string) {
    super(
      `${operation} timed out after ${timeoutMs}ms`,
      504,
      "Request timed out",
      "The request took too long to complete. Please try again.",
      true,
      requestId,
    );
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
    this.operation = operation;
  }
}

/**
 * Type guard to check if an error is an NFHNError.
 */
export function isNFHNError(error: unknown): error is NFHNError {
  return error instanceof NFHNError;
}

/**
 * Convert an unknown error to an NFHNError.
 */
export function toNFHNError(error: unknown, requestId?: string): NFHNError {
  if (isNFHNError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new NFHNError(
    message,
    500,
    "Something went wrong",
    "An unexpected error occurred. Please try again.",
    true,
    requestId,
  );
}
