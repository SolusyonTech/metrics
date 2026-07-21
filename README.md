# @solusyon/metrics

TypeScript library for execution tracking with traceId, execution time, and error capture.

## Highlights in v0.3.0

- Adds deterministic interval sampling with `sampleInterval`.
- Adds per-flow interval sampling with `sampleIntervalFlowKey`.
- Improves `MeasureClass()` to instrument methods found in prototype chains (inherited methods).
- Improves target resolution in logs to prefer runtime class when available.

## Runtime requirements

- Node.js `20` or higher

## Installation

```bash
npm install @solusyon/metrics
```

## Available API

- `startTracking(config, fn)`
- `startTrackingMetrics(traceId, fn, sampleRate?)` - deprecated compatibility alias
- `getTraceId()`
- `getMetadata()`
- `addMetadata(entries)`
- `setMetricsLogger(loggerBuilder)`
- `measureFunctionWrapper(fn, name?)`
- `measureObjectWrapper(obj, name)`
- `MeasureClass()`

## Example 1: isolated function

```ts
import {
  getTraceId,
  measureFunctionWrapper,
  startTracking,
} from "@solusyon/metrics";

const chargePayment = measureFunctionWrapper(async (orderId: string) => {
  const traceId = getTraceId();
  return { orderId, status: "paid", traceId };
}, "chargePayment");

const result = await startTracking(
  { traceId: "req-123", sampleRate: 1 },
  async () => {
    return chargePayment("order-1");
  },
);

console.log(result);
```

## Example 2: object with multiple methods

```ts
import { measureObjectWrapper, startTracking } from "@solusyon/metrics";

const repository = {
  async findUser(id: string) {
    return { id, name: "Anderson" };
  },
  async updateUser(id: string, name: string) {
    return { id, name };
  },
};

const trackedRepository = measureObjectWrapper(repository, "UserRepository");

await startTracking({ traceId: "req-456", sampleRate: 1 }, async () => {
  const user = await trackedRepository.findUser("u-1");
  await trackedRepository.updateUser(user.id, "New Name");
});
```

## Example 3: class with decorator

```ts
import { MeasureClass, startTracking } from "@solusyon/metrics";

class CheckoutService {
  async createOrder() {
    return { id: "ord-1", status: "created" };
  }
}

MeasureClass()(CheckoutService);

const service = new CheckoutService();

await startTracking({ traceId: "req-789", sampleRate: 1 }, async () => {
  await service.createOrder();
});
```

## Example 4: with metadata

```ts
import {
  addMetadata,
  getMetadata,
  measureFunctionWrapper,
  startTracking,
} from "@solusyon/metrics";

const processPayment = measureFunctionWrapper(async (amount: number) => {
  const metadata = getMetadata();
  return { amount, userId: metadata?.userId };
}, "processPayment");

await startTracking(
  { traceId: "req-111", sampleRate: 1, metadata: { userId: "user-42" } },
  async () => {
    addMetadata({ environment: "production" });
    const result = await processPayment(100);
    console.log(result);
  },
);
```

## Example 5: deterministic interval sampling

```ts
import { MeasureClass, startTracking } from "@solusyon/metrics";

class PaymentService {
  execute(value: number) {
    return value;
  }
}

MeasureClass()(PaymentService);
const service = new PaymentService();

for (let i = 1; i <= 5; i++) {
  await startTracking(
    {
      traceId: `trace-${i}`,
      sampleRate: 0,
      sampleInterval: 2,
      sampleIntervalFlowKey: "pix-out",
    },
    () => service.execute(i),
  );
}

// Logs for i = 1, 3, 5
```

## Example 6: custom logger

```ts
import { setMetricsLogger } from "@solusyon/metrics";

setMetricsLogger((format) => {
  return (data) => {
    const message = format(data);
    // send to Datadog, OpenSearch, CloudWatch, etc.
    console.log(JSON.stringify({ level: "debug", message }));
  };
});
```

## How sampling works

- `sampleRate` ranges from `0` to `1` and is internally limited to the range `0.001` to `1`.
- When `sampleInterval` is provided, interval sampling takes precedence over `sampleRate`.
- Interval sampling always logs the first execution per flow key, then every N calls.
- `sampleIntervalFlowKey` lets you keep independent counters per business flow (for example, per route or operation).
- If `sampleRate` is not provided, the library uses the `METRICS_SAMPLE_RATE` environment variable.
- If the variable does not exist, the current default is `1`.
- If `traceId` is omitted in `startTracking`, the library generates one with `randomUUID()`.

## MeasureClass behavior

- Instruments own and inherited methods from the prototype chain.
- Avoids double wrapping of methods already instrumented.
- For inherited methods, runtime target names in logs reflect the class of `this` when possible.

## Scripts

- `npm run build`: generates artifacts in `dist/`
- `npm run check`: validates types without generating build
- `npm test`: runs the test suite
- `npm run test:watch`: runs tests in watch mode

## Publishing to npm

1. Log in: `npm login`
2. Update version: `npm version patch` (or `minor`/`major`)
3. Publish: `npm publish --access public`

## Pipeline (GitHub Actions)

- On `pull_request` and `push` to `main`: runs `npm ci`, `npm run check`, `npm run build`, and `npm pack --dry-run`.
- On `push` of tag `v*` (e.g., `v0.1.1`): in addition to validation, publishes to npm.

### Required Configuration

1. Create the `NPM_TOKEN` secret in the GitHub repository with an npm token with publishing permission.
2. Generate a semantic tag and push to remote:

```bash
git tag v0.1.1
git push origin v0.1.1
```

## Important about package name

npm requires package names in lowercase. Therefore, the name was defined as `@solusyon/metrics`.
