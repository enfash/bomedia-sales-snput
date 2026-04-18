import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const adminCookie = request.cookies.get('admin_session');

  // Paths requiring Admin access
  const isAdminPath = pathname.startsWith('/bom03') && !pathname.startsWith('/bom03/login');
  
  if (isAdminPath && !adminCookie) {
    const loginUrl = new URL('/bom03/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Paths requiring NO Admin access when logged in (redirect back to /bom03)
  if (pathname.startsWith('/bom03/login') && adminCookie) {
    const homeUrl = new URL('/bom03', request.url);
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/bom03/:path*'],
};
