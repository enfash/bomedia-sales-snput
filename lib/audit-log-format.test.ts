import { expect, it } from 'vitest';
import { describeAudit, detailLines, groupByDay, timeLabel, type AuditEntryView } from './audit-log-format';

const entry = (action: string, details: Record<string, unknown> = {}, actor: string | null = 'Amaka', at = '2026-10-10T15:48:00Z'): AuditEntryView =>
  ({ id: action + at, at, action, category: 'other', actor_name: actor, details });

it('writes plain sentences and names the owner for admin actions', () => {
  expect(describeAudit(entry('staff_login'))).toEqual({ who: 'Amaka', text: 'signed in' });
  expect(describeAudit(entry('staff_restore', { admin_identity: 'o@x.test' }, null))).toEqual({ who: 'Owner', text: 'restored a cashier' });
  expect(describeAudit(entry('mystery', {}, null))).toEqual({ who: 'The system', text: 'mystery' });
  expect(describeAudit(entry('some_new_action'))).toEqual({ who: 'Amaka', text: 'some new action' });
  expect(describeAudit(entry('price_decided')).text).toBe('handled a price request');
});
it('names the cashier on staff entries and falls back for older ones', () => {
  expect(describeAudit(entry('staff_restore', { admin_identity: 'o@x.test', name: 'Bisi' }, null)).text).toBe('restored Bisi');
  expect(describeAudit(entry('staff_disable', { name: 'Tunde' }, null)).text).toBe('removed Tunde');
  expect(describeAudit(entry('staff_sign_out', { name: 'Amaka', sessions: 2 }, null)).text).toBe('signed Amaka out of 2 sessions');
  expect(describeAudit(entry('staff_reset', { name: 'Amaka' }, null)).text).toBe('reset the PIN for Amaka');
  expect(describeAudit(entry('staff_create', {}, null)).text).toBe('added a cashier');
  expect(describeAudit(entry('staff_sign_out', {}, null)).text).toBe('signed a cashier out');
  expect(detailLines(entry('staff_restore', { name: 'Bisi', admin_identity: 'o@x.test' }))).toEqual([{ label: 'Done by', value: 'o@x.test' }]);
});
it('puts the amount and method in a payment sentence and counts sessions', () => {
  expect(describeAudit(entry('payment_recorded', { amount_kobo: 2500000, method: 'transfer' })).text).toBe('recorded a payment of ₦25,000 (Transfer)');
  expect(describeAudit(entry('payment_recorded')).text).toBe('recorded a payment');
  expect(describeAudit(entry('staff_sign_out', { sessions: 1 })).text).toBe('signed a cashier out of 1 session');
  expect(describeAudit(entry('staff_single_session', { enabled: false })).text).toBe('turned one device per cashier off');
});
it('lists only the facts present, with readable names', () => {
  expect(detailLines(entry('business_details_saved', { changed: ['phone', 'bank_name'], admin_identity: 'o@x.test' }))).toEqual([
    { label: 'Changed', value: 'Phone, Bank name' }, { label: 'Done by', value: 'o@x.test' }]);
  expect(detailLines(entry('job_status', { from: 'in_progress', to: 'ready' }))).toEqual([{ label: 'Status', value: 'In progress to Ready' }]);
  expect(detailLines(entry('staff_login'))).toEqual([]);
});
it('shows Lagos time and groups by Lagos day', () => {
  expect(timeLabel('2026-10-10T15:48:00Z')).toBe('4:48 pm');
  const now = new Date('2026-10-10T16:30:00Z');
  const groups = groupByDay([entry('a', {}, 'A', '2026-10-10T22:30:00Z'), entry('b', {}, 'A', '2026-10-10T10:00:00Z'), entry('c', {}, 'A', '2026-10-09T10:00:00Z')], now);
  // 22:30 UTC is 11:30 pm Lagos, still Saturday 10 October.
  expect(groups.map((g) => [g.label, g.entries.length])).toEqual([['Today', 2], ['Yesterday', 1]]);
});

