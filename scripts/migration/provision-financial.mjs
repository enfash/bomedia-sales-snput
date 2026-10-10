// Reuse the credential-safe provisioner with an explicit capability allowlist.
process.argv.push('--financial');
await import('./provision-auth.mjs');
