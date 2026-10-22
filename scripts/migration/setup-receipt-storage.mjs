// Only the dedicated sandbox. No public bucket, overwrite or deletion policies.
import {loadSandboxEnv} from './sandbox-env.mjs';
const env=await loadSandboxEnv();
const ref=env.SUPABASE_PROJECT_REF,key=env.SUPABASE_STORAGE_KEY;
if(!key)throw new Error('Add the sandbox server-only SUPABASE_STORAGE_KEY to .env.sandbox.local.');
if(key.startsWith('eyJ')){const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));if(claims.ref!==ref||claims.role!=='service_role')throw new Error('Storage key does not match the sandbox.');}
else if(!key.startsWith('sb_secret_'))throw new Error('A server-only secret key is required.');
const url=`https://${ref}.supabase.co/storage/v1`,headers={apikey:key,...(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`}:{})};
const name='expense-receipts';
let r=await fetch(`${url}/bucket/${name}`,{headers});let bucket=await r.json();
if(!r.ok){
 if(r.status!==404&&String(bucket.statusCode)!=='404')throw new Error('Cannot check sandbox storage. Confirm the server key.');
 r=await fetch(`${url}/bucket`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({id:name,name,public:false,file_size_limit:1048576,allowed_mime_types:['image/jpeg','image/png','image/webp']})});
 if(!r.ok)throw new Error('Sandbox bucket creation failed.');
 r=await fetch(`${url}/bucket/${name}`,{headers});bucket=await r.json();
}
if(!r.ok||bucket.public!==false||Number(bucket.file_size_limit)!==1048576)throw new Error('Existing bucket settings differ. Review before changing them.');
console.log(JSON.stringify({bucket:name,public:bucket.public,maxBytes:bucket.file_size_limit,project:ref}));
