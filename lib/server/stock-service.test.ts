import { describe, expect, it } from 'vitest';
import { FinancialError } from './financial-service';
import { createStockService } from './stock-service';

const actor = { staffId: '11111111-1111-4111-8111-111111111111' };
const rollId = '22222222-2222-4222-8222-222222222222';
const input = { requestId: 'request-one', rollId, lengthFt: '1', reason: 'Synthetic test waste', businessDate: '2026-10-25' };

/** Makes the database reject the write with the given SQLSTATE and message. */
function rejectedWith(code: string, message: string) {
  return createStockService(async () => { throw Object.assign(new Error(message), { code }); });
}

describe('stock writes refused by the database', () => {
  it('reports a date before the books start with its own code', async () => {
    const error = await rejectedWith('23514', 'New accounting requires active books and a date on or after the start')
      .waste(actor, input).catch((cause) => cause);
    expect(error).toBeInstanceOf(FinancialError);
    expect(error).toMatchObject({ status: 409, code: 'STOCK_DATE_BEFORE_BOOKS' });
    expect(error.message).toBe('Stock was not changed. This date is before your books start. Discard this entry and record it again with a later date.');
  });

  it('reports a closed accounting period with its own code', async () => {
    const error = await rejectedWith('23514', 'This accounting period is closed')
      .waste(actor, input).catch((cause) => cause);
    expect(error).toMatchObject({ status: 409, code: 'STOCK_PERIOD_CLOSED' });
  });

  it('keeps the generic review code for other check failures', async () => {
    const error = await rejectedWith('23514', 'some other check failed')
      .waste(actor, input).catch((cause) => cause);
    expect(error).toMatchObject({ status: 409, code: 'STOCK_REVIEW_REQUIRED' });
  });
});
