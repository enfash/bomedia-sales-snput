import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CustomerHistoryLimit } from './customer-history-limit';

it('discloses a truncated history and stays quiet when every sale was returned', () => {
  expect(renderToStaticMarkup(createElement(CustomerHistoryLimit, { total: 1200, returned: 1000 }))).toContain('Showing the latest 1000 sales (1200 in total).');
  expect(renderToStaticMarkup(createElement(CustomerHistoryLimit, { total: 1000, returned: 1000 }))).toBe('');
  expect(renderToStaticMarkup(createElement(CustomerHistoryLimit, { total: 0, returned: 0 }))).toBe('');
});
