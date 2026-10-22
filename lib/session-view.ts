// When the app should show its menus, and how to tell that the person's sign-in has ended. Pure: no styling, no data access.

/** The app's menus (sidebar, top bar, bottom bar) belong only to the owner and cashier areas, never to a sign-in page, the public home page or an unknown address. */
export function shellVisible(pathname: string | null | undefined): boolean {
  const path = pathname ?? '';
  if (path === '/bom03/login' || path === '/cashier/login') return false;
  return path === '/bom03' || path === '/cashier' || path.startsWith('/bom03/') || path.startsWith('/cashier/');
}

/** A 401 that means "you are not signed in" (as opposed to "you are signed in but may not do this"). */
export function isSignInRequired(status: number, body: unknown): boolean {
  if (status !== 401 || !body || typeof body !== 'object') return false;
  const { code, error } = body as { code?: unknown; error?: unknown };
  return code === 'SIGN_IN_REQUIRED' || (typeof error === 'string' && /Authenticated session required/i.test(error));
}

/** Where to send someone whose sign-in ended: the sign-in page of the area they were in. */
export const loginFor = (pathname: string | null | undefined) => ((pathname ?? '').startsWith('/bom03') ? '/bom03/login' : '/cashier/login');