it('describes expense category changes by name', () => {
  expect(describeAudit(entry('expense_category_saved', { name: 'Packaging', changed: ['added'], enabled: true })).text).toBe('added the expense category Packaging');
  expect(describeAudit(entry('expense_category_saved', { name: 'Marketing', changed: ['enabled'], enabled: false })).text).toBe('turned the expense category Marketing off');
  expect(describeAudit(entry('expense_category_saved', { name: 'Ink', changed: ['enabled'], enabled: true })).text).toBe('turned the expense category Ink on');
  expect(describeAudit(entry('expense_category_saved', { name: 'Equipment', changed: ['access_owner'], enabled: true })).text).toBe('made the expense category Equipment owner only');
  expect(describeAudit(entry('expense_category_saved', { name: 'Equipment', changed: ['access_everyone'], enabled: true })).text).toBe('let all staff log the expense category Equipment');
  expect(describeAudit(entry('expense_category_saved', { name: 'Equipment', changed: ['access_chosen'], enabled: true })).text).toBe('chose which staff can log the expense category Equipment');
  expect(describeAudit(entry('expense_category_saved')).text).toBe('changed an expense category');
});

it('describes hiding and showing staff in plain words', () => {
  expect(describeAudit(entry('staff_hidden', { admin_identity: 'o@x.test', name: 'Tunde' }, null)).text).toBe('hid Tunde from the staff lists');
  expect(describeAudit(entry('staff_unhidden', { admin_identity: 'o@x.test', name: 'Tunde' }, null)).text).toBe('showed Tunde in the staff lists again');
});

it('says which month the books were closed through', () => {
  expect(describeAudit(entry('books_closed', { to: '2026-10-31' }, null)).text).toBe('closed the books through 31 October 2026');
  expect(describeAudit(entry('books_closed', { to: 'garbage' }, null)).text).toBe('closed the books through a date');
});

it('describes material changes in plain words', () => {
  const text = (action: string, details: Record<string, unknown>) => describeAudit(entry(action, details, null)).text;
  expect(text('material_price_changed', { name: 'Flex', from: '25000', to: '30000' })).toBe('changed the price of Flex from ₦250 to ₦300 per sq ft');
  expect(text('material_price_changed', { name: 'Flex', to: '30050' })).toBe('changed the price of Flex to ₦300.50 per sq ft');
  expect(text('material_price_changed', { name: 'Flex', from: 'bad', to: 'bad' })).toBe('changed the price of Flex to a new price per sq ft');
  expect(text('material_renamed', { from: 'Flex', to: 'Flex Pro' })).toBe('renamed the material Flex to Flex Pro');
  expect(text('material_added', { name: 'Banner', to: '28000' })).toBe('added the material Banner at ₦280 per sq ft');
  expect(text('material_size_added', { name: 'Flex 6 ft' })).toBe('added the size Flex 6 ft');
  expect(text('material_size_saved', { name: 'Flex 10 ft', enabled: false })).toBe('turned off Flex 10 ft');
  expect(text('material_size_saved', { name: 'Flex 10 ft', enabled: true })).toBe('turned on Flex 10 ft');
  expect(text('material_size_saved', { name: 'Flex 10 ft', changed: ['notes'] })).toBe('changed the settings of Flex 10 ft');
  expect(text('customer_updated', { name: 'Grace Chapel', customer: 'CUS-0001', fields: ['contact', 'notes'] })).toBe('changed the phone number and notes of Grace Chapel (CUS-0001)');
  expect(text('approval_requested', { kinds: ['date', 'price'] })).toBe('asked for approval of a sale (a different date and a different price)');
  expect(text('approval_declined', { kinds: ['date'] })).toBe('declined a sale (a different date)');
  expect(text('approval_approved', {})).toBe('approved a sale (needs the owner)');
  expect(text('approval_rule_saved', { kind: 'price', enabled: true })).toBe('turned on approval for a different price');
  expect(text('approval_rule_saved', { kind: 'date', enabled: false })).toBe('turned off approval for a different date');
});
