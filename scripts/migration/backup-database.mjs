import { mkdir,readFile,readdir,writeFile,realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { testConnection } from './cli.mjs';
import { captureDatabase,restoreAndVerifyLocally } from './database-backup.mjs';
import { encryptArchive,decryptArchive,sha256 } from './snapshot.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
let sql,phase='configuration';
try {
  const [name,flag,ref,...extra]=process.argv.slice(2);
  if(!/^[a-z0-9][a-z0-9_-]{0,80}$/.test(name || '') || flag!=='--confirm-project' || extra.length)throw new Error('Name and project confirmation required');
  const passphrase=process.env.MIGRATION_ARCHIVE_PASSPHRASE;
  if(!passphrase || passphrase.length<32)throw new Error('Configure archive passphrase');
  const url=testConnection(process.env.SUPABASE_MIGRATION_DATABASE_URL,process.env.SUPABASE_MIGRATION_PROJECT_REF,ref);
  const base=`${root}migration-data`;await mkdir(base,{recursive:true,mode:0o700});
  if(await realpath(base)!==base)throw new Error('Backup root cannot be a symlink');
  const directory=`${base}/${name}`;await mkdir(directory,{mode:0o700});
  const files=await Promise.all((await readdir(`${root}supabase/migrations`)).filter(f=>f.endsWith('.sql')).sort()
    .map(async name=>({name,sql:await readFile(`${root}supabase/migrations/${name}`,'utf8')})));
  sql=postgres(url,{ssl:{rejectUnauthorized:true,ca:await readFile(process.env.SUPABASE_CA_CERT_PATH,'utf8')},max:1,prepare:false,connect_timeout:15,onnotice:()=>{}});
  phase='consistent-read';
  const backup=await sql.begin('isolation level repeatable read read only',async tx=>{
    await tx`set local timezone to UTC`;
    return captureDatabase({query:async(text,params=[])=>({rows:await tx.unsafe(text,params)})},files,ref,value=>{phase=`consistent-read/${value}`;});
  });
  await sql.end({timeout:5});sql=undefined;
  phase='encrypted-backup';
  const serialized=JSON.stringify(encryptArchive(backup,passphrase))+'\n';
  const archivePath=`${directory}/database.encrypted.json`;
  await writeFile(archivePath,serialized,{mode:0o600,flag:'wx'});
  // Restore the bytes actually saved, not an unpersisted in-memory object.
  const saved=await readFile(archivePath,'utf8');if(sha256(saved)!==sha256(serialized))throw new Error('Archive differs');
  phase='local-restore';
  const verification=await restoreAndVerifyLocally(decryptArchive(JSON.parse(saved),passphrase),files);
  const report={...verification,capturedAt:backup.capturedAt,archiveSha256:sha256(saved),
    migrations:backup.migrations,independentCopy:false,receiptFilesIncluded:false,loginPasswordsIncluded:false};
  await writeFile(`${directory}/verification.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({directory:name,...report}));
}catch(error) {console.error(`Database backup failed at ${phase} (${error.code || 'verification'}). Existing output is preserved; no private data or credentials were logged.`);process.exitCode=1;}
finally {if(sql)await sql.end({timeout:5});}
