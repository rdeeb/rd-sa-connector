import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BASE_DELAY_MS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
} from "./constants";
import { ConnectorConfigError, ConnectorValidationError } from "./errors";
import { postJson } from "./http";
import { connectorConfigSchema, stateSnapshotSchema, trackEventSchema } from "./schemas";
import type {
  ConnectorClient,
  ConnectorConfig,
  HealthStatus,
  NormalizedConfig,
  StateSnapshotInput,
  TrackEventInput,
} from "./types";

function normalizeConfig(config: ConnectorConfig): NormalizedConfig {
  const parsedConfig = connectorConfigSchema.safeParse(config);

  if (!parsedConfig.success) {
    throw new ConnectorConfigError("Connector config is invalid.", {
      endpoint: "config",
    });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(parsedConfig.data.baseUrl);
  } catch {
    throw new ConnectorConfigError("baseUrl must be a valid absolute URL.", {
      endpoint: "config",
    });
  }

  const allowInsecureHttp = parsedConfig.data.allowInsecureHttp ?? false;
  if (parsedUrl.protocol !== "https:" && !(allowInsecureHttp && parsedUrl.protocol === "http:")) {
    throw new ConnectorConfigError(
      "baseUrl must use HTTPS unless allowInsecureHttp is explicitly enabled.",
      {
        endpoint: "config",
      },
    );
  }

  return {
    baseUrl: parsedUrl,
    appId: parsedConfig.data.appId,
    appSecret: parsedConfig.data.appSecret,
    timeoutMs: parsedConfig.data.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: parsedConfig.data.maxRetries ?? DEFAULT_MAX_RETRIES,
    retryBaseDelayMs: parsedConfig.data.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
    fetchImpl: parsedConfig.data.fetchImpl ?? fetch,
    allowInsecureHttp,
    userAgent: parsedConfig.data.userAgent ?? DEFAULT_USER_AGENT,
  };
}

function toValidationError(issues: unknown, endpoint: string, message: string): ConnectorValidationError {
  return new ConnectorValidationError(message, { endpoint }, issues);
}

function validateTrackEventPayload(input: TrackEventInput): TrackEventInput {
  const parsed = trackEventSchema.safeParse(input);
  if (!parsed.success) {
    throw toValidationError(parsed.error.flatten(), "/api/ingest/events", "trackEvent input is invalid.");
  }

  return parsed.data;
}

function validateStateSnapshotPayload(input: StateSnapshotInput): StateSnapshotInput {
  const parsed = stateSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    throw toValidationError(
      parsed.error.flatten(),
      "/api/ingest/state",
      "pushStateSnapshot input is invalid.",
    );
  }

  return parsed.data;
}

export function createConnectorClient(config: ConnectorConfig): ConnectorClient {
  const normalized = normalizeConfig(config);

  return {
    async trackEvent(input, options) {
      const payload = validateTrackEventPayload(input);
      const request = {
        config: normalized,
        endpoint: "/api/ingest/events",
        body: payload as unknown as Record<string, unknown>,
      };

      if (options?.idempotencyKey) {
        return postJson({
          ...request,
          idempotencyKey: options.idempotencyKey,
        });
      }

      return postJson({
        ...request,
      });
    },

    async pushStateSnapshot(input) {
      const payload = validateStateSnapshotPayload(input);
      return postJson({
        config: normalized,
        endpoint: "/api/ingest/state",
        body: payload as unknown as Record<string, unknown>,
      });
    },

    health(): HealthStatus {
      return {
        ok: true,
        endpoint: normalized.baseUrl.toString(),
        userAgent: normalized.userAgent,
      };
    },
  };
}
