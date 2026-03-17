import type { RequestDiagnostics } from "./types";

export class ConnectorError extends Error {
  public readonly diagnostics: RequestDiagnostics;

  public constructor(message: string, diagnostics: RequestDiagnostics) {
    super(message);
    this.name = this.constructor.name;
    this.diagnostics = diagnostics;
  }
}

export class ConnectorConfigError extends ConnectorError {}

export class ConnectorValidationError extends ConnectorError {
  public readonly issues?: unknown;

  public constructor(message: string, diagnostics: RequestDiagnostics, issues?: unknown) {
    super(message, diagnostics);
    this.issues = issues;
  }
}

export class ConnectorAuthError extends ConnectorError {}

export class ConnectorRateLimitError extends ConnectorError {
  public readonly retryAfter: string | null | undefined;

  public constructor(message: string, diagnostics: RequestDiagnostics, retryAfter?: string | null) {
    super(message, diagnostics);
    this.retryAfter = retryAfter;
  }
}

export class ConnectorHttpError extends ConnectorError {
  public readonly responseBody?: unknown;

  public constructor(message: string, diagnostics: RequestDiagnostics, responseBody?: unknown) {
    super(message, diagnostics);
    this.responseBody = responseBody;
  }
}

export class ConnectorNetworkError extends ConnectorError {
  public override readonly cause?: unknown;

  public constructor(message: string, diagnostics: RequestDiagnostics, cause?: unknown) {
    super(message, diagnostics);
    this.cause = cause;
  }
}

export class ConnectorTimeoutError extends ConnectorNetworkError {}
