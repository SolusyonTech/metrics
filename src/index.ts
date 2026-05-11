/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable no-console */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

interface MetricsContext {
  traceId: string;
  parentPath: string;
  childCounter: number;
  shouldLog: boolean;
  metadata?: Record<string, unknown>;
}

interface MetricsLoggerData {
  traceId: string;
  target: Function;
  propertyName: string;
  durationMS: number;
  depthString: string;
  error?: unknown;
  metadata?: Record<string, unknown>;
}

const storage = new AsyncLocalStorage<MetricsContext>();

const DEFAULT_SAMPLE_RATE = Number.parseFloat(
  process.env.METRICS_SAMPLE_RATE || "1",
);

export type LoggerFn = (loggerData: MetricsLoggerData) => void;

export interface StartTrackingMetricsConfig {
  /**
   * Request trace identifier propagated to all metric logs in the execution context.
   * If not provided, a random UUID will be generated.
   */
  traceId?: string;
  /**
   * Sampling rate from 0 to 1. Values are clamped internally to 0.001..1.
   */
  sampleRate?: number;
  /**
   * Additional key-value metadata propagated to all metric logs in this trace.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Formats the log with visual indent and error signalization (e.g., ❌)
 */
const logFormat = ({
  traceId,
  target,
  propertyName,
  durationMS,
  depthString,
  error,
}: MetricsLoggerData) => {
  const level = (depthString.match(/\./g) || []).length;
  const indent = "\u00A0".repeat(level);
  const prefix = level === 0 ? "─" : "└";
  const statusIcon = error ? "❌" : "✅";

  return `[${traceId}] ${indent}${prefix}─ (${depthString}) ${statusIcon} ${target.name}.${propertyName}: ${durationMS.toFixed(2)}ms${error ? ` (Error: ${error instanceof Error ? error.message : error})` : ""}`;
};

let currentLogger: LoggerFn = (loggerData) => {
  console.debug(logFormat(loggerData));
};

function isPromiseLike<T = unknown>(value: unknown): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function setMetricsLogger(
  loggerBuilder: (formatter: typeof logFormat) => LoggerFn,
): void {
  currentLogger = loggerBuilder(logFormat);
}

/**
 * @param config Tracking configuration
 * @param fn Function to execute
 */
export function startTracking<T>(
  config: StartTrackingMetricsConfig,
  fn: () => T,
): T {
  const { traceId = randomUUID(), sampleRate, metadata } = config;
  const finalRate = sampleRate ?? DEFAULT_SAMPLE_RATE;
  const sanitizedRate = Math.max(0.001, Math.min(1, finalRate));
  const shouldLog = Math.random() <= sanitizedRate;

  return storage.run(
    { traceId, parentPath: "", childCounter: 0, shouldLog, metadata },
    fn,
  );
}

/**
 * @deprecated Use `startTracking` instead.
 */
export function startTrackingMetrics<T>(
  traceId: string | undefined,
  fn: () => T,
  sampleRate?: number,
): T {
  const id = traceId || randomUUID();
  const finalRate = sampleRate ?? DEFAULT_SAMPLE_RATE;
  const sanitizedRate = Math.max(0.001, Math.min(1, finalRate));
  const shouldLog = Math.random() <= sanitizedRate;

  return storage.run(
    { traceId: id, parentPath: "", childCounter: 0, shouldLog },
    fn,
  );
}

export function getTraceId(): string | undefined {
  return storage.getStore()?.traceId;
}

export function addMetadata(entries: Record<string, unknown>): void {
  const context = storage.getStore();
  if (!context) return;
  context.metadata = { ...context.metadata, ...entries };
}

/**
 * Class Decorator: Adjusted with try/catch for error logging
 */
export function MeasureClass() {
  return (target: Function) => {
    const propertyNames = Object.getOwnPropertyNames(target.prototype);
    propertyNames.forEach((propertyName) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        target.prototype,
        propertyName,
      );
      if (
        propertyName !== "constructor" &&
        descriptor &&
        typeof descriptor.value === "function"
      ) {
        const originalMethod = descriptor.value;
        descriptor.value = function (...args: unknown[]) {
          const context = storage.getStore();
          if (!context) return originalMethod.apply(this, args);

          const myOrder = ++context.childCounter;
          const myId = context.parentPath
            ? `${context.parentPath}.${myOrder}`
            : `${myOrder}`;
          const start = performance.now();
          const logMetric = (error: unknown | null = null) => {
            if (context.shouldLog || error) {
              currentLogger({
                traceId: context.traceId,
                target,
                propertyName,
                durationMS: performance.now() - start,
                depthString: myId,
                error,
                metadata: context.metadata,
              });
            }
          };

          try {
            const result = storage.run(
              {
                traceId: context.traceId,
                parentPath: myId,
                childCounter: 0,
                shouldLog: context.shouldLog,
                metadata: context.metadata,
              },
              () => originalMethod.apply(this, args),
            );

            if (isPromiseLike(result)) {
              return result
                .then((value) => {
                  logMetric(null);
                  return value;
                })
                .catch((error) => {
                  logMetric(error);
                  throw error;
                });
            }

            logMetric(null);
            return result;
          } catch (error) {
            logMetric(error);
            throw error;
          }
        };
        Object.defineProperty(target.prototype, propertyName, descriptor);
      }
    });
  };
}

