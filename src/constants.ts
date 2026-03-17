export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_RETRY_BASE_DELAY_MS = 250;

declare const __PKG_VERSION__: string | undefined;

const packageVersion = typeof __PKG_VERSION__ === "string" ? __PKG_VERSION__ : "0.0.0";

export const DEFAULT_USER_AGENT = `rd-sa-connector/${packageVersion}`;