import { describe, expect, it, vi } from 'vitest';
import { createBookkeepingPeriod } from './bookkeeping-period';
import { FinancialError } from './financial-service';

const actor = { staffId: '00000000-0000-4000-8000-0000000000AA' };
const valid = { requestId: 'req-1', through: '2026-10-31' };

describe('closing the books', () => {
  it('sends the lower-cased owner identity and the chosen month-end', async () => {
    const call = vi.fn().mockResolvedValue({ closed_through: '2026-10-31' });
    expect(await createBookkeepingPeriod(call).close(actor, { ...valid, requestId: ' req-1 ' })).toEqual({ closed_through: '2026-10-31' });
    expect(call).toHaveBeenCalledWith('api_close_books', 'req-1', { actor_id: actor.staffId.toLowerCase(), through: '2026-10-31' });
  });

  it('validates before touching the database', async () => {
    const call = vi.fn();
    const service = createBookkeepingPeriod(call);
    for (const input of [null, [], {}, { ...valid, extra: 1 }, { ...valid, requestId: '' }, { ...valid, through: 'yesterday' }, { ...valid, through: 20261031 }])
      await expect(service.close(actor, input)).rejects.toMatchObject({ status: 400 });
    await expect(service.close({ staffId: 'not-an-id' }, valid)).rejects.toMatchObject({ status: 403 });
    expect(call).not.toHaveBeenCalled();
  });

  it('turns database refusals into plain messages without leaking details', async () => {
    const refuse = (code: string) => createBookkeepingPeriod(vi.fn().mockRejectedValue(Object.assign(new Error('raw sql detail'), { code }))).close(actor, valid);
    await expect(refuse('22023')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('can no longer be closed') });
    await expect(refuse('23514')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('not active') });
    await expect(refuse('42501')).rejects.toMatchObject({ status: 403 });
    await expect(refuse('XX000')).rejects.toThrow('raw sql detail');
  });
});

it('reads the period through the database function', async () => {
  const call = vi.fn().mockResolvedValue({ configured: false, today: '2026-10-11' });
  expect(await createBookkeepingPeriod(call).read()).toEqual({ configured: false, today: '2026-10-11' });
  expect(call).toHaveBeenCalledWith('api_bookkeeping_period', 'current', {});
});

it('shows staff plain words when a date falls in a closed period', () => {
  expect(new FinancialError('This accounting period is closed', 409, 'X').message).toBe('That date is in a closed bookkeeping period. Ask the owner.');
  expect(new FinancialError('Anything else stays as written', 400, 'X').message).toBe('Anything else stays as written');
});
