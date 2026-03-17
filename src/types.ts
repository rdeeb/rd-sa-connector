export type EventType =
  | "cta_clicked"
  | "flow_started"
  | "trial_started"
  | "paid_converted"
  | "churned";

export interface TrackEventInput {
  event_type: EventType;
  occurred_at: string | Date;
  external_entity_id?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface StateSnapshotInput {
  occurred_at: string | Date;
  active_accounts: number;
  active_trials: number;
  mrr: number;
  lifetime_revenue: number;
}

export interface ConnectorConfig {
  baseUrl: string;
  appId: string;
  appSecret: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  fetchImpl?: typeof fetch;
  allowInsecureHttp?: boolean;
  userAgent?: string;
}

export interface RequestOptions {
  idempotencyKey?: string | undefined;
}

export interface HealthStatus {
  ok: true;
  endpoint: string;
  userAgent: string;
}

export interface RequestDiagnostics {
  endpoint: string;
  status?: number | undefined;
  requestId?: string | undefined;
}

export type ConnectorSuccessResponse = {
  status: "ok" | "duplicate";
};

export interface ConnectorClient {
  trackEvent(input: TrackEventInput, options?: RequestOptions): Promise<ConnectorSuccessResponse>;
  pushStateSnapshot(input: StateSnapshotInput): Promise<ConnectorSuccessResponse>;
  health(): HealthStatus;
}

export interface NormalizedConfig {
  baseUrl: URL;
  appId: string;
  appSecret: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  fetchImpl: typeof fetch;
  allowInsecureHttp: boolean;
  userAgent: string;
}
