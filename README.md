# @solusyon/metrics

Biblioteca TypeScript para coleta simples de métricas.

## Instalação

```bash
npm install @solusyon/metrics
```

## Uso

```ts
import { createCounter } from "@solusyon/metrics";

const requests = createCounter("http.requests", { service: "api" });

requests.inc();
requests.inc(5);

console.log(requests.snapshot());
```

## Scripts

- `npm run build`: gera artefatos em `dist/`
- `npm run check`: valida tipos sem gerar build
- `npm test`: executa a suíte de testes

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
