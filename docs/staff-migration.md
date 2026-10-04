# Staff migration

Updated 4 October 2026. Staff source records are migrated separately from financial records. The live app still authenticates against Sheets. PostgreSQL server adapters, throttling, revocable sessions and restricted runtime access are implemented and hosted verification passed, but activation/deployment and real-device acceptance remain pending.

## Commands

```sh
npm run migration:rehearse-staff -- rehearsal-20261003-01
npm run migration:import-staff -- rehearsal-20261003-01 --confirm-project <project-ref>
```

The rehearsal uses in-memory PostgreSQL and performs the import twice. Both commands need `MIGRATION_ARCHIVE_PASSPHRASE` privately in `.env.local`; only the hosted command uses the Supabase connection. Never put the passphrase or PINs on the command line.

The CLI checks the snapshot/archive checksums. The importer decrypts the authenticated archive in memory and verifies that its redacted contents reproduce the saved snapshot. Plaintext PINs are neither written to a new file nor passed to PostgreSQL. Only salted hashes are stored in `bomedia.staff`; logs and import evidence contain counts and verification results, not credentials or hashes.

Scrypt uses N=32768, r=8, p=3, a random 16-byte salt and a 32-byte derived key, with constant-time comparison. These parameters follow [OWASP's 32 MiB scrypt option](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). The verifier accepts only this bounded format. Hashing must be paired with login throttling and verified sessions before runtime activation; hashing alone does not prevent online PIN guessing.

## Preserved behavior and safeguards

- Retain the source display name and assign a normalized login name. Collisions require review; accounts are never merged silently.
- Preserve leading-zero text PINs and the legacy leading-apostrophe convention. Missing PINs become null hashes and require a reset before new-system login; they do not grant blank-PIN access.
- Keep historical Online/Offline and last-login/activity values in source staging. Presence does not determine whether an account is enabled, and historical timestamps do not become a fresh session.
- Compare all staged staff cells and source identities before inserting. Refuse preexisting accounts from another source/snapshot.
- Replay verifies the original PIN against the existing hash without changing its salt/hash, account fields or credentials. Changed or disabled accounts cause rollback rather than overwriting.
- Refuse rehearsal import once runtime requests, sessions or login-attempt activity exist. The import takes the shared business-import lock and locks the relevant tables for its pre-cutover checks.
- Retain source/reviewer dispositions. The scoped import evidence is not a blanket resolution of migration issues.

The October 3 snapshot contains two staff accounts, both with a configured PIN. Local rehearsal and hosted import verified both hashes, with zero required resets. Production APIs must return only a `HasPasscode` flag where needed, never plaintext PINs or stored hashes. Session claims/revocation, throttling and restricted database access are implemented. Financial owner-to-staff identity mapping and production activation remain pending.

## Authentication runtime (inactive)

Migration `202610040003_staff_auth.sql` is applied. `bomedia_auth_server` inherits only the seven authentication capabilities, with no direct private-table or financial access. Its credential is saved privately in `.env.local`; production configuration must be set separately.

`AUTH_BACKEND` defaults to `sheets`. The PostgreSQL route path uses HttpOnly signed cookies containing random session secrets, stores only token hashes in the database, checks live revocation/credential/policy state, and fails closed on database failure. PIN reset/disabling revokes sessions. A browser Offline heartbeat changes presence without logging out. New login reservations are limited to five per account per fifteen minutes (successful reservations included); missing-PIN accounts require reset.

Staff management requires the verified configured owner email. Staff-list responses expose only configuration flags, not PINs or hashes. Required physical-device verification fails closed until the external certificate/gateway integration is implemented; leave that policy off meanwhile. Pending offline entries remain local on authorization failure.

Hosted verification exercised the real restricted login with synthetic create/login/reset/disable/logout operations in a rolled-back transaction. Counts and staff revision were unchanged afterward: two real staff, no sessions/login attempts/tickets, no journals/runtime requests. `npm run migration:verify-auth -- --confirm-project <project-ref>` repeats the check without retaining synthetic activity. Do not enable real logins until final rehearsal imports are finished, since runtime activity deliberately blocks those importers.
