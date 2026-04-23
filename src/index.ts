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
}

interface MetricsLoggerData {
  traceId: string;
  target: Function;
  propertyName: string;
  durationMS: number;
  depthString: string;
  error?: unknown;
}

const storage = new AsyncLocalStorage<MetricsContext>();

const DEFAULT_SAMPLE_RATE = Number.parseFloat(
  process.env.METRICS_SAMPLE_RATE || "1",
);

export type LoggerFn = (loggerData: MetricsLoggerData) => void;

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
  const indent = "  ".repeat(level);
  const prefix = level === 0 ? "─" : "└";
  const statusIcon = error ? "❌" : "✅";

  return `[${traceId}] ${indent}${prefix}─ (${depthString}) ${statusIcon} ${target.name}.${propertyName}: ${durationMS.toFixed(2)}ms${error ? ` (Error: ${error instanceof Error ? error.message : error})` : ""}`;
};

let currentLogger: LoggerFn = (loggerData) => {
  console.debug(logFormat(loggerData));
};

export function setMetricsLogger(
  loggerBuilder: (formatter: typeof logFormat) => LoggerFn,
): void {
  currentLogger = loggerBuilder(logFormat);
}

/**
 * @param traceId Request ID
 * @param fn Function to execute
 * @param sampleRate Optional: overrides the ENV or default of 0.1
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
        descriptor.value = async function (...args: unknown[]) {
          const context = storage.getStore();
          if (!context) return originalMethod.apply(this, args);

          const myOrder = ++context.childCounter;
          const myId = context.parentPath
            ? `${context.parentPath}.${myOrder}`
            : `${myOrder}`;
          const start = performance.now();
          let capturedError: unknown = null;

          try {
            return await storage.run(
              {
                traceId: context.traceId,
                parentPath: myId,
                childCounter: 0,
                shouldLog: context.shouldLog,
              },
              () => originalMethod.apply(this, args),
            );
          } catch (error) {
            capturedError = error;
            throw error;
          } finally {
            if (context.shouldLog || capturedError) {
              currentLogger({
                traceId: context.traceId,
                target,
                propertyName,
                durationMS: performance.now() - start,
                depthString: myId,
                error: capturedError,
              });
            }
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
export function measureFunctionWrapper<
  T extends (...args: unknown[]) => unknown,
>(fn: T, name?: string): T {
  return async function (this: unknown, ...args: unknown[]) {
    const context = storage.getStore();
    if (!context) return fn.apply(this, args);

    const myOrder = ++context.childCounter;
    const myId = context.parentPath
      ? `${context.parentPath}.${myOrder}`
      : `${myOrder}`;
    const start = performance.now();
    let capturedError: unknown = null;

    try {
      return await storage.run(
        {
          traceId: context.traceId,
          parentPath: myId,
          childCounter: 0,
          shouldLog: context.shouldLog,
        },
        () => fn.apply(this, args),
      );
    } catch (error) {
      capturedError = error;
      throw error;
    } finally {
      if (context.shouldLog || capturedError) {
        currentLogger({
          traceId: context.traceId,
          target: { name: "Function" } as unknown as Function,
          propertyName: name || fn.name || "Anonymous",
          durationMS: performance.now() - start,
          depthString: myId,
          error: capturedError,
        });
      }
    }
  } as unknown as T;
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
        return async function (this: unknown, ...args: unknown[]) {
          const context = storage.getStore();
          const originalWithContext = value.bind(receiver);
          if (!context) return originalWithContext(...args);

          const myOrder = ++context.childCounter;
          const myId = context.parentPath
            ? `${context.parentPath}.${myOrder}`
            : `${myOrder}`;
          const start = performance.now();
          let capturedError: unknown = null;

          try {
            return await storage.run(
              {
                traceId: context.traceId,
                parentPath: myId,
                childCounter: 0,
                shouldLog: context.shouldLog,
              },
              () => originalWithContext(...args),
            );
          } catch (error) {
            capturedError = error;
            throw error;
          } finally {
            if (context.shouldLog || capturedError) {
              currentLogger({
                traceId: context.traceId,
                target: { name } as unknown as Function,
                propertyName: String(prop),
                durationMS: performance.now() - start,
                depthString: myId,
                error: capturedError,
              });
            }
          }
        };
      }
      return value;
    },
  });
}
