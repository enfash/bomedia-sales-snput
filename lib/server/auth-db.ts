import postgres from 'postgres';
import { readFile } from 'node:fs/promises';

const methods = {
  auth_reserve_login: 1, auth_claim_session: 3, auth_read_session: 1,
  auth_revoke_session: 1, auth_presence: 2, auth_list_staff: 0, auth_manage_staff: 4,
} as const;
export type AuthMethod = keyof typeof methods;
export type AuthCall = <T>(method: AuthMethod, parameters: (string | boolean | null)[]) => Promise<T>;
let database: Promise<ReturnType<typeof postgres>> | undefined;

export function validateAuthConnection(raw: string | undefined, ref: string | undefined): string {
  if (!raw || !ref || !/^[a-z0-9]{20}$/.test(ref)) throw new Error('Authentication database is not configured');
  const url = new URL(raw);
  const direct = url.hostname === `db.${ref}.supabase.co` && decodeURIComponent(url.username) === 'bomedia_auth_server';
  const pooled = /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(url.hostname)
    && decodeURIComponent(url.username) === `bomedia_auth_server.${ref}`;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!direct && !pooled)
    || (url.port && !['5432', '6543'].includes(url.port)) || url.pathname !== '/postgres'
    || !url.password || url.search || url.hash) throw new Error('Use the dedicated authentication role connection');
  return url.toString();
}

async function connect() {
  const connection = validateAuthConnection(process.env.SUPABASE_AUTH_DATABASE_URL,
    process.env.SUPABASE_PROJECT_REF || process.env.SUPABASE_MIGRATION_PROJECT_REF);
  const ca = process.env.SUPABASE_CA_CERT_PEM?.replace(/\\n/g, '\n')
    || (process.env.SUPABASE_CA_CERT_PATH ? await readFile(process.env.SUPABASE_CA_CERT_PATH, 'utf8') : undefined);
  const sql = postgres(connection, { ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 2, prepare: false, connect_timeout: 10, idle_timeout: 20, onnotice: () => {} });
  try {
    const [role] = await sql`select r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
      pg_has_role(current_user,'bomedia_auth_runtime','MEMBER') as member from pg_roles r where r.rolname=current_user`;
    if (!role || role.rolname !== 'bomedia_auth_server' || role.rolsuper || role.rolbypassrls || role.rolcreaterole
      || role.rolcreatedb || !role.member) throw new Error('Authentication role privileges do not match');
    return sql;
  } catch {
    await sql.end({ timeout: 2 });
    throw new Error('Authentication database is unavailable');
  }
}
export const callAuth: AuthCall = async <T>(method: AuthMethod, parameters: (string | boolean | null)[]): Promise<T> => {
  if (!Object.hasOwn(methods, method) || parameters.length !== methods[method]) throw new Error('Invalid authentication operation');
  database ??= connect().catch(error => { database = undefined; throw error; });
  const sql = await database;
  const args = parameters.map((_, index) => `$${index + 1}`).join(',');
  const rows = await sql.unsafe(`select bomedia.${method}(${args}) as result`, parameters);
  return rows[0].result as T;
};
