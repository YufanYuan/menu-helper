export type LogLevel = 'info' | 'warn' | 'error';

export interface RequestLogger {
  info(stage: string, details?: Record<string, unknown>): void;
  warn(stage: string, details?: Record<string, unknown>): void;
  error(stage: string, details?: Record<string, unknown>): void;
}

const MAX_LOG_STRING_LENGTH = 2000;
const MAX_STACK_LENGTH = 4000;

function truncateString(value: string, maxLength = MAX_LOG_STRING_LENGTH): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...<truncated>`;
}

function summarizeUnknown(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
    };
  }

  if (typeof value === 'object') {
    return {
      type: 'object',
      keys: Object.keys(value as Record<string, unknown>).slice(0, 20),
    };
  }

  return String(value);
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: truncateString(error.message),
    };

    if (error.stack) {
      serialized.stack = truncateString(error.stack, MAX_STACK_LENGTH);
    }

    if (error.cause !== undefined) {
      serialized.cause = serializeError(error.cause);
    }

    for (const [key, value] of Object.entries(error as unknown as Record<string, unknown>).slice(0, 20)) {
      if (serialized[key] === undefined) {
        serialized[key] = summarizeUnknown(value);
      }
    }

    return serialized;
  }

  if (typeof error === 'object' && error !== null) {
    const serialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(error as Record<string, unknown>).slice(0, 20)) {
      serialized[key] = summarizeUnknown(value);
    }

    return serialized;
  }

  return { value: summarizeUnknown(error) };
}

function compactDetails(details: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
}

function emitLog(level: LogLevel, entry: Record<string, unknown>): void {
  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.info(line);
}

export function createRequestLogger(params: {
  requestId: string;
  route: string;
  startedAt?: number;
}): RequestLogger {
  const startedAt = params.startedAt ?? Date.now();

  function log(level: LogLevel, stage: string, details?: Record<string, unknown>): void {
    emitLog(level, {
      event: 'backend_request_stage',
      level,
      requestId: params.requestId,
      route: params.route,
      stage,
      elapsedMs: Date.now() - startedAt,
      ...compactDetails(details),
    });
  }

  return {
    info(stage, details) {
      log('info', stage, details);
    },
    warn(stage, details) {
      log('warn', stage, details);
    },
    error(stage, details) {
      log('error', stage, details);
    },
  };
}
