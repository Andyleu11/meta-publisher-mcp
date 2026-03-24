const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    if (/timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(msg)) return true;
    const statusMatch = msg.match(/\b(\d{3}):/);
    if (statusMatch && isRetryableStatus(parseInt(statusMatch[1], 10))) return true;
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts && isRetryableError(e)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[retry] ${label} attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
