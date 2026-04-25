import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const adminCookie = request.cookies.get('admin_session');

  // Paths requiring Admin access
  const isAdminPath = pathname.startsWith('/bom03') && !pathname.startsWith('/bom03/login');
  
  if (isAdminPath && !adminCookie) {
    console.log(`[v0] Access denied to ${pathname} - no admin session`);
    const loginUrl = new URL('/bom03/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Paths requiring NO Admin access when logged in (redirect back to /bom03)
  if (pathname.startsWith('/bom03/login') && adminCookie) {
    console.log(`[v0] Authenticated user accessing login - redirecting to /bom03`);
    const homeUrl = new URL('/bom03', request.url);
    return NextResponse.redirect(homeUrl);
  }

  // Security: Prevent access to /new-entry unless authenticated (admin OR cashier)
  if (pathname === '/new-entry' && !adminCookie) {
    // Allow for now - cashiers can create entries without admin auth
    // Future: Could require cashier session here
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/bom03/:path*', '/new-entry'],
};
