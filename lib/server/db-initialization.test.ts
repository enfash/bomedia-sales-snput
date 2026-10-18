import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>{vi.unstubAllEnvs();vi.doUnmock('postgres');vi.resetModules();});
for(const role of ['financial','auth'] as const)it(`retries saturation during ${role} pool initialization and closes the failed pool`,async()=>{
 vi.resetModules();
 let attempts=0;const ended=vi.fn().mockResolvedValue(undefined);
 vi.doMock('postgres',()=>({default:()=>{
  const failed=++attempts===1;
  const sql=Object.assign(vi.fn(async()=>{
   if(failed)throw Object.assign(new Error('pool full'),{code:'53300'});
   return [{rolname:`bomedia_${role}_server`,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,member:true}];
  }),{end:ended,unsafe:vi.fn(async()=>[{result:{ok:true}}])});return sql;
 }}));
 vi.doMock('./push',()=>({schedulePushDispatch:vi.fn()}));
 vi.stubEnv('SUPABASE_PROJECT_REF','a'.repeat(20));
 vi.stubEnv(`SUPABASE_${role.toUpperCase()}_DATABASE_URL`,`postgres://bomedia_${role}_server:test-only@db.${'a'.repeat(20)}.supabase.co/postgres`);
 // Prevent accidental certificate-file reads in the test adapter.
 vi.stubEnv('SUPABASE_CA_CERT_PATH','');vi.stubEnv('SUPABASE_CA_CERT_PEM','');
 if(role==='auth')expect(await (await import('./auth-db')).callAuth('auth_read_session',['test-session'])).toEqual({ok:true});
 else expect(await (await import('./financial-db')).callFinancial('api_read','customers',{})).toEqual({ok:true});
 expect(attempts).toBe(2);expect(ended).toHaveBeenCalledTimes(1);
});
