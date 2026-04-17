import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    MeasureClass,
    getTraceId,
    measureFunctionWrapper,
    measureObjectWrapper,
    setMetricsLogger,
    startTrackingMetrics,
} from "../src/index";

type LoggedMetric = {
  traceId: string;
  target: Function;
  propertyName: string;
  durationMS: number;
  depthString: string;
  error?: unknown;
};

describe("metrics", () => {
  let logs: LoggedMetric[];

  beforeEach(() => {
    logs = [];
    setMetricsLogger(() => (loggerData) => {
      logs.push(loggerData as LoggedMetric);
    });
  });

  it("deve manter o traceId informado no contexto", async () => {
    const wrapped = measureFunctionWrapper(
      async (value: number) => value + 1,
      "sum",
    );

    await startTrackingMetrics(
      "trace-fixed",
      async () => {
        const result = await wrapped(1);

        expect(result).toBe(2);
        expect(getTraceId()).toBe("trace-fixed");
      },
      1,
    );

    expect(logs).toHaveLength(1);
    expect(logs[0].traceId).toBe("trace-fixed");
    expect(logs[0].propertyName).toBe("sum");
    expect(logs[0].depthString).toBe("1");
    expect(logs[0].error).toBeNull();
  });

  it("deve gerar traceId quando nao informado", () => {
    const traceId = startTrackingMetrics(undefined, () => getTraceId(), 1);

    expect(traceId).toBeTypeOf("string");
    expect(traceId).toBeTruthy();
  });

  it("deve logar erro no wrapper de funcao", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9);
    const wrapped = measureFunctionWrapper(async () => {
      throw new Error("falha esperada");
    }, "explode");

    await expect(
      startTrackingMetrics("trace-error", async () => wrapped(), 0),
    ).rejects.toThrow("falha esperada");

    expect(logs).toHaveLength(1);
    expect(logs[0].traceId).toBe("trace-error");
    expect(logs[0].propertyName).toBe("explode");
    expect(logs[0].error).toBeInstanceOf(Error);

    randomSpy.mockRestore();
  });

  it("deve medir metodos de classe com decorator", async () => {
    class SampleService {
      async execute(): Promise<string> {
        return "ok";
      }
    }

    MeasureClass()(SampleService);
    const service = new SampleService();

    const result = await startTrackingMetrics(
      "trace-class",
      async () => service.execute(),
      1,
    );

    expect(result).toBe("ok");
    expect(logs).toHaveLength(1);
    expect(logs[0].traceId).toBe("trace-class");
    expect(logs[0].propertyName).toBe("execute");
    expect(logs[0].target.name).toBe("SampleService");
  });

  it("deve medir metodos de objeto com proxy", async () => {
    const source = {
      async ping(value: number): Promise<number> {
        return value * 2;
      },
    };

    const wrappedObject = measureObjectWrapper(source, "GatewayClient");

    const result = await startTrackingMetrics(
      "trace-object",
      async () => wrappedObject.ping(5),
      1,
    );

    expect(result).toBe(10);
    expect(logs).toHaveLength(1);
    expect(logs[0].traceId).toBe("trace-object");
    expect(logs[0].propertyName).toBe("ping");
    expect(logs[0].target.name).toBe("GatewayClient");
  });
});
