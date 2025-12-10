// logger.ts - Structured logging utilities

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: string;
  stack?: string;
}

function formatEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function createEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: Error,
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  
  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }
  
  if (error) {
    entry.error = error.message;
    if (error.stack) {
      entry.stack = error.stack;
    }
  }
  
  return entry;
}

export const log = {
  debug(message: string, context?: LogContext): void {
    console.debug(formatEntry(createEntry("debug", message, context)));
  },

  info(message: string, context?: LogContext): void {
    console.info(formatEntry(createEntry("info", message, context)));
  },

  warn(message: string, context?: LogContext, error?: Error): void {
    console.warn(formatEntry(createEntry("warn", message, context, error)));
  },

  error(message: string, context?: LogContext, error?: Error): void {
    console.error(formatEntry(createEntry("error", message, context, error)));
  },
};

// Export for testing
export { createEntry, formatEntry };
