import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { ReceiptTemplate } from './receipt-template';
import type { UnifiedRecord } from './manage-sale-action';

it('prints the same job size and quantity shown in customer history', () => {
  const record: UnifiedRecord = {
    id: 'job-1', date: '2026-10-29', type: 'Sale', client: 'Fatty TWS', contact: '',
    description: 'Flex print job', amount: 10800, status: 'Settled', loggedBy: 'Ada',
    isPending: false, balance: 0, material: 'Flex', salesId: 'BOM-20261029-0217',
    raw: { custom: '3x4', QTY: '2' },
  };

  const html = renderToStaticMarkup(createElement(ReceiptTemplate, { records: [record] }));
  expect(html).toContain('Flex print job');
  expect(html).toContain('3 × 4 ft · 2 pieces');
});
