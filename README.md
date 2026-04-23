# @solusyon/metrics

TypeScript library for execution tracking with traceId, execution time, and error capture.

## Runtime requirements

- Node.js `20` or higher

## Installation

```bash
npm install @solusyon/metrics
```

## Available API

- `startTrackingMetrics(traceId, fn, sampleRate?)`
- `getTraceId()`
- `setMetricsLogger(loggerBuilder)`
- `measureFunctionWrapper(fn, name?)`
- `measureObjectWrapper(obj, name)`
- `MeasureClass()`

## Example 1: isolated function

```ts
import {
  getTraceId,
  measureFunctionWrapper,
  startTrackingMetrics,
} from "@solusyon/metrics";

const chargePayment = measureFunctionWrapper(async (orderId: string) => {
  const traceId = getTraceId();
  return { orderId, status: "paid", traceId };
}, "chargePayment");

const result = await startTrackingMetrics(
  "req-123",
  async () => {
    return chargePayment("order-1");
  },
  1,
);

console.log(result);
```

## Example 2: object with multiple methods

```ts
import { measureObjectWrapper, startTrackingMetrics } from "@solusyon/metrics";

const repository = {
  async findUser(id: string) {
    return { id, name: "Anderson" };
  },
  async updateUser(id: string, name: string) {
    return { id, name };
  },
};

const trackedRepository = measureObjectWrapper(repository, "UserRepository");

await startTrackingMetrics(
  "req-456",
  async () => {
    const user = await trackedRepository.findUser("u-1");
    await trackedRepository.updateUser(user.id, "New Name");
  },
  1,
);
```

## Example 3: class with decorator

```ts
import { MeasureClass, startTrackingMetrics } from "@solusyon/metrics";

class CheckoutService {
  async createOrder() {
    return { id: "ord-1", status: "created" };
  }
}

MeasureClass()(CheckoutService);

const service = new CheckoutService();

await startTrackingMetrics(
  "req-789",
  async () => {
    await service.createOrder();
  },
  1,
);
```

## Example 4: custom logger

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
- If `sampleRate` is not provided, the library uses the `METRICS_SAMPLE_RATE` environment variable.
- If the variable does not exist, the current default is `0.91`.

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
