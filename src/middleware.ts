import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from './lib/auth0';
import { isAllowedUser, isSameOrigin } from './lib/request-guard';

export async function middleware(request: NextRequest) {
  const authRes = await auth0.middleware(request);

  // Authentication routes — let the Auth0 middleware handle it.
  if (request.nextUrl.pathname.startsWith('/auth')) {
    return authRes;
  }

  const { origin } = new URL(request.url);
  if (!isSameOrigin(request.method, request.headers.get('origin'), process.env.APP_BASE_URL ?? origin)) {
    return NextResponse.json({ ok: false, error: 'cross-origin request refused' }, { status: 403 });
  }

  const session = await auth0.getSession(request);

  // User does not have a session — redirect to login.
  if (!session) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }
  if (!isAllowedUser(session.user.email)) {
    return NextResponse.json({ ok: false, error: 'this account is not allowed' }, { status: 403 });
  }
  return authRes;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|replay).*)'],
};
