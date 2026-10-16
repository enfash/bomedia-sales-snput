// How many database connections one server instance may hold. The database allows only a small number of connections in total, and on Vercel
// every request can run on its own instance, so each instance keeps just one connection and lets it go quickly. A normal server (your Mac) keeps two.
export function poolSettings(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL ? { max: 1, idle_timeout: 5 } : { max: 2, idle_timeout: 20 };
}

// When a burst of requests uses up the database's connection limit, the connection is refused BEFORE anything runs, so trying again is safe.
const BUSY = /EMAXCONNSESSION|max clients reached|too many (clients|connections)|53300/i;
export const isConnectionBusy = (error: unknown) => {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  return BUSY.test(`${String(code ?? '')} ${String(message ?? '')}`);
};

export async function withConnectionRetry<T>(work: () => Promise<T>, options: { tries?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const { tries = 4, delayMs = 250, sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) } = options;
  for (let attempt = 1; ; attempt += 1) {
    try { return await work(); }
    catch (error) {
      if (attempt >= tries || !isConnectionBusy(error)) throw error;
      await sleep(delayMs * attempt + Math.floor(Math.random() * delayMs)); // a little longer each time, with jitter so retries do not collide
    }
  }
}
