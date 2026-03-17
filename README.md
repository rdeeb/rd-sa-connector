# rd-sa-connector

Secure TypeScript connector for the rd-sa dashboard ingest APIs.

## Install

```bash
pnpm add rd-sa-connector
```

## Quick start

```ts
import { createConnectorClient } from "rd-sa-connector";

const client = createConnectorClient({
  baseUrl: "https://your-dashboard.example.com",
  appId: process.env.RD_APP_ID!,
  appSecret: process.env.RD_APP_SECRET!,
});

await client.trackEvent(
  {
    event_type: "trial_started",
    occurred_at: new Date(),
    external_entity_id: "lead_123",
    metadata: { source: "landing-a" },
  },
  { idempotencyKey: "event-lead_123-trial-started" },
);

await client.pushStateSnapshot({
  occurred_at: new Date(),
  active_accounts: 18,
  active_trials: 6,
  mrr: 924,
  lifetime_revenue: 12440,
});
```

## API

- `createConnectorClient(config)`
- `client.trackEvent(input, { idempotencyKey? })`
- `client.pushStateSnapshot(input)`
- `client.health()`

## Security defaults

- HTTPS required by default (`allowInsecureHttp` must be explicitly enabled for `http://`).
- Request timeouts enabled (`timeoutMs` default 8000ms).
- Retries only for transient failures (`429` and `5xx`, plus network/timeouts).
- Strict payload validation with unknown field rejection.
- Error diagnostics never include app secret values.

## Development

```bash
pnpm install
pnpm check
```

### Coverage policy

- Global minimum coverage: 85% for lines/statements/functions/branches.
- Changed-file gate in CI: >= 80% line coverage for modified `src/**/*.ts` files.

## Releases

This repo uses Changesets and GitHub Actions.

```bash
pnpm changeset
git add .changeset
git commit -m "chore: add changeset"
```