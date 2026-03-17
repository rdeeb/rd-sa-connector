import {
  ConnectorAuthError,
  ConnectorHttpError,
  ConnectorNetworkError,
  ConnectorRateLimitError,
  ConnectorTimeoutError,
  ConnectorValidationError,
} from "./errors";
import { computeBackoffDelay, sleep } from "./internal/retry";
import type { ConnectorSuccessResponse, NormalizedConfig } from "./types";

interface RequestArgs {
  config: NormalizedConfig;
  endpoint: string;
  body: Record<string, unknown>;
  idempotencyKey?: string;
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function withSerializedDates(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => {
      if (value instanceof Date) {
        return [key, toIsoString(value)];
      }
      return [key, value];
    }),
  );
}

function parseJsonSafe(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export async function postJson(args: RequestArgs): Promise<ConnectorSuccessResponse> {
  const { config, endpoint, idempotencyKey } = args;
  const url = new URL(endpoint, config.baseUrl);
  const body = withSerializedDates(args.body);

  let attempt = 0;
  while (attempt <= config.maxRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), config.timeoutMs);

    try {
      const headers = new Headers({
        "Content-Type": "application/json",
        "X-App-Id": config.appId,
        "X-App-Secret": config.appSecret,
        "User-Agent": config.userAgent,
      });

      if (idempotencyKey) {
        headers.set("Idempotency-Key", idempotencyKey);
      }

      const response = await config.fetchImpl(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const requestId = response.headers.get("x-request-id");
      const rawBody = await response.text();
      const parsedBody = rawBody.length > 0 ? parseJsonSafe(rawBody) : {};

      if (response.ok) {
        if (
          typeof parsedBody === "object" &&
          parsedBody !== null &&
          "status" in parsedBody &&
          (((parsedBody as { status?: unknown }).status as string) === "ok" ||
            ((parsedBody as { status?: unknown }).status as string) === "duplicate")
        ) {
          return parsedBody as ConnectorSuccessResponse;
        }

        return { status: "ok" };
      }

      const diagnostics = { endpoint, status: response.status, requestId: requestId ?? undefined };

      if (response.status === 401 || response.status === 403) {
        throw new ConnectorAuthError("Authentication with ingest API failed.", diagnostics);
      }

      if (response.status === 400 || response.status === 422) {
        throw new ConnectorValidationError("Ingest API rejected request payload.", diagnostics, parsedBody);
      }

      if (response.status === 429) {
        if (attempt < config.maxRetries) {
          await sleep(computeBackoffDelay(attempt, config.retryBaseDelayMs));
          attempt += 1;
          continue;
        }

        throw new ConnectorRateLimitError(
          "Ingest API rate limit reached.",
          diagnostics,
          response.headers.get("retry-after"),
        );
      }

      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < config.maxRetries) {
        await sleep(computeBackoffDelay(attempt, config.retryBaseDelayMs));
        attempt += 1;
        continue;
      }

      throw new ConnectorHttpError("Ingest API request failed.", diagnostics, parsedBody);
    } catch (error) {
      clearTimeout(timeout);

      if (
        error instanceof ConnectorAuthError ||
        error instanceof ConnectorValidationError ||
        error instanceof ConnectorRateLimitError ||
        error instanceof ConnectorHttpError
      ) {
        throw error;
      }

      const diagnostics = { endpoint };

      if (controller.signal.aborted) {
        if (attempt < config.maxRetries) {
          await sleep(computeBackoffDelay(attempt, config.retryBaseDelayMs));
          attempt += 1;
          continue;
        }

        throw new ConnectorTimeoutError(
          `Request timed out after ${config.timeoutMs}ms.`,
          diagnostics,
          error,
        );
      }

      if (attempt < config.maxRetries) {
        await sleep(computeBackoffDelay(attempt, config.retryBaseDelayMs));
        attempt += 1;
        continue;
      }

      throw new ConnectorNetworkError("Network request to ingest API failed.", diagnostics, error);
    }
  }

  throw new ConnectorNetworkError("Network request to ingest API failed.", { endpoint });
}