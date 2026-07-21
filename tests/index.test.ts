import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MeasureClass,
  getTraceId,
  measureFunctionWrapper,
  measureObjectWrapper,
  setMetricsLogger,
  startTracking,
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

  it("should log first call and then follow sampleInterval", async () => {
    class IntervalSampleService {
      execute(value: number): number {
        return value;
      }
    }

    MeasureClass()(IntervalSampleService);
    const service = new IntervalSampleService();

    for (let i = 1; i <= 5; i++) {
      await startTracking(
        {
          traceId: `trace-interval-${i}`,
          sampleRate: 0,
          sampleInterval: 2,
        },
        () => service.execute(i),
      );
    }

    expect(logs).toHaveLength(3);
    expect(logs[0].traceId).toBe("trace-interval-1");
    expect(logs[1].traceId).toBe("trace-interval-3");
    expect(logs[2].traceId).toBe("trace-interval-5");
  });

  it("should always log first call of each flow when using sampleInterval", async () => {
    class IntervalSampleService {
      execute(value: number): number {
        return value;
      }
    }

    MeasureClass()(IntervalSampleService);
    const service = new IntervalSampleService();

    for (let i = 1; i <= 10; i++) {
      await startTracking(
        {
          traceId: `trace-flow-a-${i}`,
          sampleInterval: 100,
          sampleIntervalFlowKey: "flow-a",
        },
        () => service.execute(i),
      );
    }

    await startTracking(
      {
        traceId: "trace-flow-b-1",
        sampleInterval: 100,
        sampleIntervalFlowKey: "flow-b",
      },
      () => service.execute(999),
    );

    const flowALogs = logs.filter((log) =>
      log.traceId.startsWith("trace-flow-a-"),
    );
    const flowBLogs = logs.filter((log) =>
      log.traceId.startsWith("trace-flow-b-"),
    );

    expect(flowALogs).toHaveLength(1);
    expect(flowALogs[0].traceId).toBe("trace-flow-a-1");
    expect(flowBLogs).toHaveLength(1);
    expect(flowBLogs[0].traceId).toBe("trace-flow-b-1");
  });

  it("should keep the reported traceId in context", async () => {
    const wrapped = measureFunctionWrapper(
      async (value: number) => value + 1,
      "sum",
    );

    await startTracking({ traceId: "trace-fixed", sampleRate: 1 }, async () => {
      const result = await wrapped(1);

      expect(result).toBe(2);
      expect(getTraceId()).toBe("trace-fixed");
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].traceId).toBe("trace-fixed");
    expect(logs[0].propertyName).toBe("sum");
    expect(logs[0].depthString).toBe("1");
    expect(logs[0].error).toBeNull();
  });

  it("should keep provided traceId", () => {
    const traceId = startTracking(
      { traceId: "trace-manual", sampleRate: 1 },
      () => getTraceId(),
    );

    expect(traceId).toBe("trace-manual");
  });

  it("should log error in function wrapper", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9);
    const wrapped = measureFunctionWrapper(async () => {
      throw new Error("expected failure");
    }, "explode");

    await expect(
      startTracking({ traceId: "trace-error", sampleRate: 0 }, async () =>
        wrapped(),
      ),
    ).rejects.toThrow("expected failure");

    expect(logs).toHaveLength(1);
    expect(logs[0].traceId).toBe("trace-error");
    expect(logs[0].propertyName).toBe("explode");
    expect(logs[0].error).toBeInstanceOf(Error);

    randomSpy.mockRestore();
  });

  it("should measure class methods with decorator", async () => {
    class SampleService {
      async execute(): Promise<string> {
        return "ok";
      }
    }

    MeasureClass()(SampleService);
    const service = new SampleService();

    const result = await startTracking(
      { traceId: "trace-class", sampleRate: 1 },
      async () => service.execute(),
    );

    expect(result).toBe("ok");
    expect(logs).toHaveLength(1);
    expect(logs[0].traceId).toBe("trace-class");
    expect(logs[0].propertyName).toBe("execute");
    expect(logs[0].target.name).toBe("SampleService");
  });

  it("should measure inherited class methods with decorator", async () => {
    class BaseRepository {
      async save(value: number): Promise<number> {
        return value;
      }
    }

    class ChildRepository extends BaseRepository {}

    MeasureClass()(ChildRepository);
    const repository = new ChildRepository();

    const result = await startTracking(
      { traceId: "trace-class-inherited", sampleRate: 1 },
      async () => repository.save(10),
    );

    expect(result).toBe(10);
    expect(logs).toHaveLength(1);
    expect(logs[0].traceId).toBe("trace-class-inherited");
    expect(logs[0].propertyName).toBe("save");
    expect(logs[0].target.name).toBe("ChildRepository");
  });

  it("should instrument base prototype methods used by base instances", async () => {
    class BaseRepository {
      async save(value: number): Promise<number> {
        return value;
      }
    }

    class GenericEntityRepository extends BaseRepository {}

    MeasureClass()(GenericEntityRepository);
    const baseRepository = new BaseRepository();

    const result = await startTracking(
      { traceId: "trace-base-instance", sampleRate: 1 },
      async () => baseRepository.save(7),
    );

    expect(result).toBe(7);
    expect(logs).toHaveLength(1);
    expect(logs[0].traceId).toBe("trace-base-instance");
    expect(logs[0].propertyName).toBe("save");
    expect(logs[0].target.name).toBe("BaseRepository");
  });

  it("should measure object methods with proxy", async () => {
    const source = {
      async ping(value: number): Promise<number> {
        return value * 2;
      },
    };

    const wrappedObject = measureObjectWrapper(source, "GatewayClient");

    const result = await startTracking(
      { traceId: "trace-object", sampleRate: 1 },
      async () => wrappedObject.ping(5),
    );

    expect(result).toBe(10);
    expect(logs).toHaveLength(1);
    expect(logs[0].traceId).toBe("trace-object");
    expect(logs[0].propertyName).toBe("ping");
    expect(logs[0].target.name).toBe("GatewayClient");
  });
});
