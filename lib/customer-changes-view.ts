// How the bell reads a customer edit made by staff. Pure helpers: no styling, no data access.
import type { RecentCustomerChange } from './server/customers';

const FIELD: Record<string, string> = { contact: 'phone number', notes: 'notes', name: 'name' };

/** "Ada changed the phone number of Grace Chapel". */
export function changeSentence(change: Pick<RecentCustomerChange, 'by' | 'name' | 'changes'>): string {
  const names = Object.keys(change.changes).map((key) => FIELD[key]).filter(Boolean);
  return `${change.by} changed the ${names.length ? names.join(' and ') : 'details'} of ${change.name}`;
}

/** The phone number change in full ("0803 → 0805"), when there is one: the one detail worth seeing without opening the profile. */
export function phoneDetail(change: Pick<RecentCustomerChange, 'changes'>): string {
  const phone = change.changes.contact;
  return phone ? `${phone.from || 'no number'} → ${phone.to || 'no number'}` : '';
}

/** How many changes are newer than the last time the owner looked. */
export const unseenChanges = (changes: Pick<RecentCustomerChange, 'at'>[], seenAt: string | null) =>
  changes.filter((change) => !seenAt || new Date(change.at).getTime() > new Date(seenAt).getTime()).length;
