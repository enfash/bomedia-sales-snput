import { expect, it, vi } from 'vitest';
import { migrationTlsOptions } from '../../scripts/migration/migration-tls.mjs';

it('uses default trusted CAs without opening a file when no CA path is supplied', async () => {
  const read = vi.fn();
  expect(await migrationTlsOptions(undefined, read)).toEqual({ rejectUnauthorized: true });
  expect(read).not.toHaveBeenCalled();
});

it('keeps certificate verification with a configured CA and refuses an unreadable configured file', async () => {
  const read = vi.fn().mockResolvedValue('synthetic certificate');
  expect(await migrationTlsOptions('synthetic-ca.pem', read)).toEqual({ rejectUnauthorized: true, ca: 'synthetic certificate' });
  expect(read).toHaveBeenCalledWith('synthetic-ca.pem', 'utf8');
  read.mockRejectedValue(new Error('unreadable'));
  await expect(migrationTlsOptions('synthetic-ca.pem', read)).rejects.toThrow(/unreadable/);
});
