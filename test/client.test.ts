import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { createConnectorClient } from "../src/client";
import {
  ConnectorAuthError,
  ConnectorConfigError,
  ConnectorHttpError,
  ConnectorRateLimitError,
  ConnectorTimeoutError,
  ConnectorValidationError,
} from "../src/errors";
import * as retryUtils from "../src/internal/retry";

const BASE_CONFIG = {
  baseUrl: "https://example.com",
  appId: "app_public_123",
  appSecret: "super-secret-value",
};

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
  });
}

describe("createConnectorClient", () => {
  beforeEach(() => {
    vi.spyOn(retryUtils, "sleep").mockResolvedValue();
    vi.spyOn(retryUtils, "computeBackoffDelay").mockReturnValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns local health data without network", () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createConnectorClient({ ...BASE_CONFIG, fetchImpl });

    const status = client.health();

    expect(status.ok).toBe(true);
    expect(status.endpoint).toBe("https://example.com/");
    expect(status.userAgent).toContain("rd-sa-connector/");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects insecure HTTP URLs unless explicitly allowed", () => {
    expect(() =>
      createConnectorClient({
        ...BASE_CONFIG,
        baseUrl: "http://example.com",
      }),
    ).toThrow(ConnectorConfigError);
  });

  it("allows HTTP URL only when allowInsecureHttp=true", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { status: "ok" }));

    const client = createConnectorClient({
      ...BASE_CONFIG,
      baseUrl: "http://example.com",
      allowInsecureHttp: true,
      fetchImpl,
    });

    await expect(
      client.trackEvent({
        event_type: "cta_clicked",
        occurred_at: "2026-03-17T12:00:00.000Z",
      }),
    ).resolves.toEqual({ status: "ok" });
  });

  it("validates external_entity_id for non-cta events", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createConnectorClient({ ...BASE_CONFIG, fetchImpl });

    await expect(
      client.trackEvent({
        event_type: "flow_started",
        occurred_at: "2026-03-17T12:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(ConnectorValidationError);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects unknown top-level payload fields", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createConnectorClient({ ...BASE_CONFIG, fetchImpl });

    await expect(
      client.pushStateSnapshot({
        occurred_at: "2026-03-17T12:00:00.000Z",
        active_accounts: 5,
        active_trials: 2,
        mrr: 100,
        lifetime_revenue: 1000,
        unknown_field: true,
      } as unknown as Parameters<typeof client.pushStateSnapshot>[0]),
    ).rejects.toBeInstanceOf(ConnectorValidationError);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends auth and idempotency headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { status: "ok" }));
    const client = createConnectorClient({ ...BASE_CONFIG, fetchImpl });

    await client.trackEvent(
      {
        event_type: "trial_started",
        occurred_at: "2026-03-17T12:00:00.000Z",
        external_entity_id: "lead_123",
      },
      { idempotencyKey: "idem-1" },
    );

    const [, init] = fetchImpl.mock.calls[0] ?? [];
    const headers = init?.headers as Headers;
    expect(headers.get("X-App-Id")).toBe("app_public_123");
    expect(headers.get("X-App-Secret")).toBe("super-secret-value");
    expect(headers.get("Idempotency-Key")).toBe("idem-1");
    expect(headers.get("User-Agent")).toContain("rd-sa-connector/");
  });

  it("maps 401/403 to ConnectorAuthError without retry", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(401, { error: "Invalid app credentials." }));
    const client = createConnectorClient({ ...BASE_CONFIG, fetchImpl, maxRetries: 2 });

    await expect(
      client.pushStateSnapshot({
        occurred_at: "2026-03-17T12:00:00.000Z",
        active_accounts: 5,
        active_trials: 2,
        mrr: 100,
        lifetime_revenue: 1000,
      }),
    ).rejects.toBeInstanceOf(ConnectorAuthError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries 5xx and succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(503, { error: "temporary" }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "ok" }));

    const client = createConnectorClient({ ...BASE_CONFIG, fetchImpl, maxRetries: 2 });

    await expect(
      client.pushStateSnapshot({
        occurred_at: "2026-03-17T12:00:00.000Z",
        active_accounts: 5,
        active_trials: 2,
        mrr: 100,
        lifetime_revenue: 1000,
      }),
    ).resolves.toEqual({ status: "ok" });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries network errors and succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(jsonResponse(200, { status: "ok" }));

    const client = createConnectorClient({ ...BASE_CONFIG, fetchImpl, maxRetries: 1 });

    await expect(
      client.pushStateSnapshot({
        occurred_at: "2026-03-17T12:00:00.000Z",
        active_accounts: 5,
        active_trials: 2,
        mrr: 100,
        lifetime_revenue: 1000,
      }),
    ).resolves.toEqual({ status: "ok" });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws timeout error after retry budget is exhausted", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const signal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });

    const client = createConnectorClient({
      ...BASE_CONFIG,
      fetchImpl,
      timeoutMs: 10,
      maxRetries: 0,
    });

    await expect(
      client.pushStateSnapshot({
        occurred_at: "2026-03-17T12:00:00.000Z",
        active_accounts: 5,
        active_trials: 2,
        mrr: 100,
        lifetime_revenue: 1000,
      }),
    ).rejects.toBeInstanceOf(ConnectorTimeoutError);
  });

  it("returns duplicate status when API reports idempotent duplicate", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { status: "duplicate" }));

    const client = createConnectorClient({ ...BASE_CONFIG, fetchImpl });

    await expect(
      client.trackEvent({
        event_type: "paid_converted",
        occurred_at: "2026-03-17T12:00:00.000Z",
        external_entity_id: "acct_1",
      }),
    ).resolves.toEqual({ status: "duplicate" });
  });

  it("maps 429 to ConnectorRateLimitError when retries are exhausted", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(429, { error: "slow down" }, { "retry-after": "3" }));

    const client = createConnectorClient({ ...BASE_CONFIG, fetchImpl, maxRetries: 0 });

    await expect(
      client.pushStateSnapshot({
        occurred_at: "2026-03-17T12:00:00.000Z",
        active_accounts: 5,
        active_trials: 2,
        mrr: 100,
        lifetime_revenue: 1000,
      }),
    ).rejects.toBeInstanceOf(ConnectorRateLimitError);
  });

  it("maps server validation failure to ConnectorValidationError", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(400, { error: "Invalid state payload." }));

    const client = createConnectorClient({ ...BASE_CONFIG, fetchImpl, maxRetries: 2 });

    await expect(
      client.pushStateSnapshot({
        occurred_at: "2026-03-17T12:00:00.000Z",
        active_accounts: 5,
        active_trials: 2,
        mrr: 100,
        lifetime_revenue: 1000,
      }),
    ).rejects.toBeInstanceOf(ConnectorValidationError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to ok when 2xx response body is malformed", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const client = createConnectorClient({ ...BASE_CONFIG, fetchImpl });

    await expect(
      client.pushStateSnapshot({
        occurred_at: "2026-03-17T12:00:00.000Z",
        active_accounts: 5,
        active_trials: 2,
        mrr: 100,
        lifetime_revenue: 1000,
      }),
    ).resolves.toEqual({ status: "ok" });
  });

  it("does not leak app secret in error message context", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(500, { error: "boom" }));

    const client = createConnectorClient({ ...BASE_CONFIG, fetchImpl, maxRetries: 0 });

    try {
      await client.pushStateSnapshot({
        occurred_at: "2026-03-17T12:00:00.000Z",
        active_accounts: 5,
        active_trials: 2,
        mrr: 100,
        lifetime_revenue: 1000,
      });
      throw new Error("Expected request to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectorHttpError);
      const serialized = JSON.stringify(error);
      expect(serialized.includes("super-secret-value")).toBe(false);
    }
  });
});