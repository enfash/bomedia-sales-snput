import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/auth-utils';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  const adminCookie = request.cookies.get('admin_session')?.value;
  const cashierCookie = request.cookies.get('cashier_session')?.value;

  // Cryptographically decode and verify signatures
  const adminPayload = adminCookie ? await verifyToken(adminCookie) : null;
  const cashierPayload = cashierCookie ? await verifyToken(cashierCookie) : null;

  const isAdmin = adminPayload && adminPayload.role === 'admin';
  const isCashier = cashierPayload && cashierPayload.role === 'cashier';

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
    const isPublicCashierApi = pathname.startsWith('/api/cashiers') && (method === 'GET' || method === 'PATCH');

    if (!isAuthApi && !isPublicCashierApi) {
      // Admin-only protection for adding or deleting users
      if (pathname.startsWith('/api/cashiers') && (method === 'POST' || method === 'DELETE')) {
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/bom03/:path*',
    '/cashier/:path*',
    '/api/:path*',
  ],
};
