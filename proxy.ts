import { postgresAuthEnabled } from './lib/server/auth-backend';
import { postgresAuth } from './lib/server/postgres-auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/auth-utils';
import { checkOwner, needsCheck, ownerCookieOptions, withinGrace } from './lib/server/admin-session';

const SHORT_LINKS = ['/board', '/estimator', '/new-entry', '/quick-check'];

// Owner sign-ins made through Supabase are re-confirmed every few minutes (see lib/server/admin-session.ts). A deleted or banned owner is
// signed out within minutes; if Supabase simply cannot be reached the owner stays in for a short grace period.
export async function proxy(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value;
  const payload = token ? await verifyToken(token) : null;
  let renewed: string | undefined;
  let revoked = false;
  let allowed = true;
  if (payload && payload.role === 'admin' && needsCheck(payload)) {
    const verdict = await checkOwner(payload);
    if (verdict.revoked) { revoked = true; allowed = false; }
    else if (verdict.cookie) renewed = verdict.cookie;
    else if (!withinGrace(payload)) allowed = false;
  }
  const response = await route(request, allowed ? renewed : undefined, allowed);
  if (renewed && allowed) response.cookies.set('admin_session', renewed, ownerCookieOptions);
  if (revoked) response.cookies.delete('admin_session');
  return response;
}

async function route(request: NextRequest, renewedCookie: string | undefined, adminAllowed: boolean) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  const adminCookie = request.cookies.get('admin_session')?.value;
  const cashierCookie = request.cookies.get('cashier_session')?.value;

  // Cryptographically decode and verify signatures
  const adminPayload = adminAllowed && adminCookie ? await verifyToken(adminCookie) : null;
  const cashierPayload = cashierCookie ? await verifyToken(cashierCookie) : null;

  const isAdmin = adminPayload && adminPayload.role === 'admin';
  let isCashier = !!(cashierPayload && cashierPayload.role === 'cashier');
  try {
    if (postgresAuthEnabled() && isCashier && !isAdmin) {
      isCashier = !!await postgresAuth.session(cashierCookie);
    }
  } catch {
    return NextResponse.json({ error: 'Authentication service is unavailable. Pending entries remain on this device.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  // 0. Old short links (/board, /estimator, /new-entry, /quick-check) go straight to the right area before anything is drawn. The
  // area's own guard then asks for sign-in if needed. (They used to render inside the app's menus and decide from localStorage.)
  if (SHORT_LINKS.includes(pathname)) {
    return NextResponse.redirect(new URL(`${isAdmin ? '/bom03' : '/cashier'}${pathname}`, request.url));
  }

  // 1. ADMIN PATHS ROUTING GUARD (/bom03)
  if (pathname.startsWith('/bom03')) {
    const isLoginPath = pathname.startsWith('/bom03/login');
    
    if (!isLoginPath && !isAdmin) {
      const response = NextResponse.redirect(new URL('/bom03/login', request.url));
      // Delete any compromised or expired cookie
      response.cookies.delete('admin_session');
      return response;
    }
    
    if (isLoginPath && isAdmin) {
      return NextResponse.redirect(new URL('/bom03', request.url));
    }
  }

  // 2. CASHIER PATHS ROUTING GUARD (/cashier)
  if (pathname.startsWith('/cashier')) {
    const isLoginPath = pathname.startsWith('/cashier/login');
    
    if (!isLoginPath && !isCashier && !isAdmin) {
      const response = NextResponse.redirect(new URL('/cashier/login', request.url));
      response.cookies.delete('cashier_session');
      return response;
    }

    if (isLoginPath && (isCashier || isAdmin)) {
      return NextResponse.redirect(new URL('/cashier', request.url));
    }
  }

  // 3. BACKEND API PROTECTION (/api)
  if (pathname.startsWith('/api')) {
    // Exempt routes:
    // - /api/auth/:path* (handles authentication POST login, logout)
    // - /api/cashiers for GET and PATCH only (to let login screen load names and cashier update heartbeats)
    const isAuthApi = pathname.startsWith('/api/auth');
    const isPublicCashierApi = (pathname === '/api/cashiers' || pathname === '/api/cashiers/') && (method === 'GET' || method === 'PATCH');

    if (!isAuthApi && !isPublicCashierApi) {
      // Admin-only protection for adding or deleting users
      if (pathname.startsWith('/api/cashiers') && (pathname.startsWith('/api/cashiers/access') || method === 'POST' || method === 'DELETE')) {
        if (!isAdmin) {
          return new NextResponse(
            JSON.stringify({ error: 'Unauthorized. Admin session required.' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } else {
        // Enforce either valid cashier or admin session for business data operations
        if (!isAdmin && !isCashier) {
          return new NextResponse(
            JSON.stringify({ error: 'Unauthorized. Authenticated session required.' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }
  }

  if (renewedCookie) {
    // Routes in this same request must see the renewed cookie too, not the old one.
    const headers = new Headers(request.headers);
    const others = (headers.get('cookie') ?? '').split(/;\s*/).filter((part) => part && !part.startsWith('admin_session='));
    headers.set('cookie', [...others, `admin_session=${renewedCookie}`].join('; '));
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/board',
    '/estimator',
    '/new-entry',
    '/quick-check',
    '/bom03/:path*',
    '/cashier/:path*',
    '/api/:path*',
  ],
};
