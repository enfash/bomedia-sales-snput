export function postgresAuthEnabled(): boolean {
  const backend = process.env.AUTH_BACKEND || 'sheets';
  if (backend !== 'sheets' && backend !== 'postgres') throw new Error('Unsupported authentication backend');
  return backend === 'postgres';
}
