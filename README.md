# @solusyon/metrics

Biblioteca TypeScript para rastreamento de execução com traceId, tempo de execução e captura de erros.

## Instalação

```bash
npm install @solusyon/metrics
```

## API disponível

- `startTrackingMetrics(traceId, fn, sampleRate?)`
- `getTraceId()`
- `setMetricsLogger(loggerBuilder)`
- `measureFunctionWrapper(fn, name?)`
- `measureObjectWrapper(obj, name)`
- `MeasureClass()`

## Exemplo 1: função isolada

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

## Exemplo 2: objeto com múltiplos métodos

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
    await trackedRepository.updateUser(user.id, "Novo Nome");
  },
  1,
);
```

## Exemplo 3: classe com decorator

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

## Exemplo 4: logger customizado

```ts
import { setMetricsLogger } from "@solusyon/metrics";

setMetricsLogger((format) => {
  return (data) => {
    const message = format(data);
    // envie para Datadog, OpenSearch, CloudWatch, etc.
    console.log(JSON.stringify({ level: "debug", message }));
  };
});
```

## Como funciona o sampling

- `sampleRate` varia de `0` a `1` e eh limitado internamente para o intervalo `0.001` a `1`.
- Se `sampleRate` nao for informado, a lib usa a variavel de ambiente `METRICS_SAMPLE_RATE`.
- Se a variavel nao existir, o padrao atual eh `0.91`.

## Scripts

- `npm run build`: gera artefatos em `dist/`
- `npm run check`: valida tipos sem gerar build
- `npm test`: executa a suíte de testes
- `npm run test:watch`: executa testes em modo watch

## Publicação no npm

1. Faça login: `npm login`
2. Atualize versão: `npm version patch` (ou `minor`/`major`)
3. Publique: `npm publish --access public`

## Pipeline (GitHub Actions)

- Em `pull_request` e `push` para `main`: roda `npm ci`, `npm run check`, `npm run build` e `npm pack --dry-run`.
- Em `push` de tag `v*` (ex.: `v0.1.1`): além da validação, publica no npm.

### Configuração necessária

1. Crie o secret `NPM_TOKEN` no repositório GitHub com um token do npm com permissão de publicação.
2. Gere uma tag semântica e envie para o remoto:

```bash
git tag v0.1.1
git push origin v0.1.1
```

## Importante sobre nome do pacote

O npm exige nomes de pacote em minúsculas. Por isso, o nome foi definido como `@solusyon/metrics`.
