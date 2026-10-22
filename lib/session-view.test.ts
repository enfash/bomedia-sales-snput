import { describe, expect, it } from 'vitest';

import { isSignInRequired, loginFor, shellVisible } from './session-view';

describe('session helpers', () => {
  it('shows the menus only inside the owner and cashier areas, never on sign-in, home or unknown pages', () => {
    for (const path of ['/bom03', '/bom03/records', '/cashier', '/cashier/records', '/cashier/alerts']) expect(shellVisible(path)).toBe(true);
    for (const path of ['/', '/bom03/login', '/cashier/login', '/foo', '/board', '/bom03x', '', null, undefined]) expect(shellVisible(path)).toBe(false);
  });
  it('recognises "not signed in" but not "not allowed"', () => {
    expect(isSignInRequired(401, { error: 'Unauthorized. Authenticated session required.' })).toBe(true);
    expect(isSignInRequired(401, { error: 'Please sign in again.', code: 'SIGN_IN_REQUIRED' })).toBe(true);
    expect(isSignInRequired(401, { error: 'Unauthorized. Admin session required.' })).toBe(false);
    expect(isSignInRequired(401, null)).toBe(false);
    expect(isSignInRequired(403, { code: 'SIGN_IN_REQUIRED' })).toBe(false);
    expect(isSignInRequired(200, { code: 'SIGN_IN_REQUIRED' })).toBe(false);
  });
  it('sends each area to its own sign-in page', () => {
    expect(loginFor('/bom03/records')).toBe('/bom03/login');
    expect(loginFor('/cashier/records')).toBe('/cashier/login');
    expect(loginFor('/')).toBe('/cashier/login');
  });
});
