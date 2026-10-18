import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({dispatch:vi.fn()}));
vi.mock('./lib/auth-utils',()=>({verifyToken:async()=>({role:'admin',email:'owner@example.test'}),signToken:vi.fn()}));
vi.mock('./lib/server/postgres-auth',()=>({postgresAuth:{session:async()=>null}}));
vi.mock('./lib/server/push',()=>({push:{dispatch:mocks.dispatch}}));
import {proxy} from './proxy';
import {runDispatch} from './lib/server/push-routes';
beforeEach(()=>{vi.stubEnv('ADMIN_AUTH','supabase');vi.stubEnv('AUTH_BACKEND','postgres');vi.stubEnv('PUSH_DISPATCH_SECRET','x'.repeat(32));mocks.dispatch.mockResolvedValue({sent:1});});
afterEach(()=>vi.unstubAllEnvs());
it('allows only the dispatch POST through to secret authentication without a browser cookie',async()=>{
 const good=new NextRequest('https://app.test/api/push/dispatch',{method:'POST',headers:{'x-push-secret':'x'.repeat(32)}});
 expect((await proxy(good)).headers.get('x-middleware-next')).toBe('1');expect((await runDispatch(good)).status).toBe(200);
 expect((await runDispatch(new Request(good.url,{method:'POST'}))).status).toBe(403);
 for(const path of ['/api/push/test','/api/push/subscription','/api/push/dispatch/extra'])expect((await proxy(new NextRequest('https://app.test'+path,{method:'POST'}))).status).toBe(401);
 expect((await proxy(new NextRequest(good.url))).status).toBe(401);
});
it('rejects an old password cookie in Supabase mode at the proxy boundary',async()=>{
 const response=await proxy(new NextRequest('https://app.test/api/accounting/reports',{headers:{cookie:'admin_session=old'}}));
 expect(response.status).toBe(401);
});
