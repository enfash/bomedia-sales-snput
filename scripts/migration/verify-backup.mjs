// Offline verification. The only restored database is a fresh local PGlite instance.
import { readFile,readdir,realpath,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { decryptArchive,sha256 } from './snapshot.mjs';
import { restoreAndVerifyLocally } from './database-backup.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
try {
  const [name,...extra]=process.argv.slice(2);
  if(!/^[a-z0-9][a-z0-9_-]{0,80}$/.test(name || '') || extra.length)throw new Error('Choose a backup directory name');
  const directory=`${root}migration-data/${name}`;
  if(await realpath(directory)!==directory)throw new Error('Backup directory cannot be a symlink');
  const archive=await readFile(`${directory}/database.encrypted.json`,'utf8');
  const prior=JSON.parse(await readFile(`${directory}/verification.json`,'utf8'));
  if(sha256(archive)!==prior.archiveSha256)throw new Error('Archive checksum mismatch');
  const files=await Promise.all((await readdir(`${root}supabase/migrations`)).filter(f=>f.endsWith('.sql')).sort()
    .map(async name=>({name,sql:await readFile(`${root}supabase/migrations/${name}`,'utf8')})));
  const result=await restoreAndVerifyLocally(decryptArchive(JSON.parse(archive),process.env.MIGRATION_ARCHIVE_PASSPHRASE),files);
  const report={...result,verifiedAt:new Date().toISOString(),archiveSha256:sha256(archive)};
  await writeFile(`${directory}/reverification-${Date.now()}.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify(report));
}catch {console.error('Offline recovery verification failed. No private data or credentials were logged.');process.exitCode=1;}
