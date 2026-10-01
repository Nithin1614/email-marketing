import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  const isLoginPage = request.nextUrl.pathname === '/login';

  const isStaticAsset = 
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/static') ||
    request.nextUrl.pathname.includes('.') ||
    request.nextUrl.pathname === '/favicon.ico';

  if (isStaticAsset) {
    return NextResponse.next();
  }

  const isPublicPage = request.nextUrl.pathname.startsWith('/public/');

  const isAuthenticated = Boolean(token && token !== 'preview_token');

  // Enforce authentication: unauthenticated users are redirected to /login
  if (!isAuthenticated && !isLoginPage && !isPublicPage) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If already authenticated and trying to access /login, redirect to dashboard
  if (isAuthenticated && isLoginPage) {
    const dashboardUrl = new URL('/', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}
