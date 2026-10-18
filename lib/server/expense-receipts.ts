import { verifiedAdminIdentity } from './postgres-auth-routes';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { financialHandler, financialIdentity } from './financial-routes';
import { financialApiEnabled, callFinancial } from './financial-db';
import { FinancialError } from './financial-service';
import { isUUID } from '../payment-contract';
import { RECEIPT_BUCKET, RECEIPT_LIMIT, storageRequest, verifyReceiptBucket } from './receipt-storage';
type Receipt={id:string;file_id:string;mime_type:string;byte_size:number;sha256:string;ready:boolean};
const fail=(message:string,status=400)=>new FinancialError(message,status,'RECEIPT_UNAVAILABLE');
export function receiptMime(bytes:Buffer):string {
  if(bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))return 'image/jpeg';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';
  throw fail('Upload a JPEG, PNG or WebP receipt, up to 1 MB after compression.');
}
async function storedBytes(record:Receipt){
  const response=await storageRequest(`object/authenticated/${RECEIPT_BUCKET}/${encodeURIComponent(record.file_id)}`);
  if(!response.ok)throw fail('Receipt could not be reopened. Keep the original photo and retry.',503);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length!==record.byte_size||createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw fail('Stored receipt does not match the original upload. Ask the owner to review it.',409);
  return bytes;
}
export function uploadExpenseReceipt(request:Request){
  return financialHandler(async()=>{
    const actor=await financialIdentity(true);if(!actor)throw fail('Sign in again.',401);
    if(Number(request.headers.get('content-length'))>RECEIPT_LIMIT+65536)throw fail('Receipt exceeds 1 MB.');
    const form=await request.formData(),file=form.get('file'),requestId=form.get('requestId');
    if(form.get('expectedStaffId')!==actor.staffId)throw fail('Sign in as the staff member who selected this receipt.',403);
    if(!(file instanceof File)||file.size<1||file.size>RECEIPT_LIMIT||!isUUID(requestId))throw fail('Choose a receipt up to 1 MB after compression and retry.');
    const bytes=Buffer.from(await file.arrayBuffer()),mime=receiptMime(bytes),hash=createHash('sha256').update(bytes).digest('hex');
    await verifyReceiptBucket();
    const record=await callFinancial<Receipt>('api_receipt','reserve',{actor_id:actor.staffId,request_id:requestId,sha256:hash,mime_type:mime,byte_size:bytes.length,file_id:`${actor.staffId}-${requestId}`});
    if(!record.ready){
      // Never upsert: a retry can reuse the object only after verifying its exact hash.
      const uploaded=await storageRequest(`object/${RECEIPT_BUCKET}/${encodeURIComponent(record.file_id)}`,{method:'POST',headers:{'Content-Type':mime,'x-upsert':'false'},body:bytes});
      if(!uploaded.ok){
        const error=await uploaded.json().catch(()=>({}));
        if(!['409','Duplicate','ResourceAlreadyExists'].includes(String(error.statusCode||error.code))&&uploaded.status!==409)throw fail('Receipt upload failed. Keep your photo and retry.',503);
      }
    }
    await storedBytes(record);
    await callFinancial('api_receipt','ready',{actor_id:actor.staffId,receipt_id:record.id});
    return {receiptId:record.id,url:`/api/accounting/receipts/${record.id}`,sizeBytes:record.byte_size};
  });
}
export async function readExpenseReceipt(id:string){
  try {
    if(!financialApiEnabled())throw fail('Receipt service is not enabled.',404);
    const actor=await financialIdentity(true);if(!actor||!isUUID(id))throw fail('Receipt unavailable.',404);
    const receipt=await callFinancial<Receipt>('api_receipt','read',{actor_id:actor.staffId,receipt_id:id,by_owner:String(Boolean(await verifiedAdminIdentity()))});
    if(!receipt.ready)throw fail('Receipt upload is not complete.',409);
    const bytes=await storedBytes(receipt);
    return new NextResponse(bytes,{headers:{'Content-Type':receipt.mime_type,'Content-Disposition':`inline; filename="receipt-${receipt.id}.${receipt.mime_type.split('/')[1]}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }catch(error){const e=error instanceof FinancialError?error:fail('Receipt could not be opened. Check access and retry.',503);return NextResponse.json({error:e.message},{status:e.status,headers:{'Cache-Control':'no-store'}});}
}
