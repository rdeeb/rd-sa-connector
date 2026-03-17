export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function computeBackoffDelay(attempt: number, baseDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * baseDelayMs);
  return exponential + jitter;
}