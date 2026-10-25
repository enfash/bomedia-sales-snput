import { describe, expect, it } from 'vitest';

import { debtWindows } from './debt-windows';

const now = new Date('2026-10-13T12:00:00');
const sale = (date: string, client: string, total: number, paid: number) => ({ DATE: date, 'CLIENT NAME': client, 'AMOUNT (₦)': String(total), 'INITIAL PAYMENT (₦)': String(paid) });

describe('debtWindows', () => {
  it('splits what is owed into today and the last 7 days', () => {
    const rows = [sale('2026-10-13', 'Grace', 5000, 2000), sale('2026-10-10', 'Adeola', 8000, 0), sale('2026-09-01', 'Old', 9000, 0)];
    const result = debtWindows(rows, now);
    expect(result.today).toBe(3000);
    expect(result.todayCount).toBe(1);
    expect(result.week).toBe(11000);
    expect(result.weekCount).toBe(2);
  });
  it('is zero with nothing owed or no sales', () => {
    expect(debtWindows([], now)).toMatchObject({ today: 0, week: 0 });
    expect(debtWindows([sale('2026-10-13', 'Grace', 5000, 5000)], now).today).toBe(0);
  });
});
