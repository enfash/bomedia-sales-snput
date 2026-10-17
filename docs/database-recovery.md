# Private database backup and recovery verification

The backup tool captures only the application-owned `bomedia`, `migration` and `migration_control` schemas through a repeatable-read, read-only transaction. It encrypts the captured table contents, identity-sequence positions and migration checksums with the existing authenticated archive encryption. All column values are exported as text, preserving bigint kobo, decimal stock quantities, timestamps, JSON and nulls exactly.

```sh
npm run migration:backup-db -- postgres-recovery-YYYYMMDD-01 --confirm-project <project-ref>
npm run migration:verify-backup -- postgres-recovery-YYYYMMDD-01
```

Use a new directory name for each capture; an existing directory is never overwritten. Output stays in ignored `migration-data`, with owner-only directory/file permissions. `MIGRATION_ARCHIVE_PASSPHRASE` must be available privately, and its recovery copy must be stored separately from the archive. Do not paste it in chat or commit it.

After saving the encrypted file, the tool reads and decrypts the saved bytes and restores them into a fresh in-memory PostgreSQL engine (PGlite). It applies the matching trusted local migrations, restores all rows including immutable posted journals, revalidates every foreign key, restores identity sequences and compares every exact row value/checksum. Restoration has no remote database parameter and cannot target Supabase. A successful `verification.json` confirms that check; an encrypted file alone does not.

`migration:verify-backup` repeats recovery offline from a completed backup. Older backups use their original migration prefix even after newer migrations are added. Applied migration files must remain immutable and available in source control. Verification results contain only counts, checksums and migration names.

## Boundaries before production

- This is a **local encrypted copy**, not an independent off-device backup. Select a separate storage destination, retention policy and failure-notification process before live accounting.
- Drive receipt file bytes, live Google Sheets edits, unsynced phone queues, database login passwords, deployment secrets, Supabase platform configuration and unrelated schemas are outside this archive. Back those up separately as appropriate.
- The verified local restore does not prove hosted Supabase disaster recovery, permissions provisioning on a replacement project, application acceptance after restoration, or recovery-time targets. Rehearse replacement-project recovery before claiming those checks complete.
- Sequence counters can advance while a read-only snapshot is taken; harmless gaps are retained. Freeze business writes for the final cutover capture and reconcile offline queues.
- Never disable production journal guards or RLS to restore this backup. The current restore implementation is intentionally restricted to its new disposable local database. A hosted recovery procedure still needs explicit target checks and acceptance testing.
