import { FinancialError } from './financial-service';
export const RECEIPT_BUCKET='expense-receipts';
export const RECEIPT_LIMIT=1024*1024;
export function storageConfig(){
  const ref=process.env.SUPABASE_PROJECT_REF||process.env.SUPABASE_MIGRATION_PROJECT_REF,key=process.env.SUPABASE_STORAGE_KEY;
  if(!ref||!/^[a-z0-9]{20}$/.test(ref)||!key)throw new FinancialError('Private receipt storage is not configured. Keep your photo and ask the owner to finish sandbox storage setup.',503,'RECEIPT_STORAGE_REQUIRED');
  if(key.startsWith('eyJ')){
    try {const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());if(claims.role!=='service_role'||claims.ref!==ref)throw new Error();}
    catch{throw new FinancialError('Receipt storage key does not match this project.',503,'RECEIPT_STORAGE_REQUIRED');}
  }else if(!key.startsWith('sb_secret_'))throw new FinancialError('Use a server-only secret key for receipt storage.',503,'RECEIPT_STORAGE_REQUIRED');
  return {url:`https://${ref}.supabase.co/storage/v1`,key};
}
export async function storageRequest(path:string,init:RequestInit={},send:typeof fetch=fetch){
  const {url,key}=storageConfig();
  return send(`${url}/${path}`,{...init,headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`} : {}),...init.headers},cache:'no-store',signal:AbortSignal.timeout(30000)});
}
export async function verifyReceiptBucket(){
  const response=await storageRequest(`bucket/${RECEIPT_BUCKET}`),bucket=await response.json();
  if(!response.ok||bucket.public!==false||Number(bucket.file_size_limit)!==RECEIPT_LIMIT)throw new FinancialError('Receipt bucket must be private with a 1 MB file limit. Ask the owner to run sandbox receipt setup.',503,'RECEIPT_STORAGE_REQUIRED');
}
