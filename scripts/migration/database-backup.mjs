// Logical backup of application-owned schemas. Restore is ONLY to a fresh,
// in-memory PGlite instance created here; no remote restore connection exists.
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations, prepareMigrations } from './apply.mjs';
import { canonicalJson, sha256 } from './snapshot.mjs';
const schemas=['bomedia','migration','migration_control'];
const identifier=value=>'"'+value.replaceAll('"','""')+'"';
const tableName=table=>`${identifier(table.schema)}.${identifier(table.name)}`;
async function metadata(db) {
  const columns=(await db.query(`select n.nspname as schema,c.relname as table_name,a.attname as name,format_type(a.atttypid,a.atttypmod) as type
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
    where n.nspname in ('bomedia','migration','migration_control') and c.relkind='r' and a.attnum>0 and not a.attisdropped
    order by n.nspname,c.relname,a.attnum`)).rows;
  const tables=[];
  for(const column of columns) {
    let table=tables.at(-1);
    if(!table || table.schema!==column.schema || table.name!==column.table_name) {
      table={schema:column.schema,name:column.table_name,columns:[]};tables.push(table);
    }
    table.columns.push({name:column.name,type:column.type});
  }
  return tables;
}
async function rows(db,table) {
  const result=[];let cursor='(0,0)';
  // Bounded pages avoid timing out while serializing the large source archive.
  // CTIDs stay visible/stable for this read-only repeatable-read snapshot. They
  // are pagination cursors only and are never restored as business identities.
  while(true) {
    const page=(await db.query(`select ctid::text as position,jsonb_build_array(${table.columns.map(c=>`${identifier(c.name)}::text`).join(',')}) as cells
      from (select ctid,${table.columns.map(c=>identifier(c.name)).join(',')} from ${tableName(table)}
        where ctid>$1::tid order by ctid limit 200) batch order by ctid`,[cursor])).rows;
    if(!page.length)break;
    result.push(...page.map(r=>r.cells));cursor=page.at(-1).position;
    if(page.length<200)break;
  }
  return result.sort((a,b)=>canonicalJson(a).localeCompare(canonicalJson(b)));
}

export async function captureDatabase(db,files,projectRef,progress=(_phase)=>{}) {
  progress("migration-ledger");
  const expected=prepareMigrations(files).map(({name,checksum})=>({name,checksum}));
  const applied=(await db.query('select name,checksum from migration_control.applied_migrations order by name')).rows;
  if(canonicalJson(applied)!==canonicalJson(expected))throw new Error('Migration history mismatch');
  progress("table-metadata");
  const tables=await metadata(db);
  for(const table of tables) {
    progress(`table:${table.schema}.${table.name}`);
    table.rows=await rows(db,table);table.sha256=sha256(canonicalJson(table.rows));
  }
  progress("sequences");
  const sequences=(await db.query(`select schemaname as schema,sequencename as name from pg_sequences
    where schemaname in ('bomedia','migration','migration_control') order by schemaname,sequencename`)).rows;
  for(const sequence of sequences)Object.assign(sequence,(await db.query(`select last_value::text,is_called from ${tableName(sequence)}`)).rows[0]);
  return {kind:'bomedia-private-database-backup',version:1,projectRef,capturedAt:new Date().toISOString(),schemas,migrations:expected,tables,sequences};
}
export async function restoreAndVerifyLocally(backup,files,progress=(_phase)=>{}) {
  progress("restore-schema");
  if(backup.kind!=='bomedia-private-database-backup' || backup.version!==1 || canonicalJson(backup.schemas)!==canonicalJson(schemas))throw new Error('Unexpected backup');
  const expected=prepareMigrations(files).slice(0,backup.migrations.length).map(({name,checksum})=>({name,checksum}));
  if(canonicalJson(backup.migrations)!==canonicalJson(expected))throw new Error('Use the matching trusted local migrations');
  files=files.filter(file=>expected.some(m=>m.name===file.name));
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; set timezone to UTC');
    await applyMigrations(db,files);
    const target=await metadata(db);
    if(canonicalJson(target)!==canonicalJson(backup.tables.map(({schema,name,columns})=>({schema,name,columns}))))throw new Error('Backup schema mismatch');
    for(const table of backup.tables) {
      if(sha256(canonicalJson(table.rows))!==table.sha256 || table.rows.some(row=>!Array.isArray(row) || row.length!==table.columns.length || row.some(v=>v!==null && typeof v!=='string'))) {
        throw new Error('Backup row integrity mismatch');
      }
    }
    await db.transaction(async tx=>{
      // Fresh local database only. Restore all rows, including immutable posted
      // journals, then revalidate every foreign key before accepting the restore.
      await tx.exec('set local session_replication_role=replica');
      await tx.exec(`truncate ${target.map(tableName).join(',')} restart identity cascade`);
      for(const table of backup.tables) {
        progress(`restore-table:${table.schema}.${table.name}`);
        const current=target.find(t=>t.schema===table.schema && t.name===table.name);
        const columns=current.columns.map(c=>identifier(c.name)).join(',');
        for(let offset=0;offset<table.rows.length;offset+=100) {
          const batch=table.rows.slice(offset,offset+100),values=[];
          const tuples=batch.map(row=>'('+row.map((v,index)=>{values.push(v);return `$${values.length}::${current.columns[index].type}`;}).join(',')+')');
          await tx.query(`insert into ${tableName(current)} (${columns}) overriding system value values ${tuples.join(',')}`,values);
        }
      }
      progress('foreign-keys');
      await tx.exec('set local session_replication_role=origin');
      const keys=(await tx.query(`select n.nspname as schema,c.relname as name,k.conname,pg_get_constraintdef(k.oid) as definition
        from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
        where k.contype='f' and n.nspname in ('bomedia','migration','migration_control') order by n.nspname,c.relname,k.conname`)).rows;
      for(const key of keys) {
        await tx.exec(`alter table ${tableName(key)} drop constraint ${identifier(key.conname)}`);
        await tx.exec(`alter table ${tableName(key)} add constraint ${identifier(key.conname)} ${key.definition} not valid`);
        await tx.exec(`alter table ${tableName(key)} validate constraint ${identifier(key.conname)}`);
      }
      const sequenceNames=(await tx.query(`select schemaname as schema,sequencename as name from pg_sequences
        where schemaname in ('bomedia','migration','migration_control') order by schemaname,sequencename`)).rows;
      if(canonicalJson(sequenceNames)!==canonicalJson(backup.sequences.map(({schema,name})=>({schema,name}))))throw new Error('Sequence mismatch');
      for(const sequence of backup.sequences) {
        if(!/^[0-9]+$/.test(sequence.last_value) || typeof sequence.is_called!=='boolean')throw new Error('Invalid sequence value');
        await tx.query('select setval($1::regclass,$2::bigint,$3::boolean)',[tableName(sequence),sequence.last_value,sequence.is_called]);
      }
    });
    const restored=await captureDatabase(db,files,backup.projectRef);
    if(canonicalJson(restored.tables)!==canonicalJson(backup.tables) || canonicalJson(restored.sequences)!==canonicalJson(backup.sequences))throw new Error('Restored contents differ');
    return {verified:true,tables:backup.tables.length,rows:backup.tables.reduce((n,t)=>n+t.rows.length,0),
      foreignKeysValidated:true,exactValuesVerified:true,localRestoreOnly:true};
  }finally {await db.close();}
}
