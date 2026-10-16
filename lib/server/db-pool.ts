// How many database connections one server instance may hold. The database allows only a small number of connections in total, and on Vercel
// every request can run on its own instance, so each instance keeps just one connection and lets it go quickly. A normal server (your Mac) keeps two.
export function poolSettings(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL ? { max: 1, idle_timeout: 5 } : { max: 2, idle_timeout: 20 };
}
