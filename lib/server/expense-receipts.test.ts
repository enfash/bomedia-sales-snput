import {createHash} from 'node:crypto';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({identity:vi.fn(),call:vi.fn(),storage:vi.fn(),bucket:vi.fn()}));
vi.mock('./receipt-storage',()=>({RECEIPT_BUCKET:'expense-receipts',RECEIPT_LIMIT:1048576,storageRequest:mocks.storage,verifyReceiptBucket:mocks.bucket}));
vi.mock('./financial-db',()=>({callFinancial:mocks.call,financialApiEnabled:()=>true}));
vi.mock('./financial-routes',()=>({financialIdentity:mocks.identity,financialHandler:async(work:()=>Promise<unknown>)=>{try{return Response.json(await work());}catch(e){return Response.json({error:(e as Error).message},{status:(e as {status:number}).status||500});}}}));
import {uploadExpenseReceipt,readExpenseReceipt,receiptMime} from './expense-receipts';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const bytes=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
const row={id:other,file_id:`${id}-${id}`,mime_type:'image/png',byte_size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),ready:false};
function request(actor=id,body:Buffer=bytes){const f=new FormData();f.append('file',new File([new Uint8Array(body)],'receipt.png',{type:'image/png'}));f.append('expectedStaffId',actor);f.append('requestId',id);return new Request('https://app.test/api/accounting/receipts',{method:'POST',body:f});}
beforeEach(()=>{vi.resetAllMocks();mocks.identity.mockResolvedValue({staffId:id});mocks.call.mockResolvedValue(row);mocks.bucket.mockResolvedValue(undefined);});
it('validates identity, content and size before storage writes',async()=>{
 expect((await uploadExpenseReceipt(request(other))).status).toBe(403);expect((await uploadExpenseReceipt(request(id,Buffer.from('<script>bad</script>')))).status).toBe(400);
 expect((await uploadExpenseReceipt(request(id,Buffer.alloc(1048577)))).status).toBe(400);expect(mocks.call).not.toHaveBeenCalled();expect(mocks.storage).not.toHaveBeenCalled();
 expect(()=>receiptMime(Buffer.from('plain text'))).toThrow('JPEG');
});
it('never upserts, verifies saved bytes and only then marks the receipt ready',async()=>{
 mocks.storage.mockResolvedValueOnce(Response.json({Key:'saved'})).mockResolvedValueOnce(new Response(bytes));
 expect(await (await uploadExpenseReceipt(request())).json()).toEqual({receiptId:other,url:`/api/accounting/receipts/${other}`,sizeBytes:bytes.length});
 expect(mocks.storage.mock.calls[0][1].headers['x-upsert']).toBe('false');expect(mocks.call.mock.calls.map(c=>c[1])).toEqual(['reserve','ready']);
});
it('recovers duplicate upload after lost confirmation and refuses changed bytes',async()=>{
 mocks.storage.mockResolvedValueOnce(Response.json({statusCode:'409'},{status:400})).mockResolvedValueOnce(new Response(bytes));expect((await uploadExpenseReceipt(request())).status).toBe(200);
 mocks.storage.mockResolvedValueOnce(Response.json({Key:'saved'})).mockResolvedValueOnce(new Response('changed'));
 expect((await uploadExpenseReceipt(request())).status).toBe(409);expect(mocks.call.mock.calls.filter(c=>c[1]==='ready')).toHaveLength(1);
});
it('reopens a private receipt with content verification and refuses replaced content',async()=>{
 mocks.call.mockResolvedValue({...row,ready:true});mocks.storage.mockResolvedValueOnce(new Response(bytes));
 const r=await readExpenseReceipt(other);expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(Buffer.from(await r.arrayBuffer())).toEqual(bytes);
 mocks.storage.mockResolvedValueOnce(new Response('changed'));expect((await readExpenseReceipt(other)).status).toBe(409);
});