/**
 * Wrapper for Isolated Functions: Adjusted with try/catch for error logging
 */
export function measureFunctionWrapper<TThis, TArgs extends unknown[], TReturn>(
  fn: (this: TThis, ...args: TArgs) => TReturn,
  name?: string,
): (this: TThis, ...args: TArgs) => TReturn {
  return function (this: TThis, ...args: TArgs): TReturn {
    const context = storage.getStore();
    if (!context) return fn.apply(this, args);

    const myOrder = ++context.childCounter;
    const myId = context.parentPath
      ? `${context.parentPath}.${myOrder}`
      : `${myOrder}`;
    const start = performance.now();
    const logMetric = (error: unknown | null = null) => {
      if (context.shouldLog || error) {
        currentLogger({
          traceId: context.traceId,
          target: { name: "Function" } as unknown as Function,
          propertyName: name || fn.name || "Anonymous",
          durationMS: performance.now() - start,
          depthString: myId,
          error,
          metadata: context.metadata,
        });
      }
    };

    try {
      const result = storage.run(
        {
          traceId: context.traceId,
          parentPath: myId,
          childCounter: 0,
          shouldLog: context.shouldLog,
          metadata: context.metadata,
        },
        () => fn.apply(this, args),
      );

      if (isPromiseLike(result)) {
        return result
          .then((value) => {
            logMetric(null);
            return value;
          })
          .catch((error) => {
            logMetric(error);
            throw error;
          }) as TReturn;
      }

      logMetric(null);
      return result as TReturn;
    } catch (error) {
      logMetric(error);
      throw error;
    }
  };
}

/**
 * Proxy for Literal Objects: Adjusted with try/catch for error logging
 */
export function measureObjectWrapper<T extends object>(
  obj: T,
  name: string,
): T {
  return new Proxy(obj, {
    get(target: any, prop: string | symbol, receiver: unknown) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return function (this: unknown, ...args: unknown[]) {
          const context = storage.getStore();
          const originalWithContext = value.bind(receiver);
          if (!context) return originalWithContext(...args);

          const myOrder = ++context.childCounter;
          const myId = context.parentPath
            ? `${context.parentPath}.${myOrder}`
            : `${myOrder}`;
          const start = performance.now();
          const logMetric = (error: unknown | null = null) => {
            if (context.shouldLog || error) {
              currentLogger({
                traceId: context.traceId,
                target: { name } as unknown as Function,
                propertyName: String(prop),
                durationMS: performance.now() - start,
                depthString: myId,
                error,
                metadata: context.metadata,
              });
            }
          };

          try {
            const result = storage.run(
              {
                traceId: context.traceId,
                parentPath: myId,
                childCounter: 0,
                shouldLog: context.shouldLog,
                metadata: context.metadata,
              },
              () => originalWithContext(...args),
            );

            if (isPromiseLike(result)) {
              return result
                .then((resolvedValue) => {
                  logMetric(null);
                  return resolvedValue;
                })
                .catch((error) => {
                  logMetric(error);
                  throw error;
                });
            }

            logMetric(null);
            return result;
          } catch (error) {
            logMetric(error);
            throw error;
          }
        };
      }
      return value;
    },
  });
}
